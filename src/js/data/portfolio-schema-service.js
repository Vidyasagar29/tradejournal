const PORTFOLIO_COLUMN_MAP = {
  id: "id",
  date: "date",
  capital: "capital",
  realized_pnl: "daily_pnl",
  unrealized_pnl: "unrealised_pnl",
  closed_count: null,
  source: "source",
  nifty_close: "nifty_close"
};

export async function resolvePortfolioColumnMap() {
  return { ...PORTFOLIO_COLUMN_MAP };
}

export function resetPortfolioColumnMapCache() {}
