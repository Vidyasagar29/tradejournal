import { createDatabase } from "./database.js";
import { normalizeTradingDate } from "../core/date-utils.js";

const database = createDatabase();
const DEFAULT_IV = 18;
const sheetSymbolSpotCache = new Map();
const sheetCurrentPriceIvCache = new Map();

export const marketDataService = {
  async loadMarketData() {
    return this.loadGoogleSheetMarketData();
  },
  async loadDefaultIv() {
    try {
      return await database.tables.default_iv.list({
        columns: "*",
        limit: 500
      });
    } catch {
      return [];
    }
  },
  async buildMarketContext() {
    const [marketData, defaultIvRows] = await Promise.all([
      this.loadMarketData(),
      this.loadDefaultIv()
    ]);

    return {
      marketData,
      defaultIvRows,
      defaultIv: resolveDefaultIvValue(defaultIvRows),
      symbolSpots: buildSymbolSpotMap(marketData),
      currentPriceIvs: buildCurrentPriceIvMap()
    };
  },
  resolveInputs(position, context) {
    const marketRow = matchMarketRow(position, context.marketData);
    const sheetOptionIv = resolveSheetOptionIv(position, context.currentPriceIvs);
    const defaultIv = resolveSymbolDefaultIv(position, context.defaultIvRows) ?? context.defaultIv ?? DEFAULT_IV;
    const sheetIv = pickFirstNumber([
      marketRow?.iv,
      marketRow?.IV,
      marketRow?.implied_volatility,
      marketRow?.default_iv
    ]);
    const entryIv = pickFirstNumber([position.entryIv]);
    const ivValue = pickFirstNumber([sheetIv, sheetOptionIv, defaultIv, entryIv, DEFAULT_IV]);
    const ivSource = sheetIv != null
      ? "google_sheet"
      : sheetOptionIv != null
        ? "google_sheet_named"
      : defaultIv != null
        ? "default_iv"
        : entryIv != null
          ? "entry_iv"
          : "fallback";
    const spotPrice = pickFirstNumber([
      marketRow?.spot,
      marketRow?.spot_price,
      marketRow?.underlying_price,
      context.symbolSpots?.get(normalizeValue(position.symbol))
    ]);

    return {
      iv: ivValue,
      ivSource,
      spotPrice
    };
  }
};

marketDataService.loadGoogleSheetMarketData = async function loadGoogleSheetMarketData() {
  const csvUrl = window.TRADE_JOURNAL_CONFIG?.googleSheets?.marketDataCsvUrl?.trim();

  if (!csvUrl) {
    return [];
  }

  try {
    const response = await fetch(csvUrl, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      return [];
    }

    const csvText = await response.text();
    const parsedRows = parseCsvRows(csvText);
    const niftySpotLabel = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns?.niftySpot || "Nifty_50";
    const putIvLabel = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns?.putIv || "PUT_IV";
    const callIvLabel = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns?.callIv || "CALL_IV";
    const dedicatedNiftySpot = resolveNamedCellValue(parsedRows, niftySpotLabel);
    const dedicatedPutIv = resolveNamedCellValue(parsedRows, putIvLabel);
    const dedicatedCallIv = resolveNamedCellValue(parsedRows, callIvLabel);
    sheetSymbolSpotCache.clear();
    sheetCurrentPriceIvCache.clear();

    if (dedicatedNiftySpot) {
      sheetSymbolSpotCache.set("NIFTY", dedicatedNiftySpot);
    }

    if (dedicatedPutIv) {
      sheetCurrentPriceIvCache.set("PE", dedicatedPutIv);
    }

    if (dedicatedCallIv) {
      sheetCurrentPriceIvCache.set("CE", dedicatedCallIv);
    }

    return normalizeSheetRows(buildCsvRecords(parsedRows), dedicatedNiftySpot);
  } catch {
    return [];
  }
};

function matchMarketRow(position, rows) {
  return rows.find((row) => {
    const symbolMatches = normalizeValue(row.symbol) === normalizeValue(position.symbol);
    const expiryMatches = normalizeDateValue(row.expiry) === normalizeDateValue(position.expiry);
    const strikeMatches = matchesStrike(row.strike, position.strike);
    const typeMatches = normalizeValue(row.type ?? row.option_type) === normalizeValue(position.optionType);

    return symbolMatches && expiryMatches && strikeMatches && typeMatches;
  }) || null;
}

function resolveDefaultIvValue(rows) {
  const numeric = rows
    .map((row) => pickFirstNumber([row.iv, row.default_iv, row.value]))
    .find((value) => value != null);

  return numeric ?? DEFAULT_IV;
}

function resolveSymbolDefaultIv(position, rows) {
  const match = rows.find((row) => {
    return String(row.symbol ?? "").toUpperCase() === String(position.symbol ?? "").toUpperCase();
  });

  return match ? pickFirstNumber([match.iv, match.default_iv, match.value]) : null;
}

function normalizeSheetRows(rows, dedicatedNiftySpot = "") {
  const columns = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns || {};
  const symbolColumn = columns.symbol || "symbol";
  const expiryColumn = columns.expiry || "expiry";
  const strikeColumn = columns.strike || "strike";
  const optionTypeColumn = columns.optionType || "option_type";
  const ivColumn = columns.iv || "iv";
  const niftySpotColumn = columns.niftySpot || "Nifty_50";

  return rows
    .filter((row) => {
      return row[symbolColumn] || row[expiryColumn] || row[strikeColumn] || row[optionTypeColumn] || row[ivColumn];
    })
    .map((row) => ({
      symbol: String(row[symbolColumn] || "").trim(),
      expiry: String(row[expiryColumn] || "").trim(),
      strike: String(row[strikeColumn] || "").trim(),
      type: String(row[optionTypeColumn] || "").trim(),
      iv: row[ivColumn] || "",
      spot: resolveSheetSpot(row, niftySpotColumn, dedicatedNiftySpot)
    }));
}

function resolveSheetSpot(row, niftySpotColumn, dedicatedNiftySpot) {
  const symbol = String(row[window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns?.symbol || "symbol"] || "").toUpperCase();

  if (symbol === "NIFTY") {
    return row[niftySpotColumn] || dedicatedNiftySpot || "";
  }

  const genericSpot = row.spot || row.spot_price || row.underlying_price || "";
  return genericSpot;
}

function buildSymbolSpotMap(rows) {
  const spotMap = new Map(sheetSymbolSpotCache);

  rows.forEach((row) => {
    const symbol = normalizeValue(row.symbol);
    const spot = pickFirstNumber([
      row.spot,
      row.spot_price,
      row.underlying_price
    ]);

    if (symbol && spot != null && !spotMap.has(symbol)) {
      spotMap.set(symbol, spot);
    }
  });

  return spotMap;
}

function buildCurrentPriceIvMap() {
  return new Map(sheetCurrentPriceIvCache);
}

function resolveSheetOptionIv(position, currentPriceIvs) {
  const optionType = normalizeValue(position.optionType);

  if (!currentPriceIvs || (optionType !== "CE" && optionType !== "PE")) {
    return null;
  }

  return pickFirstNumber([currentPriceIvs.get(optionType)]);
}

function pickFirstNumber(values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  return null;
}

function normalizeValue(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeDateValue(value) {
  return normalizeTradingDate(value);
}

function matchesStrike(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return Math.abs(leftNumber - rightNumber) < 0.0001;
  }

  return normalizeValue(left) === normalizeValue(right);
}

function buildCsvRecords(rows) {
  if (rows.length === 0) {
    return [];
  }

  const columns = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns || {};
  const requiredHeaders = [
    columns.symbol || "symbol",
    columns.expiry || "expiry",
    columns.strike || "strike",
    columns.optionType || "option_type",
    columns.iv || "iv"
  ];
  const headerRowIndex = resolveHeaderRowIndex(rows, requiredHeaders);
  const headers = rows[headerRowIndex].map((header) => String(header || "").trim());

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      return headers.reduce((record, header, index) => {
        if (header) {
          record[header] = String(row[index] ?? "").trim();
        }

        return record;
      }, {});
    });
}

function resolveHeaderRowIndex(rows, requiredHeaders) {
  const normalizedRequiredHeaders = requiredHeaders.map((header) => normalizeHeader(header));
  let bestIndex = 0;
  let bestScore = -1;

  rows.forEach((row, index) => {
    const normalizedRow = row.map((cell) => normalizeHeader(cell));
    const score = normalizedRequiredHeaders.reduce((total, header) => {
      return total + (normalizedRow.includes(header) ? 1 : 0);
    }, 0);

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

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "_");
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

  if (lines.length === 0) {
    return [];
  }

  return lines.map((row) => row.map((cell) => String(cell ?? "").trim()));
}
