import { exitRepository } from "../../data/exit-repository.js";
import { positionRepository } from "../../data/position-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import { tradeRepository } from "../../data/trade-repository.js";
import { deleteTradeWithDependencies } from "../trade-management/trade-deletion-service.js";
import {
  normalizeExitUpdates,
  syncClosedPositionWithTrade,
  syncClosedTradeExits,
  updateTradeRecord
} from "../trade-management/trade-update-service.js";

export async function getClosedPositionsSnapshot() {
  const [trades, positions, exits, strategies] = await Promise.all([
    tradeRepository.listTrades({ limit: 3000 }),
    positionRepository.listPositions({ limit: 3000 }),
    exitRepository.listExits({ limit: 4000 }),
    strategyRepository.listStrategies()
  ]);

  const positionMap = new Map(positions.map((position) => [position.trade_id, position]));
  const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const exitMap = exits.reduce((map, exitRow) => {
    const rows = map.get(exitRow.trade_id) || [];
    rows.push(exitRow);
    map.set(exitRow.trade_id, rows);
    return map;
  }, new Map());

  const closedPositions = trades
    .map((trade) => buildClosedTradeRecord(trade, positionMap.get(trade.id), exitMap.get(trade.id) || [], strategyMap))
    .filter(Boolean)
    .sort((left, right) => String(right.lastExitDate).localeCompare(String(left.lastExitDate)));

  return {
    positions: closedPositions,
    summary: {
      closedCount: closedPositions.length,
      totalClosedQty: closedPositions.reduce((total, item) => total + item.qty, 0),
      totalRealizedPnl: closedPositions.reduce((total, item) => total + item.realizedPnl, 0),
      winCount: closedPositions.filter((item) => item.realizedPnl > 0).length,
      lossCount: closedPositions.filter((item) => item.realizedPnl < 0).length,
      averagePnl: closedPositions.length > 0
        ? closedPositions.reduce((total, item) => total + item.realizedPnl, 0) / closedPositions.length
        : 0,
      winRate: closedPositions.length > 0
        ? (closedPositions.filter((item) => item.realizedPnl > 0).length / closedPositions.length) * 100
        : 0
    }
  };
}

export async function deleteClosedPosition({ positionId, tradeId }) {
  return deleteTradeWithDependencies({ positionId, tradeId });
}

export async function updateClosedPosition({ tradeId, updates, exits }) {
  const normalizedExits = normalizeExitUpdates(exits);
  const totalExitQty = normalizedExits.reduce((total, row) => total + row.qty, 0);
  const result = await updateTradeRecord({
    tradeId,
    updates,
    exits: normalizedExits,
    mode: "closed"
  });
  const nextQuantity = Number(result.trade?.qty ?? result.trade?.quantity ?? updates.quantity ?? 0);

  await syncClosedTradeExits(tradeId, result.currentExits, normalizedExits);
  await syncClosedPositionWithTrade(tradeId, totalExitQty, nextQuantity);

  return result.trade;
}

function buildClosedTradeRecord(trade, position, exits, strategyMap) {
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
  const signedPnl = trade.action === "Short"
    ? (entryPrice - averageExitPrice) * exitedQty
    : (averageExitPrice - entryPrice) * exitedQty;
  const strategy = trade.strategy_id ? strategyMap.get(trade.strategy_id) : null;
  const lastExitDate = exits
    .map((row) => row.exit_date)
    .filter(Boolean)
    .sort()
    .at(-1) || "-";
  const orderedExits = [...exits].sort((left, right) => {
    return String(left.exit_date || "").localeCompare(String(right.exit_date || ""));
  });

  return {
    id: trade.id,
    tradeId: trade.id,
    positionId: position?.id || null,
    symbol: trade.symbol || "-",
    strategyName: strategy?.strategy_name || "-",
    action: trade.action || "-",
    instrument: trade.instrument || "-",
    optionType: trade.option_type || "-",
    tradeDate: trade.trade_date || "-",
    expiry: trade.expiry || "-",
    strike: trade.strike ?? "-",
    qty: initialQty,
    entryPrice,
    averageExitPrice,
    realizedPnl: signedPnl,
    tag: trade.tag || "-",
    notes: trade.notes || "",
    exits: orderedExits,
    exitCount: orderedExits.length,
    lastExitDate
  };
}
