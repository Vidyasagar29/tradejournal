import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { exitRepository } from "../../data/exit-repository.js";
import { positionRepository } from "../../data/position-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import { tradeRepository } from "../../data/trade-repository.js";

export async function deleteTradeWithDependencies({ positionId, tradeId }) {
  if (!tradeId) {
    throw new Error("Trade ID is required for deletion.");
  }

  const trade = await tradeRepository.findTradeById(tradeId);

  await exitRepository.deleteExits({ trade_id: tradeId });

  if (positionId) {
    await positionRepository.deletePosition({ id: positionId });
  }

  await tradeRepository.deleteTrade({ id: tradeId });
  await cleanupOrphanedStrategy(trade);
  await summarizePortfolio();

  return { deleted: true };
}

async function cleanupOrphanedStrategy(trade) {
  const strategyId = trade?.strategy_id ?? null;

  if (!strategyId) {
    return;
  }

  const remainingTrades = await tradeRepository.listTrades({ limit: 3000 });
  const stillInUse = remainingTrades.some((row) => strategyId && row.strategy_id === strategyId);

  if (stillInUse) {
    return;
  }

  await strategyRepository.deleteStrategy({ id: strategyId });
}
