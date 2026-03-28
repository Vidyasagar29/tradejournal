import { createDatabase } from "./database.js";

const database = createDatabase();

export const positionRepository = {
  async listPositions(options = {}) {
    return database.tables.positions.list({
      columns: "*",
      limit: options.limit ?? 500,
      orderBy: options.orderBy ?? "updated_at",
      ascending: options.ascending ?? false
    });
  },
  async findByTradeId(tradeId) {
    const rows = await database.tables.positions.findBy("trade_id", tradeId, {
      columns: "*",
      limit: 1
    });

    return rows[0] || null;
  },
  async createPosition(payload) {
    const rows = await database.tables.positions.insert(payload);
    return rows[0] || null;
  },
  async updatePosition(matchers, payload) {
    const rows = await database.tables.positions.update(matchers, payload);
    return rows[0] || null;
  },
  async deletePosition(matchers) {
    const rows = await database.tables.positions.remove(matchers);
    return rows[0] || null;
  }
};
