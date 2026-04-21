import { tradeRepository } from "../../data/trade-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import {
  mapTradePayloadToSchema,
  tradeTableHasColumn
} from "../../data/trade-schema-service.js";
import { ensurePositionForTrade } from "../open-positions/open-positions-service.js";

const DEFAULT_SYMBOL = "NIFTY";
const DEFAULT_TAGS = ["volatility", "directional", "hedge", "event"];

export function getTradeEntryDefaults() {
  return {
    tradeId: generateTradeId(),
    strategyName: "",
    action: "Long",
    tradeDate: getTodayIsoDate(),
    symbol: DEFAULT_SYMBOL,
    instrumentType: "Option",
    expiry: "",
    strike: "",
    optionType: "CE",
    quantity: "",
    entryPrice: "",
    entryIv: "",
    tag: "",
    notes: ""
  };
}

export function getTradeTagOptions() {
  return [...DEFAULT_TAGS];
}

export async function getStrategyNameOptions() {
  const strategies = await strategyRepository.listStrategies();

  return [...new Set(
    strategies
      .map((strategy) => String(strategy.strategy_name || "").trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

export function generateTradeId() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TRD-${stamp}-${randomSuffix}`;
}

export function validateTradeForm(formData) {
  const errors = [];

  if (!formData.strategyName.trim()) {
    errors.push("Strategy Name is required.");
  }

  if (!formData.tradeDate) {
    errors.push("Trade Date is required.");
  }

  if (!formData.symbol.trim()) {
    errors.push("Symbol is required.");
  }

  if (!formData.expiry) {
    errors.push("Expiry is required.");
  }

  if (!formData.quantity || Number(formData.quantity) <= 0) {
    errors.push("Quantity must be greater than zero.");
  }

  if (!formData.entryPrice || Number(formData.entryPrice) <= 0) {
    errors.push("Entry Price must be greater than zero.");
  }

  if (formData.instrumentType === "Option") {
    if (!formData.strike || Number(formData.strike) <= 0) {
      errors.push("Strike is required for option trades.");
    }

    if (!formData.optionType) {
      errors.push("Option Type is required for option trades.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function buildTradePayload(formData) {
  const isOption = formData.instrumentType === "Option";

  return {
    trade_id: formData.tradeId,
    strategy_name: formData.strategyName.trim(),
    action: formData.action,
    trade_date: formData.tradeDate,
    symbol: formData.symbol.trim().toUpperCase(),
    instrument_type: formData.instrumentType,
    expiry: formData.expiry,
    strike: isOption && formData.strike ? Number(formData.strike) : null,
    option_type: isOption ? formData.optionType : null,
    quantity: Number(formData.quantity),
    entry_price: Number(formData.entryPrice),
    entry_iv: formData.entryIv ? Number(formData.entryIv) : null,
    tag: formData.tag.trim() || null,
    notes: formData.notes.trim() || null
  };
}

export async function submitTradeEntry(formData) {
  const validation = validateTradeForm(formData);

  if (!validation.isValid) {
    return {
      ok: false,
      type: "validation",
      message: validation.errors.join(" "),
      errors: validation.errors
    };
  }

  try {
    const payload = buildTradePayload(formData);
    const schemaPayload = await prepareTradeInsertPayload(payload);
    const records = await tradeRepository.createTrade(schemaPayload);
    const savedTrade = records[0] || null;

    if (savedTrade) {
      await ensurePositionForTrade(savedTrade);
    }

    return {
      ok: true,
      type: "success",
      message: `Trade ${payload.trade_id} saved successfully.`,
      records
    };
  } catch (error) {
    const message = extractTradeErrorMessage(error);
    console.error("Trade save failed:", error);

    return {
      ok: false,
      type: "database",
      message,
      errors: []
    };
  }
}

function getTodayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

async function prepareTradeInsertPayload(payload) {
  const schemaPayload = await mapTradePayloadToSchema(payload);
  const strategyIdSupported = await tradeTableHasColumn("strategy_id");

  if (strategyIdSupported) {
    const strategy = await ensureStrategy(payload.strategy_name);
    schemaPayload.strategy_id = strategy.id;
  }

  delete schemaPayload.strategy_name;

  return schemaPayload;
}

async function ensureStrategy(strategyName) {
  const normalizedName = String(strategyName || "").trim();

  if (!normalizedName) {
    throw new Error("Strategy Name is required.");
  }

  const existingStrategy = await strategyRepository.findByNormalizedName(normalizedName);

  if (existingStrategy) {
    return existingStrategy;
  }

  const createdStrategy = await strategyRepository.createStrategy(normalizedName);

  if (!createdStrategy) {
    throw new Error("Unable to create strategy record.");
  }

  return createdStrategy;
}

function extractTradeErrorMessage(error) {
  if (!error) {
    return "Unable to save the trade.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  const parts = [error.message, error.details, error.hint]
    .filter(Boolean)
    .map((part) => String(part).trim());

  if (parts.length > 0) {
    const uniqueParts = [...new Set(parts)];
    return uniqueParts.join(" ");
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unable to save the trade.";
}
