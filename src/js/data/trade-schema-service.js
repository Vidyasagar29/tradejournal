const TRADE_COLUMN_MAP = {
  trade_id: "trade_id",
  action: "action",
  trade_date: "trade_date",
  symbol: "symbol",
  instrument_type: "instrument",
  expiry: "expiry",
  strike: "strike",
  option_type: "option_type",
  quantity: "qty",
  entry_price: "entry_price",
  entry_iv: "entry_iv",
  tag: "tag",
  notes: "notes"
};

export async function resolveTradeColumnMap() {
  return { ...TRADE_COLUMN_MAP };
}

export async function mapTradePayloadToSchema(payload) {
  return Object.entries(payload).reduce((accumulator, [logicalField, value]) => {
    const columnName = TRADE_COLUMN_MAP[logicalField];

    if (columnName) {
      accumulator[columnName] = value;
    }

    return accumulator;
  }, {});
}

export function resetTradeColumnMapCache() {}

export async function tradeTableHasColumn(columnName) {
  return columnName === "strategy_id";
}
