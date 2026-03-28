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
  const strategyName = String(trade?.strategy_name || "").trim();

  if (!strategyId && !strategyName) {
    return;
  }

  const remainingTrades = await tradeRepository.listTrades({ limit: 3000 });
  const stillInUse = remainingTrades.some((row) => {
    const rowStrategyName = String(row.strategy_name || "").trim();
    return (strategyId && row.strategy_id === strategyId)
      || (strategyName && rowStrategyName === strategyName);
  });

  if (stillInUse) {
    return;
  }

  if (strategyId) {
    await strategyRepository.deleteStrategy({ id: strategyId });
    return;
  }

  if (strategyName) {
    const existingStrategy = await strategyRepository.findByName(strategyName);

    if (existingStrategy?.id) {
      await strategyRepository.deleteStrategy({ id: existingStrategy.id });
    }
  }
}
