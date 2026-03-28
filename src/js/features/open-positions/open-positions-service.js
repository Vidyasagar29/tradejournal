import { exitRepository } from "../../data/exit-repository.js";
import { positionRepository } from "../../data/position-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import { tradeRepository } from "../../data/trade-repository.js";
import { enrichOpenPositionsWithCurrentPricing } from "../../analytics/open-position-pricing.js";
import { deleteTradeWithDependencies } from "../trade-management/trade-deletion-service.js";
import {
  syncOpenPositionWithTrade,
  updateTradeRecord
} from "../trade-management/trade-update-service.js";

export async function ensurePositionForTrade(tradeRecord) {
  if (!tradeRecord?.id) {
    throw new Error("Cannot create a position without a saved trade record.");
  }

  const existingPosition = await positionRepository.findByTradeId(tradeRecord.id);

  if (existingPosition) {
    return existingPosition;
  }

  return positionRepository.createPosition({
    trade_id: tradeRecord.id,
    remaining_qty: Number(tradeRecord.qty ?? 0),
    status: "open"
  });
}

export async function getOpenPositionsSnapshot() {
  const [trades, positions, exits, strategies] = await Promise.all([
    tradeRepository.listTrades({ limit: 1000 }),
    positionRepository.listPositions({ limit: 1000 }),
    exitRepository.listExits({ limit: 2000 }),
    strategyRepository.listStrategies()
  ]);

  await reconcilePositions(trades, positions, exits);

  const freshPositions = await positionRepository.listPositions({ limit: 1000 });
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]));
  const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const exitMap = groupExitsByTradeId(exits);

  const openPositions = freshPositions
    .filter((position) => Number(position.remaining_qty || 0) > 0)
    .map((position) => {
      const trade = tradeMap.get(position.trade_id);
      const strategy = trade?.strategy_id ? strategyMap.get(trade.strategy_id) : null;
      const exitRows = exitMap.get(position.trade_id) || [];
      const initialQty = Number(trade?.qty || 0);
      const remainingQty = Number(position.remaining_qty || 0);
      const exitedQty = initialQty - remainingQty;

      return {
        id: position.id,
        tradeId: position.trade_id,
        status: position.status || "open",
        remainingQty,
        initialQty,
        exitedQty,
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
        strategyName: strategy?.strategy_name || "-",
        exitCount: exitRows.length
      };
    })
    .sort((left, right) => String(right.tradeDate).localeCompare(String(left.tradeDate)));
  const pricedOpenPositions = await enrichOpenPositionsWithCurrentPricing(openPositions);

  return {
    positions: pricedOpenPositions,
    summary: buildOpenPositionSummary(pricedOpenPositions)
  };
}

export async function squareOffPosition({ positionId, tradeId, exitDate, exitQty, exitPrice }) {
  const positionRows = await positionRepository.listPositions({ limit: 1000 });
  const position = positionRows.find((row) => row.id === positionId || row.trade_id === tradeId);

  if (!position) {
    throw new Error("Position not found.");
  }

  const remainingQty = Number(position.remaining_qty || 0);
  const numericExitQty = Number(exitQty);
  const numericExitPrice = Number(exitPrice);

  if (!exitDate) {
    throw new Error("Exit Date is required.");
  }

  if (!numericExitQty || numericExitQty <= 0) {
    throw new Error("Exit Quantity must be greater than zero.");
  }

  if (numericExitQty > remainingQty) {
    throw new Error(`Exit Quantity cannot exceed remaining quantity (${remainingQty}).`);
  }

  if (!numericExitPrice || numericExitPrice <= 0) {
    throw new Error("Exit Price must be greater than zero.");
  }

  await exitRepository.createExit({
    trade_id: position.trade_id,
    exit_date: exitDate,
    qty: numericExitQty,
    exit_price: numericExitPrice
  });

  const nextRemainingQty = remainingQty - numericExitQty;
  const nextStatus = nextRemainingQty > 0 ? "open" : "closed";

  await positionRepository.updatePosition(
    { id: position.id },
    {
      remaining_qty: nextRemainingQty,
      status: nextStatus
    }
  );

  return {
    remainingQty: nextRemainingQty,
    status: nextStatus
  };
}

export async function updateOpenPositionTrade({ tradeId, updates }) {
  const result = await updateTradeRecord({
    tradeId,
    updates,
    mode: "open"
  });

  await syncOpenPositionWithTrade(tradeId, result.trade?.qty ?? result.trade?.quantity ?? updates.quantity, result.currentExits);
  return result.trade;
}

export async function deleteOpenPosition({ positionId, tradeId }) {
  return deleteTradeWithDependencies({ positionId, tradeId });
}

async function reconcilePositions(trades, positions, exits) {
  const positionMap = new Map(positions.map((position) => [position.trade_id, position]));
  const exitMap = groupExitsByTradeId(exits);

  for (const trade of trades) {
    const existingPosition = positionMap.get(trade.id);
    const totalQty = Number(trade.qty || 0);
    const exitedQty = sumExitQty(exitMap.get(trade.id) || []);
    const remainingQty = Math.max(totalQty - exitedQty, 0);
    const status = remainingQty > 0 ? "open" : "closed";

    if (!existingPosition) {
      const created = await positionRepository.createPosition({
        trade_id: trade.id,
        remaining_qty: remainingQty,
        status
      });

      if (created) {
        positionMap.set(trade.id, created);
      }

      continue;
    }

    const hasChanged = Number(existingPosition.remaining_qty || 0) !== remainingQty
      || String(existingPosition.status || "open") !== status;

    if (hasChanged) {
      await positionRepository.updatePosition(
        { id: existingPosition.id },
        {
          remaining_qty: remainingQty,
          status
        }
      );
    }
  }
}

function groupExitsByTradeId(exits) {
  return exits.reduce((map, exitRow) => {
    const tradeId = exitRow.trade_id;
    const rows = map.get(tradeId) || [];
    rows.push(exitRow);
    map.set(tradeId, rows);
    return map;
  }, new Map());
}

function sumExitQty(exits) {
  return exits.reduce((total, exitRow) => total + Number(exitRow.qty || 0), 0);
}

function buildOpenPositionSummary(positions) {
  return {
    openCount: positions.length,
    totalRemainingQty: positions.reduce((total, position) => total + Number(position.remainingQty || 0), 0),
    totalOpenValue: positions.reduce(
      (total, position) => total + Number(position.remainingQty || 0) * Number(position.entryPrice || 0),
      0
    ),
    totalCurrentValue: positions.reduce(
      (total, position) => total + Number(position.remainingQty || 0) * Number(position.currentPrice || 0),
      0
    ),
    totalUnrealizedPnl: positions.reduce((total, position) => total + Number(position.unrealizedPnl || 0), 0)
  };
}
