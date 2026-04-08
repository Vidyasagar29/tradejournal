const INITIAL_CAPITAL = 1000000;
const DEFAULT_IV = 18;
const DEFAULT_MARKET_CLOSE_UTC_HOUR = 10;
const DEFAULT_MARKET_CLOSE_UTC_MINUTE = 5;
const DEFAULT_MARKET_TIMEZONE = "Asia/Kolkata";
const SNAPSHOT_TOLERANCE = 0.01;
const PORTFOLIO_COLUMN_MAP = {
  id: "id",
  date: "date",
  capital: "capital",
  realizedPnl: "daily_pnl",
  unrealizedPnl: "unrealised_pnl",
  source: "source",
  closedCount: null,
  niftyClose: "nifty_close"
};

async function main() {
  const config = getConfig();
  const snapshotDate = getTodayIsoDate(config.timezone);

  if (!shouldRunSnapshot(config, snapshotDate)) {
    console.log("Skipping snapshot because market close time has not been reached yet.");
    return;
  }

  const [trades, positions, portfolioRows, marketSheet] = await Promise.all([
    fetchTable(config, "trades"),
    fetchTable(config, "positions"),
    fetchTable(config, "portfolio"),
    loadMarketSheet(config.marketDataCsvUrl)
  ]);

  const portfolioColumnMap = await resolvePortfolioColumnMap();
  validatePortfolioColumnMap(portfolioColumnMap);

  const openTradeRows = buildOpenTradeRows(trades, positions);
  const valuedOpenRows = openTradeRows.map((trade) => valueOpenTrade(trade, marketSheet, config));
  const totalUnrealizedPnl = valuedOpenRows.reduce((total, row) => total + row.unrealizedPnl, 0);
  const latestRealizedCapital = resolveLatestRealizedCapital(portfolioRows, portfolioColumnMap, snapshotDate);
  const niftyClose = toNumeric(marketSheet.namedCells.get("NIFTY_50"));
  const mtmCapital = latestRealizedCapital + totalUnrealizedPnl;
  const existingTodayRow = findExistingSnapshot(portfolioRows, portfolioColumnMap, snapshotDate);
  const realizedPnl = resolveExistingRealizedPnl(existingTodayRow, portfolioColumnMap);
  const closedCount = resolveExistingClosedCount(existingTodayRow, portfolioColumnMap);
  validateSnapshotMath({
    latestRealizedCapital,
    totalUnrealizedPnl,
    mtmCapital,
    snapshotDate
  });
  const snapshotPayload = mapPortfolioPayload({
    date: snapshotDate,
    capital: mtmCapital,
    realizedPnl,
    unrealizedPnl: totalUnrealizedPnl,
    closedCount,
    niftyClose,
    source: "trade_journal"
  }, portfolioColumnMap);

  if (existingTodayRow) {
    await updatePortfolioRow(config, portfolioColumnMap, existingTodayRow, snapshotPayload);
    console.log(
      `Updated MTM snapshot for ${snapshotDate}. Base capital: ${formatNumber(latestRealizedCapital)}, open P&L: ${formatNumber(totalUnrealizedPnl)}, ending capital: ${formatNumber(mtmCapital)}.`
    );
    return;
  }

  await createPortfolioRow(config, snapshotPayload);
  console.log(
    `Created MTM snapshot for ${snapshotDate}. Base capital: ${formatNumber(latestRealizedCapital)}, open P&L: ${formatNumber(totalUnrealizedPnl)}, ending capital: ${formatNumber(mtmCapital)}.`
  );
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const marketDataCsvUrl = process.env.MARKET_DATA_CSV_URL?.trim()
    || "https://docs.google.com/spreadsheets/d/e/2PACX-1vTnIOO5bf63lwYdCX1ZsPa32o0AekCFfrOoXdq1jVH7j7JD8Jg5PjO7EtqF5ISTk2MZQIGDfXPR8MoJ/pub?gid=775524360&single=true&output=csv";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured as GitHub Actions secrets.");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    marketDataCsvUrl,
    timezone: process.env.MARKET_TIMEZONE?.trim() || DEFAULT_MARKET_TIMEZONE
  };
}

function shouldRunSnapshot(config, snapshotDate) {
  if (process.env.FORCE_SNAPSHOT === "true") {
    return true;
  }

  if (isWeekendDate(snapshotDate, config.timezone)) {
    console.log(`Skipping snapshot for ${snapshotDate} because it is not a market day.`);
    return false;
  }

  const now = new Date();
  const closeHour = Number(process.env.MARKET_CLOSE_UTC_HOUR || DEFAULT_MARKET_CLOSE_UTC_HOUR);
  const closeMinute = Number(process.env.MARKET_CLOSE_UTC_MINUTE || DEFAULT_MARKET_CLOSE_UTC_MINUTE);

  return now.getUTCHours() > closeHour || (now.getUTCHours() === closeHour && now.getUTCMinutes() >= closeMinute);
}

async function fetchTable(config, tableName) {
  const response = await supabaseRequest(config, `${tableName}?select=*`, {
    method: "GET"
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to fetch ${tableName}: ${errorBody?.message || response.statusText}`);
  }

  return response.json();
}

async function resolvePortfolioColumnMap() {
  return { ...PORTFOLIO_COLUMN_MAP };
}

function validatePortfolioColumnMap(columnMap) {
  if (!columnMap.date || !columnMap.capital || !columnMap.source || !columnMap.unrealizedPnl) {
    throw new Error("Portfolio table must expose compatible date, capital, source, and unrealised_pnl columns for automated snapshots.");
  }
}

function buildOpenTradeRows(trades, positions) {
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]));

  return positions
    .filter((position) => Number(position.remaining_qty || 0) > 0)
    .map((position) => {
      const trade = tradeMap.get(position.trade_id);

      if (!trade) {
        return null;
      }

      return {
        tradeId: trade.id,
        symbol: trade.symbol || "-",
        action: trade.action || "-",
        instrument: trade.instrument || "-",
        expiry: trade.expiry || "-",
        strike: trade.strike ?? "-",
        optionType: trade.option_type || "-",
        entryPrice: Number(trade.entry_price || 0),
        entryIv: Number(trade.entry_iv || 0),
        remainingQty: Number(position.remaining_qty || 0)
      };
    })
    .filter(Boolean);
}

function valueOpenTrade(trade, marketSheet, config) {
  const spotPrice = resolveSpotPrice(trade, marketSheet);
  const pricingIv = resolvePricingIv(trade, marketSheet);
  const currentPrice = calculateOptionPrice({
    instrument: trade.instrument,
    optionType: trade.optionType,
    spotPrice,
    strike: trade.strike,
    expiry: trade.expiry,
    iv: pricingIv,
    riskFreeRate: 0.1
  });
  const sideMultiplier = String(trade.action || "").toLowerCase() === "short" ? -1 : 1;
  const unrealizedPnl = (currentPrice - trade.entryPrice) * trade.remainingQty * sideMultiplier;

  return {
    ...trade,
    spotPrice,
    pricingIv,
    currentPrice,
    unrealizedPnl
  };
}

function resolveSpotPrice(trade, marketSheet) {
  const symbolKey = normalizeValue(trade.symbol);

  if (symbolKey === "NIFTY") {
    return toNumeric(marketSheet.namedCells.get("NIFTY_50"));
  }

  const matchedRow = findExactMarketRow(trade, marketSheet.rows);
  return toNumeric(matchedRow?.spot);
}

function resolvePricingIv(trade, marketSheet) {
  const matchedRow = findExactMarketRow(trade, marketSheet.rows);
  const exactIv = toNumeric(matchedRow?.iv);

  if (exactIv > 0) {
    return exactIv;
  }

  const optionType = normalizeValue(trade.optionType);
  const namedIv = optionType === "PE"
    ? toNumeric(marketSheet.namedCells.get("PUT_IV"))
    : toNumeric(marketSheet.namedCells.get("CALL_IV"));

  if (namedIv > 0) {
    return namedIv;
  }

  if (trade.entryIv > 0) {
    return trade.entryIv;
  }

  return DEFAULT_IV;
}

function findExactMarketRow(trade, rows) {
  return rows.find((row) => {
    return normalizeValue(row.symbol) === normalizeValue(trade.symbol)
      && normalizeTradingDate(row.expiry) === normalizeTradingDate(trade.expiry)
      && Math.abs(toNumeric(row.strike) - toNumeric(trade.strike)) < 0.0001
      && normalizeValue(row.optionType) === normalizeValue(trade.optionType);
  }) || null;
}

function calculateOptionPrice({ instrument, optionType, spotPrice, strike, expiry, iv, riskFreeRate }) {
  const normalizedInstrument = normalizeValue(instrument);

  if (normalizedInstrument === "FUTURE") {
    return toNumeric(spotPrice);
  }

  const inputs = buildOptionInputs({
    optionType,
    spotPrice,
    strike,
    expiry,
    iv,
    riskFreeRate
  });

  if (!inputs) {
    return 0;
  }

  const { optionSide, spot, strikePrice, timeToExpiry, rate, d1, d2 } = inputs;

  if (optionSide === "PE") {
    return strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(-d2) - spot * normalCdf(-d1);
  }

  return spot * normalCdf(d1) - strikePrice * Math.exp(-rate * timeToExpiry) * normalCdf(d2);
}

function buildOptionInputs({ optionType, spotPrice, strike, expiry, iv, riskFreeRate }) {
  const optionSide = normalizeValue(optionType);
  const spot = toNumeric(spotPrice);
  const strikePrice = toNumeric(strike);
  const volatility = toNumeric(iv) / 100;
  const timeToExpiry = getYearFractionToExpiry(expiry);
  const rate = toNumeric(riskFreeRate);

  if (
    (optionSide !== "CE" && optionSide !== "PE")
    || spot <= 0
    || strikePrice <= 0
    || volatility <= 0
    || timeToExpiry <= 0
  ) {
    return null;
  }

  const sqrtT = Math.sqrt(timeToExpiry);
  const d1 = (Math.log(spot / strikePrice) + (rate + (volatility ** 2) / 2) * timeToExpiry) / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  return {
    optionSide,
    spot,
    strikePrice,
    timeToExpiry,
    rate,
    d1,
    d2
  };
}

async function loadMarketSheet(csvUrl) {
  const response = await fetch(csvUrl, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Google Sheets CSV: ${response.statusText}`);
  }

  const csvText = await response.text();
  const parsedRows = parseCsvRows(csvText);
  const records = buildCsvRecords(parsedRows);
  const namedCells = new Map([
    ["NIFTY_50", resolveNamedCellValue(parsedRows, "Nifty_50")],
    ["PUT_IV", resolveNamedCellValue(parsedRows, "PUT_IV")],
    ["CALL_IV", resolveNamedCellValue(parsedRows, "CALL_IV")]
  ]);

  return {
    rows: records.map((row) => ({
      symbol: row.symbol,
      expiry: row.expiry,
      strike: row.strike,
      optionType: row.option_type || row.type,
      iv: row.iv,
      spot: row.Nifty_50 || row.spot || row.spot_price || row.underlying_price
    })),
    namedCells
  };
}

function resolveLatestRealizedCapital(rows, columnMap, snapshotDate) {
  const realizedRows = rows
    .filter((row) => isManagedRow(row, columnMap))
    .map((row) => ({
      date: normalizeTradingDate(row[columnMap.date]),
      capital: resolveRealizedCapital(row, columnMap)
    }))
    .filter((row) => row.date && row.capital > 0 && row.date <= snapshotDate)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  if (realizedRows.length === 0) {
    return INITIAL_CAPITAL;
  }

  return realizedRows.at(-1).capital;
}

function validateSnapshotMath({ latestRealizedCapital, totalUnrealizedPnl, mtmCapital, snapshotDate }) {
  if (!Number.isFinite(latestRealizedCapital) || latestRealizedCapital <= 0) {
    throw new Error(`Cannot build MTM snapshot for ${snapshotDate}: invalid realized capital base.`);
  }

  if (!Number.isFinite(totalUnrealizedPnl)) {
    throw new Error(`Cannot build MTM snapshot for ${snapshotDate}: invalid open-position P&L.`);
  }

  if (!Number.isFinite(mtmCapital) || mtmCapital <= 0) {
    throw new Error(`Cannot build MTM snapshot for ${snapshotDate}: ending capital is invalid.`);
  }

  const recomputedCapital = latestRealizedCapital + totalUnrealizedPnl;
  if (Math.abs(recomputedCapital - mtmCapital) > SNAPSHOT_TOLERANCE) {
    throw new Error(`Cannot build MTM snapshot for ${snapshotDate}: capital does not reconcile with realized capital plus open P&L.`);
  }
}

function findExistingSnapshot(rows, columnMap, date) {
  return rows.find((row) => {
    return row[columnMap.date] === date && isManagedRow(row, columnMap);
  }) || null;
}

async function createPortfolioRow(config, payload) {
  const response = await supabaseRequest(config, "portfolio", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to create portfolio snapshot: ${errorBody?.message || response.statusText}`);
  }
}

async function updatePortfolioRow(config, columnMap, row, payload) {
  const matcherKey = columnMap.id && row[columnMap.id] != null ? columnMap.id : columnMap.date;
  const matcherValue = matcherKey === columnMap.id ? row[columnMap.id] : row[columnMap.date];
  const response = await supabaseRequest(
    config,
    `portfolio?${matcherKey}=eq.${encodeURIComponent(String(matcherValue))}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to update portfolio snapshot: ${errorBody?.message || response.statusText}`);
  }
}

function mapPortfolioPayload(point, columnMap) {
  const payload = {
    [columnMap.date]: point.date,
    [columnMap.capital]: point.capital,
    [columnMap.source]: point.source
  };

  if (columnMap.realizedPnl && typeof point.realizedPnl !== "undefined") {
    payload[columnMap.realizedPnl] = point.realizedPnl;
  }

  if (columnMap.unrealizedPnl && typeof point.unrealizedPnl !== "undefined") {
    payload[columnMap.unrealizedPnl] = point.unrealizedPnl;
  }

  if (columnMap.closedCount) {
    payload[columnMap.closedCount] = point.closedCount;
  }

  if (columnMap.niftyClose) {
    payload[columnMap.niftyClose] = point.niftyClose;
  }

  return payload;
}

function isManagedRow(row, columnMap) {
  if (!columnMap.source) {
    return true;
  }

  const source = String(row[columnMap.source] || "").trim();
  return source === "trade_journal";
}

function resolveRealizedCapital(row, columnMap) {
  const capital = toNumeric(row[columnMap.capital]);
  const unrealizedPnl = columnMap.unrealizedPnl ? toNumeric(row[columnMap.unrealizedPnl]) : 0;

  return capital - unrealizedPnl;
}

function resolveExistingRealizedPnl(row, columnMap) {
  if (!row || !columnMap.realizedPnl) {
    return 0;
  }

  return toNumeric(row[columnMap.realizedPnl]);
}

function resolveExistingClosedCount(row, columnMap) {
  if (!row || !columnMap.closedCount) {
    return 0;
  }

  return toNumeric(row[columnMap.closedCount]);
}

async function supabaseRequest(config, path, options = {}) {
  const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  return fetch(url, {
    ...options,
    headers
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildCsvRecords(rows) {
  if (rows.length === 0) {
    return [];
  }

  const requiredHeaders = ["symbol", "expiry", "strike", "option_type", "iv"];
  const headerRowIndex = resolveHeaderRowIndex(rows, requiredHeaders);
  const headers = rows[headerRowIndex].map((header) => String(header || "").trim());

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => headers.reduce((record, header, index) => {
      if (header) {
        record[header] = String(row[index] ?? "").trim();
      }

      return record;
    }, {}));
}

function resolveHeaderRowIndex(rows, requiredHeaders) {
  const normalizedRequiredHeaders = requiredHeaders.map((header) => normalizeHeader(header));
  let bestIndex = 0;
  let bestScore = -1;

  rows.forEach((row, index) => {
    const normalizedRow = row.map((cell) => normalizeHeader(cell));
    const score = normalizedRequiredHeaders.reduce((total, header) => total + (normalizedRow.includes(header) ? 1 : 0), 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function resolveNamedCellValue(rows, label) {
  const normalizedLabel = normalizeHeader(label);

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (normalizeHeader(row[index]) !== normalizedLabel) {
        continue;
      }

      const adjacentValue = row[index + 1];
      if (adjacentValue != null && String(adjacentValue).trim() !== "") {
        return String(adjacentValue).trim();
      }
    }
  }

  return "";
}

function parseCsvRows(csvText) {
  const lines = [];
  let currentValue = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      lines.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    lines.push(currentRow);
  }

  return lines.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

function normalizeTradingDate(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return raw;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return raw.toUpperCase();
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0")
  ].join("-");
}

function getYearFractionToExpiry(value) {
  const expiryDate = new Date(`${normalizeTradingDate(value)}T23:59:59`);

  if (Number.isNaN(expiryDate.getTime())) {
    return 0;
  }

  const diffMs = expiryDate.getTime() - Date.now();
  return Math.max(diffMs / (1000 * 60 * 60 * 24 * 365), 0);
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll(/\s+/g, "_");
}

function normalizeValue(value) {
  return String(value ?? "").trim().toUpperCase();
}

function toNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getTodayIsoDate(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function isWeekendDate(dateString, timezone) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  }).format(new Date(`${dateString}T12:00:00Z`));

  return weekday === "Sat" || weekday === "Sun";
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((((a5 * t) + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(x ** 2));
  return sign * y;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
