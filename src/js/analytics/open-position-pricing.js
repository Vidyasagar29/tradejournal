import { calculateBlackScholesPrice } from "./black-scholes.js";
import { marketDataService } from "../data/market-data-service.js";

export async function enrichOpenPositionsWithCurrentPricing(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return [];
  }

  const marketContext = await marketDataService.buildMarketContext();

  return positions.map((position) => {
    const marketInputs = marketDataService.resolveInputs(position, marketContext);
    const pricingInputs = resolvePricingInputs(position, marketInputs.spotPrice, marketContext);
    const currentPrice = calculatePositionCurrentPrice(position, pricingInputs);
    const unrealizedPnl = calculatePositionUnrealizedPnl(position, currentPrice);

    return {
      ...position,
      spotPrice: pricingInputs.spotPrice,
      currentPrice,
      pricingIv: pricingInputs.pricingIv,
      unrealizedPnl
    };
  });
}

function calculatePositionCurrentPrice(position, pricingInputs) {
  const normalizedInstrument = String(position.instrument || "").toLowerCase();

  if (normalizedInstrument === "future") {
    return Number(pricingInputs.spotPrice) || 0;
  }

  return calculateBlackScholesPrice({
    instrument: position.instrument,
    optionType: position.optionType,
    spotPrice: pricingInputs.spotPrice,
    strike: position.strike,
    expiry: position.expiry,
    iv: pricingInputs.pricingIv,
    riskFreeRate: pricingInputs.riskFreeRate
  });
}

function calculatePositionUnrealizedPnl(position, currentPrice) {
  const entryPrice = Number(position.entryPrice || 0);
  const quantity = Number(position.remainingQty || 0);
  const sideMultiplier = String(position.action || "").toLowerCase() === "short" ? -1 : 1;

  if (!Number.isFinite(entryPrice) || !Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  return (Number(currentPrice || 0) - entryPrice) * quantity * sideMultiplier;
}

function resolvePricingInputs(position, sheetSpotPrice, marketContext) {
  const pricingConfig = window.TRADE_JOURNAL_CONFIG?.optionPricing || {};
  const optionType = String(position.optionType || "").toUpperCase();
  const sheetIv = Number(marketContext?.currentPriceIvs?.get(optionType));
  const configuredIv = Number(pricingConfig.currentPriceIv?.[optionType]);
  const pricingIv = Number.isFinite(sheetIv) && sheetIv > 0
    ? sheetIv
    : Number.isFinite(configuredIv) && configuredIv > 0
    ? configuredIv
    : optionType === "PE"
      ? 20
      : 10;
  const configuredRiskFreeRate = Number(pricingConfig.riskFreeRate);
  const riskFreeRate = Number.isFinite(configuredRiskFreeRate) && configuredRiskFreeRate > 0
    ? configuredRiskFreeRate
    : 0.1;

  return {
    spotPrice: Number(sheetSpotPrice || 0),
    pricingIv,
    riskFreeRate
  };
}
