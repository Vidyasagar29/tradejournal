import { portfolioRepository } from "../data/portfolio-repository.js";
import { resolvePortfolioColumnMap } from "../data/portfolio-schema-service.js";

export async function loadNiftyBenchmarkSnapshot(equityCurve) {
  const rows = await loadNiftyHistory();
  const normalizedRows = rows.filter((row) => row.date);
  const priceRows = normalizedRows.filter((row) => Number.isFinite(row.close));
  const alignedComparison = alignBenchmarkWithEquity(equityCurve, priceRows);

  return {
    rows: normalizedRows,
    priceRows,
    comparison: alignedComparison,
    summary: buildBenchmarkSummary(alignedComparison)
  };
}

async function loadNiftyHistory() {
  const storedRows = await loadStoredNiftyHistory();

  if (storedRows.length > 0) {
    return storedRows;
  }

  const csvUrl = window.TRADE_JOURNAL_CONFIG?.googleSheets?.benchmarkCsvUrl?.trim();

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
    return parseBenchmarkCsv(csvText);
  } catch {
    return [];
  }
}

async function loadStoredNiftyHistory() {
  try {
    const columnMap = await resolvePortfolioColumnMap();

    if (!columnMap.date || !columnMap.nifty_close) {
      return [];
    }

    const rows = await portfolioRepository.listSnapshots();

    return rows
      .map((row) => ({
        date: row[columnMap.date] || "",
        close: Number(row[columnMap.nifty_close])
      }))
      .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
      .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  } catch {
    return [];
  }
}

function parseBenchmarkCsv(csvText) {
  const rows = parseCsvRows(csvText);

  if (rows.length <= 1) {
    return [];
  }

  const columns = window.TRADE_JOURNAL_CONFIG?.googleSheets?.columns || {};
  const dateColumn = columns.benchmarkDate || "date";
  const closeColumn = columns.benchmarkClose || "close";
  const headerRowIndex = resolveHeaderRowIndex(rows, [dateColumn, closeColumn]);
  const headers = rows[headerRowIndex].map((header) => String(header || "").trim());

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => headers.reduce((record, header, index) => {
      record[header] = String(row[index] ?? "").trim();
      return record;
    }, {}))
    .map((row) => {
      const closeValue = row[closeColumn];
      const numericClose = Number(closeValue);

      return {
        date: row[dateColumn] || "",
        close: closeValue !== "" && Number.isFinite(numericClose) ? numericClose : null
      };
    })
    .filter((row) => row.date);
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

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "_");
}

function alignBenchmarkWithEquity(equityCurve, benchmarkRows) {
  if (equityCurve.length === 0 || benchmarkRows.length === 0) {
    return [];
  }

  const benchmarkMap = new Map(benchmarkRows.map((row) => [row.date, row.close]));
  const alignedRows = equityCurve
    .filter((point) => benchmarkMap.has(point.date))
    .map((point) => ({
      date: point.date,
      capital: point.capital,
      close: benchmarkMap.get(point.date)
    }))
    .filter((row) => Number.isFinite(row.close));

  if (alignedRows.length === 0) {
    return [];
  }

  const baseCapital = Number(alignedRows[0].capital || 0);
  const baseClose = Number(alignedRows[0].close || 0);

  if (!Number.isFinite(baseCapital) || baseCapital <= 0 || !Number.isFinite(baseClose) || baseClose <= 0) {
    return [];
  }

  return alignedRows.map((row) => {
    const portfolioIndexed = (Number(row.capital) / baseCapital) * 100;
    const benchmarkIndexed = (Number(row.close) / baseClose) * 100;

    return {
      date: row.date,
      capital: row.capital,
      close: row.close,
      portfolioIndexed,
      benchmarkIndexed,
      relativePerformance: portfolioIndexed - benchmarkIndexed
    };
  });
}

function buildBenchmarkSummary(comparison) {
  if (comparison.length === 0) {
    return {
      alignedCount: 0,
      portfolioReturnPercent: 0,
      benchmarkReturnPercent: 0,
      relativePerformancePercent: 0
    };
  }

  const first = comparison[0];
  const last = comparison.at(-1);

  return {
    alignedCount: comparison.length,
    portfolioReturnPercent: last.portfolioIndexed - first.portfolioIndexed,
    benchmarkReturnPercent: last.benchmarkIndexed - first.benchmarkIndexed,
    relativePerformancePercent: last.relativePerformance
  };
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
