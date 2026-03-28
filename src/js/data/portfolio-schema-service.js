import { getSupabaseClient } from "./supabase-client.js";

const PORTFOLIO_COLUMN_CANDIDATES = {
  id: ["id"],
  date: ["portfolio_date", "date", "as_of_date", "entry_date", "snapshot_date"],
  capital: ["capital", "ending_capital", "balance", "equity"],
  realized_pnl: ["realized_pnl", "pnl", "daily_pnl", "profit_loss"],
  closed_count: ["closed_count", "trade_count", "closed_trades"],
  source: ["source", "origin"],
  nifty_close: ["nifty_close", "benchmark_close", "nifty", "close"]
};

let cachedPortfolioColumnMap = null;
const columnExistenceCache = new Map();

export async function resolvePortfolioColumnMap() {
  if (cachedPortfolioColumnMap) {
    return { ...cachedPortfolioColumnMap };
  }

  const client = getSupabaseClient();

  if (!client) {
    throw new Error("Supabase client is not configured. Update src/js/config/app-config.js.");
  }

  const resolvedEntries = await Promise.all(
    Object.entries(PORTFOLIO_COLUMN_CANDIDATES).map(async ([logicalField, candidates]) => {
      for (const candidate of candidates) {
        const exists = await doesPortfolioColumnExist(client, candidate);

        if (exists) {
          return [logicalField, candidate];
        }
      }

      return [logicalField, null];
    })
  );

  cachedPortfolioColumnMap = Object.fromEntries(resolvedEntries);
  return { ...cachedPortfolioColumnMap };
}

export function resetPortfolioColumnMapCache() {
  cachedPortfolioColumnMap = null;
  columnExistenceCache.clear();
}

async function doesPortfolioColumnExist(client, columnName) {
  if (columnExistenceCache.has(columnName)) {
    return columnExistenceCache.get(columnName);
  }

  const { error } = await client
    .from("portfolio")
    .select(columnName)
    .limit(1);

  const exists = !error || !isMissingColumnError(error);
  columnExistenceCache.set(columnName, exists);
  return exists;
}

function isMissingColumnError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return code === "42703"
    || (message.includes("could not find the") && message.includes("column"))
    || (message.includes("does not exist") && message.includes("column"));
}
