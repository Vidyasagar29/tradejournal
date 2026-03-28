import { createDatabase } from "./database.js";
import { resolvePortfolioColumnMap } from "./portfolio-schema-service.js";

const database = createDatabase();

export const portfolioRepository = {
  async listSnapshots() {
    const columnMap = await resolvePortfolioColumnMap();
    const orderBy = columnMap.date || undefined;

    return database.tables.portfolio.list({
      columns: "*",
      limit: 3000,
      orderBy,
      ascending: true
    });
  },
  async findByDate(value) {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date) {
      return [];
    }

    return database.tables.portfolio.findBy(columnMap.date, value, {
      columns: "*",
      limit: 10
    });
  },
  async createSnapshot(payload) {
    const rows = await database.tables.portfolio.insert(payload);
    return rows[0] || null;
  },
  async updateSnapshot(matchers, payload) {
    const rows = await database.tables.portfolio.update(matchers, payload);
    return rows[0] || null;
  },
  async deleteSnapshots(matchers) {
    return database.tables.portfolio.remove(matchers);
  }
};
