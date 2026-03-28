import { createDatabase } from "./database.js";

const database = createDatabase();

export const tradeRepository = {
  async listTrades(options = {}) {
    return database.tables.trades.list({
      columns: "*",
      limit: options.limit ?? 250,
      orderBy: options.orderBy ?? "trade_date",
      ascending: options.ascending ?? false
    });
  },
  async listOpenPositions(options = {}) {
    return database.tables.positions.list({
      columns: "*",
      limit: options.limit ?? 250,
      orderBy: options.orderBy ?? "trade_date",
      ascending: options.ascending ?? false
    });
  },
  async listClosedPositions(options = {}) {
    return database.tables.exits.list({
      columns: "*",
      limit: options.limit ?? 250,
      orderBy: options.orderBy ?? "exit_date",
      ascending: options.ascending ?? false
    });
  },
  async listStrategies(options = {}) {
    return database.tables.strategies.list({
      columns: "*",
      limit: options.limit ?? 100,
      orderBy: options.orderBy ?? "created_at",
      ascending: options.ascending ?? false
    });
  },
  async createTrade(payload) {
    return database.tables.trades.insert(payload);
  },
  async findTradeById(tradeId) {
    const rows = await database.tables.trades.findBy("id", tradeId, {
      columns: "*",
      limit: 1
    });

    return rows[0] || null;
  },
  async updateTrade(matchers, payload) {
    return database.tables.trades.update(matchers, payload);
  },
  async deleteTrade(matchers) {
    return database.tables.trades.remove(matchers);
  }
};

export function getTradeDatabase() {
  return database;
}
