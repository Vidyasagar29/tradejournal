import { getSupabaseClient } from "./supabase-client.js";

const DEFAULT_TRADE_COLUMN_MAP = {
  trade_id: "trade_id",
  strategy_name: "strategy_name",
  action: "action",
  trade_date: "trade_date",
  symbol: "symbol",
  instrument_type: "instrument_type",
  expiry: "expiry",
  strike: "strike",
  option_type: "option_type",
  quantity: "quantity",
  entry_price: "entry_price",
  entry_iv: "entry_iv",
  tag: "tag",
  notes: "notes"
};

const TRADE_COLUMN_CANDIDATES = {
  trade_id: ["trade_id", "tradeid", "tradeId"],
  strategy_name: ["strategy_name", "strategy", "strategyName"],
  action: ["action", "side"],
  trade_date: ["trade_date", "date", "entry_date", "tradeDate"],
  symbol: ["symbol", "ticker"],
  instrument_type: ["instrument_type", "instrument", "instrumentType", "type"],
  expiry: ["expiry", "expiry_date", "expiryDate"],
  strike: ["strike", "strike_price", "strikePrice"],
  option_type: ["option_type", "option", "optionType"],
  quantity: ["quantity", "qty"],
  entry_price: ["entry_price", "price", "entryPrice"],
  entry_iv: ["entry_iv", "iv", "entryIv"],
  tag: ["tag", "tags"],
  notes: ["notes", "note", "remarks"]
};

let cachedTradeColumnMap = null;
const columnExistenceCache = new Map();

export async function resolveTradeColumnMap() {
  if (cachedTradeColumnMap) {
    return { ...cachedTradeColumnMap };
  }

  const client = getSupabaseClient();

  if (!client) {
    throw new Error("Supabase client is not configured. Update src/js/config/app-config.js.");
  }

  const configuredMap = getConfiguredTradeColumnMap();
  const resolvedEntries = await Promise.all(
    Object.entries(DEFAULT_TRADE_COLUMN_MAP).map(async ([logicalField, fallbackColumn]) => {
      if (configuredMap[logicalField]) {
        return [logicalField, configuredMap[logicalField]];
      }

      const detectedColumn = await detectTradeColumn(client, logicalField, fallbackColumn);
      return [logicalField, detectedColumn];
    })
  );

  cachedTradeColumnMap = Object.fromEntries(resolvedEntries);
  return { ...cachedTradeColumnMap };
}

export async function mapTradePayloadToSchema(payload) {
  const columnMap = await resolveTradeColumnMap();

  return Object.entries(payload).reduce((accumulator, [logicalField, value]) => {
    const columnName = columnMap[logicalField];

    if (columnName) {
      accumulator[columnName] = value;
    }

    return accumulator;
  }, {});
}

export function resetTradeColumnMapCache() {
  cachedTradeColumnMap = null;
  columnExistenceCache.clear();
}

export async function tradeTableHasColumn(columnName) {
  if (columnExistenceCache.has(columnName)) {
    return columnExistenceCache.get(columnName);
  }

  const client = getSupabaseClient();

  if (!client) {
    throw new Error("Supabase client is not configured. Update src/js/config/app-config.js.");
  }

  const exists = await doesTradeColumnExist(client, columnName);
  columnExistenceCache.set(columnName, exists);
  return exists;
}

function getConfiguredTradeColumnMap() {
  const config = window.TRADE_JOURNAL_CONFIG || {};
  return config.tradeColumnMap || {};
}

async function detectTradeColumn(client, logicalField, fallbackColumn) {
  const candidates = TRADE_COLUMN_CANDIDATES[logicalField] || [fallbackColumn];

  for (const candidate of candidates) {
    const exists = await doesTradeColumnExist(client, candidate);

    if (exists) {
      return candidate;
    }
  }

  return null;
}

async function doesTradeColumnExist(client, columnName) {
  const { error } = await client
    .from("trades")
    .select(columnName)
    .limit(1);

  if (!error) {
    return true;
  }

  return !isMissingColumnError(error);
}

function isMissingColumnError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return code === "42703"
    || (message.includes("could not find the") && message.includes("column"))
    || (message.includes("does not exist") && message.includes("column"));
}
