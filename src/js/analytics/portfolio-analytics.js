import { exitRepository } from "../data/exit-repository.js";
import { portfolioRepository } from "../data/portfolio-repository.js";
import { resolvePortfolioColumnMap } from "../data/portfolio-schema-service.js";
import { positionRepository } from "../data/position-repository.js";
import { strategyRepository } from "../data/strategy-repository.js";
import { tradeRepository } from "../data/trade-repository.js";
import { enrichOpenPositionsWithCurrentPricing } from "./open-position-pricing.js";

const INITIAL_CAPITAL = 1000000;

export async function summarizePortfolio() {
  const [trades, exits, positions, strategies] = await Promise.all([
    tradeRepository.listTrades({ limit: 3000 }),
    exitRepository.listExits({ limit: 4000 }),
    positionRepository.listPositions({ limit: 3000 }),
    strategyRepository.listStrategies()
  ]);

  const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const positionMap = new Map(positions.map((position) => [position.trade_id, position]));
  const exitMap = exits.reduce((map, exitRow) => {
    const rows = map.get(exitRow.trade_id) || [];
    rows.push(exitRow);
    map.set(exitRow.trade_id, rows);
    return map;
  }, new Map());

  const closedTrades = trades
    .map((trade) => buildClosedTradeAnalytics(trade, positionMap.get(trade.id), exitMap.get(trade.id) || [], strategyMap))
    .filter(Boolean)
    .sort((left, right) => String(left.lastExitDate).localeCompare(String(right.lastExitDate)));

  const derivedDailyPnlMap = closedTrades.reduce((map, trade) => {
    const current = map.get(trade.lastExitDate) || 0;
    map.set(trade.lastExitDate, current + trade.realizedPnl);
    return map;
  }, new Map());

  const derivedEquityCurve = buildEquityCurveFromDailyPnlMap(derivedDailyPnlMap);
  const openPositionMarkToMarket = await buildOpenPositionMarkToMarket(trades, positions, strategyMap);
  const portfolioSync = await syncPortfolioSnapshots(derivedEquityCurve);
  const mtmSync = await syncEndOfDayOpenPnlSnapshot(derivedEquityCurve, openPositionMarkToMarket);
  const trackedEquityCurve = await loadTrackedEquityCurve();
  const baseEquityCurve = trackedEquityCurve.length > 0 ? trackedEquityCurve : derivedEquityCurve;
  const shouldUseTrackedCurveDirectly = trackedEquityCurve.length > 0
    && (mtmSync.stored || !openPositionMarkToMarket.appliedToEquityCurve);
  const equityCurve = shouldUseTrackedCurveDirectly
    ? baseEquityCurve
    : appendEndOfDayOpenPnlSnapshot(baseEquityCurve, openPositionMarkToMarket.totalUnrealizedPnl);

  const tradeSummary = buildTradeSummary(closedTrades, equityCurve);
  const strategyPerformance = buildStrategyPerformance(closedTrades);
  const exposure = buildExposureSnapshot(trades, positions, strategyMap);

  return {
    initialCapital: INITIAL_CAPITAL,
    closedTrades,
    equityCurve,
    drawdown: equityCurve.map((point) => ({
      date: point.date,
      capital: point.capital,
      drawdownValue: point.drawdownValue,
      drawdownPercent: point.drawdownPercent
    })),
    portfolioTracking: {
      source: trackedEquityCurve.length > 0 ? "portfolio_table" : "derived",
      syncStatus: portfolioSync.status,
      endOfDayMtmApplied: mtmSync.applied || openPositionMarkToMarket.appliedToEquityCurve,
      mtmStored: mtmSync.stored,
      openUnrealizedPnl: openPositionMarkToMarket.totalUnrealizedPnl
    },
    strategyPerformance,
    exposure,
    tradeSummary,
    recentClosedTrades: [...closedTrades]
      .sort((left, right) => String(right.lastExitDate).localeCompare(String(left.lastExitDate)))
      .slice(0, 12)
  };
}

function buildClosedTradeAnalytics(trade, position, exits, strategyMap) {
  if (!trade || exits.length === 0) {
    return null;
  }

  const initialQty = Number(trade.qty || 0);
  const exitedQty = exits.reduce((total, row) => total + Number(row.qty || 0), 0);
  const remainingQty = Number(position?.remaining_qty ?? Math.max(initialQty - exitedQty, 0));

  if (initialQty <= 0 || remainingQty > 0 || exitedQty < initialQty) {
    return null;
  }

  const weightedExitValue = exits.reduce((total, row) => {
    return total + Number(row.qty || 0) * Number(row.exit_price || 0);
  }, 0);

  const averageExitPrice = exitedQty > 0 ? weightedExitValue / exitedQty : 0;
  const entryPrice = Number(trade.entry_price || 0);
  const realizedPnl = trade.action === "Short"
    ? (entryPrice - averageExitPrice) * exitedQty
    : (averageExitPrice - entryPrice) * exitedQty;
  const strategy = trade.strategy_id ? strategyMap.get(trade.strategy_id) : null;
  const lastExitDate = exits
    .map((row) => row.exit_date)
    .filter(Boolean)
    .sort()
    .at(-1) || "-";

  return {
    tradeId: trade.id,
    strategyId: trade.strategy_id || null,
    strategyName: strategy?.strategy_name || "-",
    symbol: trade.symbol || "-",
    action: trade.action || "-",
    instrument: trade.instrument || "-",
    optionType: trade.option_type || "-",
    expiry: trade.expiry || "-",
    strike: trade.strike ?? "-",
    tradeDate: trade.trade_date || "-",
    lastExitDate,
    qty: initialQty,
    entryPrice,
    averageExitPrice,
    tag: trade.tag || "-",
    notes: trade.notes || "",
    exitCount: exits.length,
    realizedPnl,
    outcome: realizedPnl > 0 ? "win" : realizedPnl < 0 ? "loss" : "flat"
  };
}

function buildTradeSummary(closedTrades, equityCurve) {
  const totalRealizedPnl = closedTrades.reduce((total, trade) => total + trade.realizedPnl, 0);
  const winCount = closedTrades.filter((trade) => trade.realizedPnl > 0).length;
  const lossCount = closedTrades.filter((trade) => trade.realizedPnl < 0).length;
  const flatCount = closedTrades.filter((trade) => trade.realizedPnl === 0).length;
  const averagePnl = closedTrades.length > 0 ? totalRealizedPnl / closedTrades.length : 0;
  const bestTrade = closedTrades.reduce((best, trade) => {
    return !best || trade.realizedPnl > best.realizedPnl ? trade : best;
  }, null);
  const worstTrade = closedTrades.reduce((worst, trade) => {
    return !worst || trade.realizedPnl < worst.realizedPnl ? trade : worst;
  }, null);
  const maxDrawdownPercent = equityCurve.reduce((lowest, point) => Math.min(lowest, point.drawdownPercent), 0);
  const endingCapital = equityCurve.length > 0 ? equityCurve.at(-1).capital : INITIAL_CAPITAL;

  return {
    closedCount: closedTrades.length,
    totalRealizedPnl,
    winCount,
    lossCount,
    flatCount,
    winRate: closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0,
    averagePnl,
    bestTrade,
    worstTrade,
    maxDrawdownPercent,
    endingCapital
  };
}

function buildEquityCurveFromDailyPnlMap(dailyPnlMap) {
  let runningCapital = INITIAL_CAPITAL;
  let peakCapital = INITIAL_CAPITAL;

  return [...dailyPnlMap.entries()]
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .map(([date, pnl]) => {
      runningCapital += pnl;
      peakCapital = Math.max(peakCapital, runningCapital);
      const drawdownValue = runningCapital - peakCapital;
      const drawdownPercent = peakCapital > 0 ? (drawdownValue / peakCapital) * 100 : 0;

      return {
        date,
        dailyPnl: pnl,
        capital: runningCapital,
        drawdownValue,
        drawdownPercent
      };
    });
}

async function buildOpenPositionMarkToMarket(trades, positions, strategyMap) {
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]));
  const openPositions = positions
    .filter((position) => Number(position.remaining_qty || 0) > 0)
    .map((position) => {
      const trade = tradeMap.get(position.trade_id);
      const strategy = trade?.strategy_id ? strategyMap.get(trade.strategy_id) : null;

      return {
        id: position.id,
        tradeId: position.trade_id,
        remainingQty: Number(position.remaining_qty || 0),
        initialQty: Number(trade?.qty || 0),
        symbol: trade?.symbol || "-",
        action: trade?.action || "-",
        instrument: trade?.instrument || "-",
        expiry: trade?.expiry || "-",
        strike: trade?.strike ?? "-",
        optionType: trade?.option_type || "-",
        entryPrice: trade?.entry_price ?? "-",
        entryIv: trade?.entry_iv ?? "-",
        tradeDate: trade?.trade_date || "-",
        tag: trade?.tag || "-",
        notes: trade?.notes || "",
        strategyName: strategy?.strategy_name || "-"
      };
    });

  const pricedPositions = await enrichOpenPositionsWithCurrentPricing(openPositions);

  return {
    positions: pricedPositions,
    totalUnrealizedPnl: pricedPositions.reduce((total, position) => total + Number(position.unrealizedPnl || 0), 0),
    appliedToEquityCurve: shouldAppendEndOfDayOpenPnl() && pricedPositions.length > 0
  };
}

function appendEndOfDayOpenPnlSnapshot(equityCurve, totalUnrealizedPnl) {
  if (!shouldAppendEndOfDayOpenPnl()) {
    return equityCurve;
  }

  const today = getTodayIsoDate();
  const normalizedCurve = [...equityCurve];
  const basePoint = normalizedCurve.length > 0
    ? normalizedCurve.at(-1)
    : {
        date: today,
        capital: INITIAL_CAPITAL,
        dailyPnl: 0,
        drawdownValue: 0,
        drawdownPercent: 0
      };
  const mtmPoint = {
    date: today,
    capital: basePoint.capital + totalUnrealizedPnl,
    dailyPnl: (basePoint.date === today ? basePoint.dailyPnl : 0) + totalUnrealizedPnl
  };

  if (normalizedCurve.length === 0) {
    return buildEquityCurveFromDailyPnlMap(new Map([[today, mtmPoint.dailyPnl]]));
  }

  if (basePoint.date === today) {
    normalizedCurve[normalizedCurve.length - 1] = mtmPoint;
  } else {
    normalizedCurve.push(mtmPoint);
  }

  return rebuildDrawdownCurve(normalizedCurve);
}

async function syncEndOfDayOpenPnlSnapshot(baseEquityCurve, openPositionMarkToMarket) {
  if (!openPositionMarkToMarket.appliedToEquityCurve) {
    return { applied: false, stored: false };
  }

  try {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date || !columnMap.capital || !columnMap.source) {
      return { applied: true, stored: false };
    }

    const today = getTodayIsoDate();
    const baseCapital = baseEquityCurve.length > 0 ? Number(baseEquityCurve.at(-1).capital || INITIAL_CAPITAL) : INITIAL_CAPITAL;
    const todayRows = await portfolioRepository.findByDate(today);
    const existingMtmRow = todayRows.find((row) => isMtmPortfolioRow(row, columnMap));
    const payload = mapPortfolioPayload({
      date: today,
      capital: baseCapital + openPositionMarkToMarket.totalUnrealizedPnl,
      dailyPnl: openPositionMarkToMarket.totalUnrealizedPnl
    }, columnMap, "trade_journal_mtm");

    if (existingMtmRow) {
      await portfolioRepository.updateSnapshot(buildPortfolioMatcher(existingMtmRow, today, columnMap), payload);
      return { applied: true, stored: true };
    }

    await portfolioRepository.createSnapshot(payload);
    return { applied: true, stored: true };
  } catch {
    return { applied: true, stored: false };
  }
}

function rebuildDrawdownCurve(points) {
  let peakCapital = INITIAL_CAPITAL;

  return points.map((point) => {
    peakCapital = Math.max(peakCapital, point.capital);
    const drawdownValue = point.capital - peakCapital;
    const drawdownPercent = peakCapital > 0 ? (drawdownValue / peakCapital) * 100 : 0;

    return {
      ...point,
      drawdownValue,
      drawdownPercent
    };
  });
}

async function syncPortfolioSnapshots(equityCurve) {
  try {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date || !columnMap.capital) {
      return { status: "schema_not_compatible" };
    }

    const existingRows = await portfolioRepository.listSnapshots();
    await prunePortfolioSnapshots(existingRows, equityCurve, columnMap);

    for (const point of equityCurve) {
      const payload = mapPortfolioPayload(point, columnMap, "trade_journal_realized");
      const existingRowsForDate = await portfolioRepository.findByDate(point.date);
      const existingRealizedRow = existingRowsForDate.find((row) => isRealizedPortfolioRow(row, columnMap));

      if (!existingRealizedRow) {
        await portfolioRepository.createSnapshot(payload);
        continue;
      }

      const matcher = buildPortfolioMatcher(existingRealizedRow, point.date, columnMap);
      await portfolioRepository.updateSnapshot(matcher, payload);
    }

    return { status: "synced" };
  } catch {
    return { status: "fallback_only" };
  }
}

async function prunePortfolioSnapshots(existingRows, equityCurve, columnMap) {
  const activeDates = new Set(equityCurve.map((point) => point.date));
  const managedRows = existingRows.filter((row) => isRealizedPortfolioRow(row, columnMap));

  for (const row of managedRows) {
    const rowDate = row[columnMap.date];

    if (!rowDate || activeDates.has(rowDate)) {
      continue;
    }

    const matcher = buildPortfolioMatcher(row, rowDate, columnMap);
    await portfolioRepository.deleteSnapshots(matcher);
  }
}

async function loadTrackedEquityCurve() {
  try {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date || !columnMap.capital) {
      return [];
    }

    const rows = await portfolioRepository.listSnapshots();
    const normalizedRows = normalizeTrackedPortfolioRows(rows, columnMap);

    let peakCapital = INITIAL_CAPITAL;

    return normalizedRows.map((row) => {
      peakCapital = Math.max(peakCapital, row.capital);
      const drawdownValue = row.capital - peakCapital;
      const drawdownPercent = peakCapital > 0 ? (drawdownValue / peakCapital) * 100 : 0;

      return {
        date: row.date,
        capital: row.capital,
        dailyPnl: row.dailyPnl,
        drawdownValue,
        drawdownPercent
      };
    });
  } catch {
    return [];
  }
}

function mapPortfolioPayload(point, columnMap, sourceValue = "trade_journal") {
  const payload = {};

  payload[columnMap.date] = point.date;
  payload[columnMap.capital] = point.capital;

  if (columnMap.realized_pnl) {
    payload[columnMap.realized_pnl] = point.dailyPnl;
  }

  if (columnMap.closed_count) {
    payload[columnMap.closed_count] = 1;
  }

  if (columnMap.source) {
    payload[columnMap.source] = sourceValue;
  }

  return payload;
}

function buildPortfolioMatcher(row, date, columnMap) {
  if (columnMap.id && typeof row[columnMap.id] !== "undefined" && row[columnMap.id] !== null) {
    return { [columnMap.id]: row[columnMap.id] };
  }

  return { [columnMap.date]: date };
}

function isManagedPortfolioRow(row, columnMap) {
  if (!columnMap.source) {
    return true;
  }

  return String(row[columnMap.source] || "").startsWith("trade_journal");
}

function isRealizedPortfolioRow(row, columnMap) {
  if (!columnMap.source) {
    return true;
  }

  const source = String(row[columnMap.source] || "");
  return source === "trade_journal" || source === "trade_journal_realized";
}

function isMtmPortfolioRow(row, columnMap) {
  if (!columnMap.source) {
    return false;
  }

  return String(row[columnMap.source] || "") === "trade_journal_mtm";
}

function normalizeTrackedPortfolioRows(rows, columnMap) {
  const rowsByDate = new Map();

  rows
    .filter((row) => isManagedPortfolioRow(row, columnMap))
    .forEach((row) => {
      const date = row[columnMap.date];
      const capital = Number(row[columnMap.capital] || 0);

      if (!date || !Number.isFinite(capital)) {
        return;
      }

      const normalizedRow = {
        date,
        capital,
        dailyPnl: columnMap.realized_pnl ? Number(row[columnMap.realized_pnl] || 0) : 0,
        source: columnMap.source ? String(row[columnMap.source] || "") : "trade_journal"
      };
      const existing = rowsByDate.get(date);

      if (!existing || isMtmPortfolioRow(row, columnMap)) {
        rowsByDate.set(date, normalizedRow);
      }
    });

  return [...rowsByDate.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function buildStrategyPerformance(closedTrades) {
  const groups = closedTrades.reduce((map, trade) => {
    const key = trade.strategyName || "-";
    const rows = map.get(key) || [];
    rows.push(trade);
    map.set(key, rows);
    return map;
  }, new Map());

  return [...groups.entries()]
    .map(([name, trades]) => {
      const pnl = trades.reduce((total, trade) => total + trade.realizedPnl, 0);
      const winCount = trades.filter((trade) => trade.realizedPnl > 0).length;
      const averagePnl = trades.length > 0 ? pnl / trades.length : 0;
      const symbols = [...new Set(trades.map((trade) => trade.symbol).filter(Boolean))];
      const lastExitDate = trades
        .map((trade) => trade.lastExitDate)
        .filter(Boolean)
        .sort()
        .at(-1) || "-";

      return {
        name,
        tradeCount: trades.length,
        pnl,
        winCount,
        lossCount: trades.filter((trade) => trade.realizedPnl < 0).length,
        winRate: trades.length > 0 ? (winCount / trades.length) * 100 : 0,
        averagePnl,
        symbols,
        lastExitDate
      };
    })
    .sort((left, right) => right.pnl - left.pnl || right.tradeCount - left.tradeCount || left.name.localeCompare(right.name));
}

function shouldAppendEndOfDayOpenPnl() {
  const marketClose = window.TRADE_JOURNAL_CONFIG?.optionPricing?.marketCloseTime || {};
  const closeHour = Number(marketClose.hour);
  const closeMinute = Number(marketClose.minute);
  const now = new Date();
  const hour = Number.isFinite(closeHour) ? closeHour : 15;
  const minute = Number.isFinite(closeMinute) ? closeMinute : 30;

  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

function getTodayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function buildExposureSnapshot(trades, positions, strategyMap) {
  const positionMap = new Map(positions.map((position) => [position.trade_id, position]));
  const openTrades = trades.filter((trade) => Number(positionMap.get(trade.id)?.remaining_qty || 0) > 0);

  const bySymbol = groupExposure(openTrades, (trade) => trade.symbol || "-", positionMap);
  const byInstrument = groupExposure(openTrades, (trade) => trade.instrument || "-", positionMap);
  const byStrategy = groupExposure(openTrades, (trade) => {
    const strategy = trade.strategy_id ? strategyMap.get(trade.strategy_id) : null;
    return strategy?.strategy_name || "-";
  }, positionMap);

  return { bySymbol, byInstrument, byStrategy };
}

function groupExposure(trades, getKey, positionMap) {
  const totalOpenValue = trades.reduce((total, trade) => {
    const remainingQty = Number(positionMap.get(trade.id)?.remaining_qty || 0);
    return total + remainingQty * Number(trade.entry_price || 0);
  }, 0);

  return [...trades.reduce((map, trade) => {
    const key = getKey(trade);
    const current = map.get(key) || { name: key, openValue: 0, remainingQty: 0, tradeCount: 0 };
    const remainingQty = Number(positionMap.get(trade.id)?.remaining_qty || 0);
    current.openValue += remainingQty * Number(trade.entry_price || 0);
    current.remainingQty += remainingQty;
    current.tradeCount += 1;
    map.set(key, current);
    return map;
  }, new Map()).values()]
    .map((item) => ({
      ...item,
      share: totalOpenValue > 0 ? (item.openValue / totalOpenValue) * 100 : 0
    }))
    .sort((left, right) => right.openValue - left.openValue);
}
