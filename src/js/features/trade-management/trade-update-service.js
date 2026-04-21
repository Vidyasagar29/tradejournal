import { exitRepository } from "../../data/exit-repository.js";
import { positionRepository } from "../../data/position-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import { mapTradePayloadToSchema, tradeTableHasColumn } from "../../data/trade-schema-service.js";
import { tradeRepository } from "../../data/trade-repository.js";

export async function updateTradeRecord({ tradeId, updates, exits = [], mode = "open" }) {
  if (!tradeId) {
    throw new Error("Trade ID is required for updates.");
  }

  const currentTrade = await tradeRepository.findTradeById(tradeId);

  if (!currentTrade) {
    throw new Error("Trade not found.");
  }

  const currentExits = await exitRepository.findByTradeId(tradeId);
  const logicalPayload = buildTradeUpdatePayload(updates, {
    mode,
    exits: currentExits,
    normalizedExits: exits
  });

  if (Object.keys(logicalPayload).length === 0) {
    throw new Error("No changes were provided.");
  }

  const oldStrategy = {
    strategy_id: currentTrade.strategy_id ?? null
  };
  const schemaPayload = await mapTradePayloadToSchema(logicalPayload);
  await applyStrategyUpdate(schemaPayload, logicalPayload);
  const rows = await tradeRepository.updateTrade({ id: tradeId }, schemaPayload);
  const updatedTrade = rows[0] || currentTrade;
  await cleanupOrphanedStrategyReference(oldStrategy, updatedTrade);

  return {
    trade: updatedTrade,
    currentExits
  };
}

export function buildTradeUpdatePayload(updates, options = {}) {
  const { mode = "open", exits = [], normalizedExits = [] } = options;
  const payload = {};

  if (typeof updates.strategyName === "string") {
    const strategyName = updates.strategyName.trim();

    if (!strategyName) {
      throw new Error("Strategy Name is required.");
    }

    payload.strategy_name = strategyName;
  }

  if (typeof updates.action === "string") {
    const action = updates.action.trim();

    if (!action) {
      throw new Error("Side is required.");
    }

    payload.action = action;
  }

  if (typeof updates.tradeDate === "string") {
    const tradeDate = updates.tradeDate.trim();

    if (!tradeDate) {
      throw new Error("Trade Date is required.");
    }

    payload.trade_date = tradeDate;
  }

  if (typeof updates.symbol === "string") {
    const symbol = updates.symbol.trim().toUpperCase();

    if (!symbol) {
      throw new Error("Symbol is required.");
    }

    payload.symbol = symbol;
  }

  if (typeof updates.instrument === "string") {
    const instrument = updates.instrument.trim();

    if (!instrument) {
      throw new Error("Instrument is required.");
    }

    payload.instrument_type = instrument;
  }

  if (typeof updates.expiry === "string") {
    const expiry = updates.expiry.trim();

    if (!expiry) {
      throw new Error("Expiry is required.");
    }

    payload.expiry = expiry;
  }

  if (typeof updates.optionType === "string") {
    payload.option_type = updates.optionType.trim() || null;
  }

  if (typeof updates.quantity !== "undefined") {
    const numericQuantity = Number(updates.quantity);

    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    validateQuantityUpdate(numericQuantity, mode, exits, normalizedExits);
    payload.quantity = numericQuantity;
  }

  if (typeof updates.strike !== "undefined") {
    if (updates.strike === "" || updates.strike === null) {
      payload.strike = null;
    } else {
      const numericStrike = Number(updates.strike);

      if (!Number.isFinite(numericStrike) || numericStrike <= 0) {
        throw new Error("Strike must be greater than zero.");
      }

      payload.strike = numericStrike;
    }
  }

  if (typeof updates.entryPrice !== "undefined") {
    const numericEntryPrice = Number(updates.entryPrice);

    if (!numericEntryPrice || numericEntryPrice <= 0) {
      throw new Error("Entry Price must be greater than zero.");
    }

    payload.entry_price = numericEntryPrice;
  }

  if (typeof updates.entryIv !== "undefined") {
    payload.entry_iv = updates.entryIv === "" || updates.entryIv === null
      ? null
      : Number(updates.entryIv);

    if (payload.entry_iv !== null && (!Number.isFinite(payload.entry_iv) || payload.entry_iv < 0)) {
      throw new Error("Entry IV must be zero or greater.");
    }
  }

  if (typeof updates.tag === "string") {
    payload.tag = updates.tag.trim() || null;
  }

  if (typeof updates.notes === "string") {
    payload.notes = updates.notes.trim() || null;
  }

  return payload;
}

export async function syncOpenPositionWithTrade(tradeId, quantityUpdate, exits) {
  if (typeof quantityUpdate === "undefined") {
    return;
  }

  const position = await positionRepository.findByTradeId(tradeId);

  if (!position) {
    return;
  }

  const totalQty = Number(quantityUpdate || 0);
  const exitedQty = exits.reduce((total, row) => total + Number(row.qty || 0), 0);
  const remainingQty = Math.max(totalQty - exitedQty, 0);
  const status = remainingQty > 0 ? "open" : "closed";

  await positionRepository.updatePosition(
    { id: position.id },
    {
      remaining_qty: remainingQty,
      status
    }
  );
}

export async function syncClosedPositionWithTrade(tradeId, totalExitQty, totalQty) {
  const position = await positionRepository.findByTradeId(tradeId);

  if (!position) {
    return;
  }

  const remainingQty = Math.max(Number(totalQty || 0) - Number(totalExitQty || 0), 0);

  await positionRepository.updatePosition(
    { id: position.id },
    {
      remaining_qty: remainingQty,
      status: remainingQty > 0 ? "open" : "closed"
    }
  );
}

export function normalizeExitUpdates(exits) {
  return (exits || [])
    .map((row) => {
      const qty = Number(row.qty);
      const exitPrice = Number(row.exitPrice);
      const exitDate = String(row.exitDate || "").trim();

      if (!row.id || !exitDate || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(exitPrice) || exitPrice <= 0) {
        return null;
      }

      return {
        id: row.id,
        qty,
        exitPrice,
        exitDate
      };
    })
    .filter(Boolean);
}

export async function syncClosedTradeExits(tradeId, currentExits, nextExits) {
  const currentExitIds = new Set(currentExits.map((row) => row.id));

  for (const exitRow of nextExits) {
    await exitRepository.updateExit(
      { id: exitRow.id },
      {
        trade_id: tradeId,
        qty: exitRow.qty,
        exit_price: exitRow.exitPrice,
        exit_date: exitRow.exitDate
      }
    );
  }

  const nextIds = new Set(nextExits.map((row) => row.id));
  const removedIds = [...currentExitIds].filter((id) => !nextIds.has(id));

  if (removedIds.length > 0) {
    await exitRepository.deleteExits({ id: removedIds });
  }
}

async function applyStrategyUpdate(schemaPayload, logicalPayload) {
  const strategyIdSupported = await tradeTableHasColumn("strategy_id");

  if (!strategyIdSupported || !Object.hasOwn(logicalPayload, "strategy_name")) {
    return;
  }

  const strategy = await ensureStrategy(logicalPayload.strategy_name);
  schemaPayload.strategy_id = strategy?.id ?? null;
  delete schemaPayload.strategy_name;
}

function validateQuantityUpdate(quantity, mode, currentExits, normalizedExits) {
  const exitedQty = currentExits.reduce((total, row) => total + Number(row.qty || 0), 0);

  if (mode === "open") {
    if (quantity < exitedQty) {
      throw new Error(`Quantity cannot be less than already exited quantity (${exitedQty}).`);
    }

    return;
  }

  const totalExitQty = normalizedExits.reduce((total, row) => total + row.qty, 0);

  if (totalExitQty <= 0) {
    throw new Error("At least one valid exit row is required.");
  }

  if (quantity !== totalExitQty) {
    throw new Error(`Closed trade quantity must match total exit quantity (${totalExitQty}).`);
  }
}

async function ensureStrategy(strategyName) {
  const normalizedName = String(strategyName || "").trim();

  if (!normalizedName) {
    return null;
  }

  const existingStrategy = await strategyRepository.findByNormalizedName(normalizedName);

  if (existingStrategy) {
    return existingStrategy;
  }

  return strategyRepository.createStrategy(normalizedName);
}

async function cleanupOrphanedStrategyReference(previousTrade, nextTrade) {
  const previousStrategyId = previousTrade?.strategy_id ?? null;
  const nextStrategyId = nextTrade?.strategy_id ?? null;
  const strategyChanged = previousStrategyId !== nextStrategyId;

  if (!strategyChanged || !previousStrategyId) {
    return;
  }

  const remainingTrades = await tradeRepository.listTrades({ limit: 3000 });
  const stillInUse = remainingTrades.some((row) => previousStrategyId && row.strategy_id === previousStrategyId);

  if (stillInUse) {
    return;
  }

  await strategyRepository.deleteStrategy({ id: previousStrategyId });
}
