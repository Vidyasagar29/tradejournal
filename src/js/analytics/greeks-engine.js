import { calculateBlackScholesGreeks } from "./black-scholes.js";

export function calculateGreeks({
  instrument,
  action,
  optionType,
  spotPrice,
  strike,
  expiry,
  iv
}) {
  return calculateBlackScholesGreeks({
    instrument,
    action,
    optionType,
    spotPrice,
    strike,
    expiry,
    iv,
    riskFreeRate: Number(window.TRADE_JOURNAL_CONFIG?.optionPricing?.riskFreeRate) || 0.1
  });
}
