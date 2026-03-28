import { marketDataService } from "../../data/market-data-service.js";
import { getOpenPositionsSnapshot } from "../open-positions/open-positions-service.js";
import { getDaysToExpiry } from "../../core/date-utils.js";

const RISK_FREE_RATE = 0.1;
const SPOT_RANGE_OFFSET = 3000;
const SPOT_STEP_SIZE = 50;

export async function getPayoffSnapshot() {
  const [openSnapshot, marketContext] = await Promise.all([
    getOpenPositionsSnapshot(),
    marketDataService.buildMarketContext()
  ]);

  const strategyMap = openSnapshot.positions.reduce((map, position) => {
    const key = position.strategyName || "Unassigned";
    const rows = map.get(key) || [];
    const inputs = marketDataService.resolveInputs(position, marketContext);
    const daysToExpiry = resolveDaysToExpiry(position.expiry);

    rows.push({
      ...position,
      spotPrice: Number(inputs.spotPrice || position.strike || position.entryPrice || 0),
      resolvedIv: Number(inputs.iv || position.entryIv || 18),
      daysToExpiry
    });
    map.set(key, rows);
    return map;
  }, new Map());

  const strategies = [...strategyMap.entries()]
    .map(([name, positions]) => buildStrategyPayload(name, positions))
    .sort((left, right) => right.positionCount - left.positionCount || left.name.localeCompare(right.name));
  const portfolio = buildStrategyPayload("Entire Position", openSnapshot.positions);

  return {
    portfolio,
    strategies,
    summary: {
      strategyCount: strategies.length,
      openStrategies: strategies.filter((strategy) => strategy.positionCount > 0).length,
      mixedSymbolStrategies: strategies.filter((strategy) => strategy.symbolGroups.length > 1).length
    }
  };
}

export function simulateStrategyPayoff(strategy, simulation) {
  if (!strategy) {
    return null;
  }

  return {
    ...strategy,
    symbolGroups: strategy.symbolGroups.map((group) => simulateSymbolGroup(group, simulation))
  };
}

function buildStrategyPayload(name, positions) {
  const symbolGroups = [...positions.reduce((map, position) => {
    const key = position.symbol || "-";
    const rows = map.get(key) || [];
    rows.push(position);
    map.set(key, rows);
    return map;
  }, new Map()).entries()].map(([symbol, rows]) => {
    return buildSymbolGroup(symbol, rows);
  }).sort((left, right) => left.symbol.localeCompare(right.symbol));

  return {
    name,
    positionCount: positions.length,
    symbolCount: symbolGroups.length,
    symbols: symbolGroups.map((group) => group.symbol),
    symbolGroups
  };
}

function buildSymbolGroup(symbol, positions) {
  const anchorSpot = resolveAnchorSpot(positions);
  const defaultDaysToExpiry = resolveDefaultDaysToExpiry(positions);
  const points = buildProjectedPoints(positions, anchorSpot, 0, defaultDaysToExpiry);

  return {
    symbol,
    anchorSpot,
    defaultDaysToExpiry,
    maxDaysToExpiry: Math.max(defaultDaysToExpiry, 30),
    positionCount: positions.length,
    positions: positions.map((position) => ({
      symbol: position.symbol,
      side: position.action,
      instrument: position.instrument,
      optionType: position.optionType,
      strike: position.strike,
      expiry: position.expiry,
      remainingQty: position.remainingQty,
      entryPrice: position.entryPrice,
      resolvedIv: position.resolvedIv,
      spotPrice: position.spotPrice,
      daysToExpiry: position.daysToExpiry
    })),
    ...buildMetrics(points, positions)
  };
}

function simulateSymbolGroup(group, simulation) {
  const daysToExpiry = Number.isFinite(Number(simulation.daysToExpiry))
    ? Number(simulation.daysToExpiry)
    : group.defaultDaysToExpiry;
  const spotShift = Number.isFinite(Number(simulation.spotShift))
    ? Number(simulation.spotShift)
    : 0;
  const points = buildProjectedPoints(group.positions, group.anchorSpot, spotShift, daysToExpiry);

  return {
    ...group,
    simulation: {
      spotShift,
      daysToExpiry
    },
    ...buildMetrics(points, group.positions)
  };
}

function buildProjectedPoints(positions, anchorSpot, spotShift, daysToExpiry) {
  const shiftedAnchor = Math.max(Number(anchorSpot || 0) + Number(spotShift || 0), 0);
  const range = buildSpotRange(shiftedAnchor);

  return range.map((spot) => {
    const payoff = positions.reduce((total, position) => {
      return total + calculateProjectedPnl(position, spot, daysToExpiry);
    }, 0);

    return { spot, payoff };
  });
}

function calculateProjectedPnl(position, spot, daysToExpiry) {
  const quantity = Number(position.remainingQty || 0);
  const entryPrice = Number(position.entryPrice || 0);
  const strike = Number(position.strike || 0);
  const side = String(position.side || position.action || "").toLowerCase();
  const instrument = String(position.instrument || "").toLowerCase();
  const optionType = String(position.optionType || "").toUpperCase();
  const currentIv = Number(position.resolvedIv || 18);
  const sideMultiplier = side === "short" ? -1 : 1;

  if (instrument === "future") {
    return ((spot - entryPrice) * sideMultiplier) * quantity;
  }

  const projectedOptionPrice = priceOption({
    optionType,
    spotPrice: spot,
    strike,
    iv: currentIv,
    daysToExpiry
  });

  return ((projectedOptionPrice - entryPrice) * sideMultiplier) * quantity;
}

function priceOption({ optionType, spotPrice, strike, iv, daysToExpiry }) {
  const spot = Number(spotPrice);
  const strikePrice = Number(strike);
  const volatility = Number(iv) / 100;
  const timeToExpiry = Math.max(Number(daysToExpiry || 0) / 365, 0);

  if (!Number.isFinite(spot) || !Number.isFinite(strikePrice) || !Number.isFinite(volatility) || volatility <= 0) {
    return 0;
  }

  if (timeToExpiry <= 0) {
    return optionType === "PE"
      ? Math.max(strikePrice - spot, 0)
      : Math.max(spot - strikePrice, 0);
  }

  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(spot / strikePrice) + (RISK_FREE_RATE + (volatility ** 2) / 2) * timeToExpiry) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  if (String(optionType || "").toUpperCase() === "PE") {
    return (strikePrice * Math.exp(-RISK_FREE_RATE * timeToExpiry) * normalCdf(-d2)) - (spot * normalCdf(-d1));
  }

  return (spot * normalCdf(d1)) - (strikePrice * Math.exp(-RISK_FREE_RATE * timeToExpiry) * normalCdf(d2));
}

function buildMetrics(points, positions) {
  const payoffs = points.map((point) => point.payoff);
  const totalPremium = positions.reduce((total, position) => {
    return total + Number(position.entryPrice || 0) * Number(position.remainingQty || 0);
  }, 0);

  return {
    points,
    totalPremium,
    maxProfit: resolveBoundLabel(Math.max(...payoffs), points, "max"),
    maxLoss: resolveBoundLabel(Math.min(...payoffs), points, "min"),
    breakevens: resolveBreakevens(points)
  };
}

function resolveAnchorSpot(positions) {
  const numericSpots = positions
    .map((position) => Number(position.spotPrice || position.strike || position.entryPrice || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  return numericSpots.length > 0
    ? numericSpots.reduce((total, value) => total + value, 0) / numericSpots.length
    : 100;
}

function resolveDefaultDaysToExpiry(positions) {
  const values = positions
    .map((position) => Number(position.daysToExpiry || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function buildSpotRange(anchorSpot) {
  const numericAnchor = Number(anchorSpot) || 0;
  const start = roundToStep(Math.max(numericAnchor - SPOT_RANGE_OFFSET, 0), SPOT_STEP_SIZE, "floor");
  const end = roundToStep(numericAnchor + SPOT_RANGE_OFFSET, SPOT_STEP_SIZE, "ceil");
  const values = [];

  for (let spot = start; spot <= end; spot += SPOT_STEP_SIZE) {
    values.push(spot);
  }

  return values;
}

function resolveBreakevens(points) {
  const levels = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous.payoff === 0) {
      levels.push(previous.spot);
      continue;
    }

    const crossed = (previous.payoff < 0 && current.payoff > 0) || (previous.payoff > 0 && current.payoff < 0);
    if (!crossed) {
      continue;
    }

    const slope = current.payoff - previous.payoff;
    const ratio = slope === 0 ? 0 : Math.abs(previous.payoff) / Math.abs(slope);
    levels.push(previous.spot + ((current.spot - previous.spot) * ratio));
  }

  return levels;
}

function resolveBoundLabel(value, points, mode) {
  const values = points.map((point) => point.payoff);
  const edgeValue = mode === "max" ? Math.max(values[0], values.at(-1)) : Math.min(values[0], values.at(-1));
  const boundValue = mode === "max" ? Math.max(...values) : Math.min(...values);

  if (edgeValue === boundValue) {
    return "Unlimited";
  }

  return value;
}

function resolveDaysToExpiry(expiry) {
  return getDaysToExpiry(expiry);
}

function roundToStep(value, step, mode) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }

  const ratio = value / step;

  if (mode === "ceil") {
    return Math.ceil(ratio) * step;
  }

  return Math.floor(ratio) * step;
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((((a5 * t) + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(x ** 2));
  return sign * y;
}
