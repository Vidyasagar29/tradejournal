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

  const derivedRealizedPnlMap = closedTrades.reduce((map, trade) => {
    const current = map.get(trade.lastExitDate) || 0;
    map.set(trade.lastExitDate, current + trade.realizedPnl);
    return map;
  }, new Map());

  const derivedEquityCurve = buildEquityCurveFromRealizedPnlMap(derivedRealizedPnlMap);
  const openPositionMarkToMarket = await buildOpenPositionMarkToMarket(trades, positions, strategyMap);
  const portfolioSync = await syncPortfolioSnapshots(derivedEquityCurve);
  const trackedPortfolio = await loadTrackedPortfolio();
  const equityCurve = trackedPortfolio.curve.length > 0 ? trackedPortfolio.curve : derivedEquityCurve;

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
      source: trackedPortfolio.curve.length > 0 ? "portfolio_table" : "derived",
      syncStatus: portfolioSync.status,
      endOfDayMtmApplied: trackedPortfolio.hasStoredMtm,
      mtmStored: trackedPortfolio.hasStoredMtm,
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

function buildEquityCurveFromRealizedPnlMap(realizedPnlMap) {
  let runningCapital = INITIAL_CAPITAL;
  let peakCapital = INITIAL_CAPITAL;

  return [...realizedPnlMap.entries()]
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .map(([date, realizedDailyPnl]) => {
      runningCapital += realizedDailyPnl;
      peakCapital = Math.max(peakCapital, runningCapital);
      const drawdownValue = runningCapital - peakCapital;
      const drawdownPercent = peakCapital > 0 ? (drawdownValue / peakCapital) * 100 : 0;

      return {
        date,
        realizedDailyPnl,
        dailyPnl: realizedDailyPnl,
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
    totalUnrealizedPnl: pricedPositions.reduce((total, position) => total + Number(position.unrealizedPnl || 0), 0)
  };
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
      return { status: "portfolio_schema_missing" };
    }

    for (const point of equityCurve) {
      const existingRowsForDate = await portfolioRepository.findByDate(point.date);
      const existingPortfolioRow = selectPortfolioRowForDate(existingRowsForDate, columnMap);
      const payload = mapPortfolioPayload(point, columnMap, existingPortfolioRow);

      if (!existingPortfolioRow) {
        await portfolioRepository.createSnapshot(payload);
        continue;
      }

      const matcher = buildPortfolioMatcher(existingPortfolioRow, point.date, columnMap);
      await portfolioRepository.updateSnapshot(matcher, payload);
    }

    return { status: "synced" };
  } catch {
    return { status: "calculated_trade_data_only" };
  }
}

async function loadTrackedPortfolio() {
  try {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date || !columnMap.capital) {
      return { curve: [], hasStoredMtm: false };
    }

    const rows = await portfolioRepository.listSnapshots();
    const normalizedRows = normalizeTrackedPortfolioRows(rows, columnMap);

    let peakCapital = INITIAL_CAPITAL;
    const curve = normalizedRows.map((row) => {
      peakCapital = Math.max(peakCapital, row.capital);
      const drawdownValue = row.capital - peakCapital;
      const drawdownPercent = peakCapital > 0 ? (drawdownValue / peakCapital) * 100 : 0;

      return {
        date: row.date,
        capital: row.capital,
        realizedDailyPnl: row.realizedDailyPnl,
        unrealizedPnl: row.unrealizedPnl,
        dailyPnl: row.realizedDailyPnl,
        drawdownValue,
        drawdownPercent
      };
    });
    const hasStoredMtm = normalizedRows.some((row) => Number(row.unrealizedPnl || 0) !== 0);

    return { curve, hasStoredMtm };
  } catch {
    return { curve: [], hasStoredMtm: false };
  }
}

function mapPortfolioPayload(point, columnMap, existingRow = null) {
  const payload = {};
  const unrealizedPnl = resolveExistingUnrealizedPnl(existingRow, columnMap);

  payload[columnMap.date] = point.date;
  payload[columnMap.capital] = point.capital + unrealizedPnl;

  if (columnMap.realized_pnl) {
    payload[columnMap.realized_pnl] = point.realizedDailyPnl ?? point.dailyPnl ?? 0;
  }

  if (columnMap.unrealized_pnl) {
    payload[columnMap.unrealized_pnl] = unrealizedPnl;
  }

  if (columnMap.closed_count) {
    payload[columnMap.closed_count] = 1;
  }

  if (columnMap.source) {
    payload[columnMap.source] = "trade_journal";
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

  const source = String(row[columnMap.source] || "").trim();
  return source === "trade_journal";
}

function selectPortfolioRowForDate(rows, columnMap) {
  return rows.find((row) => isManagedPortfolioRow(row, columnMap)) || null;
}

function resolveExistingUnrealizedPnl(row, columnMap) {
  if (row && columnMap.unrealized_pnl && row[columnMap.unrealized_pnl] != null) {
    return Number(row[columnMap.unrealized_pnl] || 0);
  }

  return 0;
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

      rowsByDate.set(date, {
        date,
        capital,
        realizedDailyPnl: columnMap.realized_pnl ? Number(row[columnMap.realized_pnl] || 0) : 0,
        unrealizedPnl: resolveExistingUnrealizedPnl(row, columnMap),
        source: columnMap.source ? String(row[columnMap.source] || "") : "trade_journal"
      });
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
