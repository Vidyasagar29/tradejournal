import { createDatabase } from "./database.js";

const database = createDatabase();

export const strategyRepository = {
  async listStrategies() {
    return database.tables.strategies.list({
      columns: "*",
      limit: 500
    });
  },
  async findByName(strategyName) {
    const matches = await database.tables.strategies.findBy("strategy_name", strategyName, {
      columns: "*",
      limit: 1
    });

    return matches[0] || null;
  },
  async createStrategy(strategyName) {
    const records = await database.tables.strategies.insert({
      strategy_name: strategyName
    });

    return records[0] || null;
  },
  async deleteStrategy(matchers) {
    const rows = await database.tables.strategies.remove(matchers);
    return rows[0] || null;
  }
};
