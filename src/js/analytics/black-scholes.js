import { getYearFractionToExpiry } from "../core/date-utils.js";

const DEFAULT_RISK_FREE_RATE = 0.1;

export function calculateBlackScholesPrice({
  instrument,
  optionType,
  spotPrice,
  strike,
  expiry,
  iv,
  riskFreeRate = DEFAULT_RISK_FREE_RATE
}) {
  const normalizedInstrument = String(instrument || "").toLowerCase();

  if (normalizedInstrument === "future") {
    return toNumeric(spotPrice);
  }

  const inputs = buildOptionInputs({
    optionType,
    spotPrice,
    strike,
    expiry,
    iv,
    riskFreeRate
  });

  if (!inputs) {
    return 0;
  }

  const { optionSide, spot, strikePrice, timeToExpiry, rate, d1, d2 } = inputs;

  if (optionSide === "PE") {
    return strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(-d2) - spot * normalCdf(-d1);
  }

  return spot * normalCdf(d1) - strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(d2);
}

export function calculateBlackScholesGreeks({
  instrument,
  action,
  optionType,
  spotPrice,
  strike,
  expiry,
  iv,
  riskFreeRate = DEFAULT_RISK_FREE_RATE
}) {
  const sideMultiplier = String(action).toLowerCase() === "short" ? -1 : 1;
  const normalizedInstrument = String(instrument || "").toLowerCase();

  if (normalizedInstrument === "future") {
    return {
      delta: sideMultiplier,
      theta: 0
    };
  }

  const inputs = buildOptionInputs({
    optionType,
    spotPrice,
    strike,
    expiry,
    iv,
    riskFreeRate
  });

  if (!inputs) {
    return {
      delta: 0,
      theta: 0
    };
  }

  const { optionSide, spot, strikePrice, timeToExpiry, rate, volatility, sqrtT, d1, d2 } = inputs;
  const pdfD1 = normalPdf(d1);

  if (optionSide === "PE") {
    const delta = (normalCdf(d1) - 1) * sideMultiplier;
    const theta = (
      (-spot * pdfD1 * volatility) / (2 * sqrtT)
      + rate * strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(-d2)
    ) / 365;

    return {
      delta,
      theta: theta * sideMultiplier
    };
  }

  const delta = normalCdf(d1) * sideMultiplier;
  const theta = (
    (-spot * pdfD1 * volatility) / (2 * sqrtT)
    - rate * strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(d2)
  ) / 365;

  return {
    delta,
    theta: theta * sideMultiplier
  };
}

function buildOptionInputs({
  optionType,
  spotPrice,
  strike,
  expiry,
  iv,
  riskFreeRate
}) {
  const optionSide = String(optionType || "").toUpperCase();
  const spot = toNumeric(spotPrice);
  const strikePrice = toNumeric(strike);
  const volatility = toNumeric(iv) / 100;
  const timeToExpiry = getYearFractionToExpiry(expiry);
  const rate = toNumeric(riskFreeRate);

  if (
    (optionSide !== "CE" && optionSide !== "PE")
    || !Number.isFinite(spot)
    || !Number.isFinite(strikePrice)
    || !Number.isFinite(volatility)
    || !Number.isFinite(rate)
    || spot <= 0
    || strikePrice <= 0
    || volatility <= 0
    || timeToExpiry <= 0
  ) {
    return null;
  }

  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(spot / strikePrice) + (rate + (volatility ** 2) / 2) * timeToExpiry) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  return {
    optionSide,
    spot,
    strikePrice,
    timeToExpiry,
    rate,
    volatility,
    sqrtT,
    d1,
    d2
  };
}

function toNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function normalPdf(value) {
  return Math.exp(-(value ** 2) / 2) / Math.sqrt(2 * Math.PI);
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
