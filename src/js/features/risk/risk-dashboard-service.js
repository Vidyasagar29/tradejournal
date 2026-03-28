import { calculateGreeks } from "../../analytics/greeks-engine.js";
import { marketDataService } from "../../data/market-data-service.js";
import { getOpenPositionsSnapshot } from "../open-positions/open-positions-service.js";

export async function getRiskDashboardSnapshot() {
  const [openSnapshot, marketContext] = await Promise.all([
    getOpenPositionsSnapshot(),
    marketDataService.buildMarketContext()
  ]);

  const rows = openSnapshot.positions.map((position) => {
    const inputs = marketDataService.resolveInputs(position, marketContext);
    const lotSize = resolveLotSize(position.symbol);
    const lotCount = resolveLotCount(position.remainingQty, lotSize);
    const greeks = calculateGreeks({
      instrument: position.instrument,
      action: position.action,
      optionType: position.optionType,
      spotPrice: inputs.spotPrice,
      strike: position.strike,
      expiry: position.expiry,
      iv: inputs.iv
    });

    return {
      ...position,
      spotPrice: inputs.spotPrice,
      resolvedIv: inputs.iv,
      ivSource: inputs.ivSource,
      lotSize,
      lotCount,
      deltaPerUnit: greeks.delta,
      thetaPerUnit: greeks.theta,
      delta: greeks.delta,
      theta: greeks.theta,
      positionDelta: greeks.delta * Number(position.remainingQty || 0),
      positionTheta: greeks.theta * Number(position.remainingQty || 0)
    };
  }).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  const summary = {
    openCount: rows.length,
    portfolioDelta: rows.reduce((total, row) => total + row.delta, 0),
    portfolioTheta: rows.reduce((total, row) => total + row.theta, 0),
    marketIvCount: rows.filter((row) => row.ivSource === "market_data").length,
    fallbackIvCount: rows.filter((row) => row.ivSource !== "market_data").length
  };

  const bySymbol = [...rows.reduce((map, row) => {
    const current = map.get(row.symbol) || { name: row.symbol, delta: 0, theta: 0, count: 0 };
    current.delta += row.delta;
    current.theta += row.theta;
    current.count += 1;
    map.set(row.symbol, current);
    return map;
  }, new Map()).values()].sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    positions: rows,
    summary,
    bySymbol
  };
}

function resolveLotSize(symbol) {
  const configuredLotSizes = window.TRADE_JOURNAL_CONFIG?.lotSizes || {};
  const key = String(symbol || "").toUpperCase();
  const configured = Number(configuredLotSizes[key]);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return 1;
}

function resolveLotCount(quantity, lotSize) {
  const numericQuantity = Number(quantity || 0);

  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return 0;
  }

  if (!Number.isFinite(lotSize) || lotSize <= 1) {
    return 1;
  }

  return numericQuantity / lotSize;
}
