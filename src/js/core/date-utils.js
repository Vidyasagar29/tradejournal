const MONTH_INDEX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11
};

export function parseTradingDate(value, options = {}) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const { endOfDay = false } = options;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildLocalDate(Number(year), Number(month) - 1, Number(day), endOfDay);
  }

  const compactMatch = raw.toUpperCase().match(/^(\d{1,2})[\s/-]?([A-Z]{3})[\s/-]?(\d{4})$/);

  if (compactMatch) {
    const [, day, monthCode, year] = compactMatch;
    const monthIndex = MONTH_INDEX[monthCode];

    if (typeof monthIndex === "number") {
      return buildLocalDate(Number(year), monthIndex, Number(day), endOfDay);
    }
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay && !/[T\s]\d{1,2}:\d{2}/.test(raw)) {
    return buildLocalDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), true);
  }

  return parsed;
}

export function normalizeTradingDate(value) {
  const parsed = parseTradingDate(value);

  if (!parsed) {
    return String(value ?? "").trim().toUpperCase();
  }

  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate())
  ].join("-");
}

export function getDaysToExpiry(value) {
  const expiryDate = parseTradingDate(value, { endOfDay: true });

  if (!expiryDate) {
    return 0;
  }

  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
}

export function getYearFractionToExpiry(value) {
  return getDaysToExpiry(value) / 365;
}

function buildLocalDate(year, monthIndex, day, endOfDay) {
  return endOfDay
    ? new Date(year, monthIndex, day, 23, 59, 59, 999)
    : new Date(year, monthIndex, day, 0, 0, 0, 0);
}

function pad(value) {
  return String(value).padStart(2, "0");
}
