import { createDatabase } from "./database.js";

const database = createDatabase();

export const exitRepository = {
  async listExits(options = {}) {
    return database.tables.exits.list({
      columns: "*",
      limit: options.limit ?? 1000,
      orderBy: options.orderBy ?? "created_at",
      ascending: options.ascending ?? false
    });
  },
  async findByTradeId(tradeId) {
    return database.tables.exits.findBy("trade_id", tradeId, {
      columns: "*",
      limit: 1000
    });
  },
  async createExit(payload) {
    const rows = await database.tables.exits.insert(payload);
    return rows[0] || null;
  },
  async updateExit(matchers, payload) {
    const rows = await database.tables.exits.update(matchers, payload);
    return rows[0] || null;
  },
  async deleteExits(matchers) {
    return database.tables.exits.remove(matchers);
  }
};
