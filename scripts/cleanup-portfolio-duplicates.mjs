const PORTFOLIO_COLUMN_CANDIDATES = {
  id: ["id"],
  date: ["portfolio_date", "date", "as_of_date", "entry_date", "snapshot_date"],
  capital: ["capital", "ending_capital", "balance", "equity"],
  dailyPnl: ["daily_pnl", "realized_pnl", "pnl", "profit_loss"],
  source: ["source", "origin"]
};

async function main() {
  const config = getConfig();
  const columnMap = await resolvePortfolioColumnMap(config);
  validateColumnMap(columnMap);

  const rows = await fetchPortfolioRows(config);
  const groups = groupRowsByDate(rows, columnMap);
  let deletedCount = 0;
  let updatedCount = 0;

  for (const [, dateRows] of groups) {
    const realizedRows = dateRows.filter((row) => getRowType(row, columnMap) === "realized");
    const mtmRows = dateRows.filter((row) => getRowType(row, columnMap) === "mtm");

    const realizedResult = await normalizeRowSet(config, columnMap, realizedRows, "trade_journal_realized");
    const mtmResult = await normalizeRowSet(config, columnMap, mtmRows, "trade_journal_mtm");

    deletedCount += realizedResult.deletedCount + mtmResult.deletedCount;
    updatedCount += realizedResult.updatedCount + mtmResult.updatedCount;
  }

  console.log(`Portfolio cleanup complete. Updated ${updatedCount} row(s), deleted ${deletedCount} duplicate row(s).`);
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  return { supabaseUrl, serviceRoleKey };
}

async function resolvePortfolioColumnMap(config) {
  const entries = await Promise.all(
    Object.entries(PORTFOLIO_COLUMN_CANDIDATES).map(async ([logicalField, candidates]) => {
      for (const candidate of candidates) {
        const exists = await doesColumnExist(config, candidate);

        if (exists) {
          return [logicalField, candidate];
        }
      }

      return [logicalField, null];
    })
  );

  return Object.fromEntries(entries);
}

async function doesColumnExist(config, columnName) {
  const response = await supabaseRequest(config, `portfolio?select=${encodeURIComponent(columnName)}&limit=1`, {
    method: "GET"
  });

  if (response.ok) {
    return true;
  }

  const errorBody = await safeJson(response);
  const message = String(errorBody?.message || "").toLowerCase();
  return !(message.includes("could not find the") && message.includes("column"))
    && !(message.includes("does not exist") && message.includes("column"));
}

function validateColumnMap(columnMap) {
  if (!columnMap.id || !columnMap.date || !columnMap.source) {
    throw new Error("Portfolio table must expose compatible id, date, and source columns.");
  }
}

async function fetchPortfolioRows(config) {
  const response = await supabaseRequest(config, "portfolio?select=*&order=date.asc", {
    method: "GET"
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to load portfolio rows: ${errorBody?.message || response.statusText}`);
  }

  return response.json();
}

function groupRowsByDate(rows, columnMap) {
  return rows.reduce((map, row) => {
    const date = row[columnMap.date];

    if (!date) {
      return map;
    }

    const bucket = map.get(date) || [];
    bucket.push(row);
    map.set(date, bucket);
    return map;
  }, new Map());
}

function getRowType(row, columnMap) {
  const source = String(row[columnMap.source] || "").trim();

  if (source === "trade_journal_mtm") {
    return "mtm";
  }

  if (source === "" || source === "trade_journal" || source === "trade_journal_realized") {
    return "realized";
  }

  return "other";
}

async function normalizeRowSet(config, columnMap, rows, normalizedSource) {
  if (rows.length <= 1) {
    if (rows.length === 1 && String(rows[0][columnMap.source] || "").trim() !== normalizedSource) {
      await updateRowSource(config, columnMap, rows[0][columnMap.id], normalizedSource);
      return { updatedCount: 1, deletedCount: 0 };
    }

    return { updatedCount: 0, deletedCount: 0 };
  }

  const keeper = selectKeeper(rows, columnMap);
  let updatedCount = 0;
  let deletedCount = 0;

  if (String(keeper[columnMap.source] || "").trim() !== normalizedSource) {
    await updateRowSource(config, columnMap, keeper[columnMap.id], normalizedSource);
    updatedCount += 1;
  }

  for (const row of rows) {
    if (row[columnMap.id] === keeper[columnMap.id]) {
      continue;
    }

    await deleteRow(config, columnMap, row[columnMap.id]);
    deletedCount += 1;
  }

  return { updatedCount, deletedCount };
}

function selectKeeper(rows, columnMap) {
  return [...rows].sort((left, right) => {
    const leftSource = String(left[columnMap.source] || "").trim();
    const rightSource = String(right[columnMap.source] || "").trim();
    const leftPriority = leftSource === "" ? 0 : 1;
    const rightPriority = rightSource === "" ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    return Number(right[columnMap.id] || 0) - Number(left[columnMap.id] || 0);
  })[0];
}

async function updateRowSource(config, columnMap, id, sourceValue) {
  const response = await supabaseRequest(
    config,
    `portfolio?${columnMap.id}=eq.${encodeURIComponent(String(id))}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        [columnMap.source]: sourceValue
      })
    }
  );

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to update portfolio row ${id}: ${errorBody?.message || response.statusText}`);
  }
}

async function deleteRow(config, columnMap, id) {
  const response = await supabaseRequest(
    config,
    `portfolio?${columnMap.id}=eq.${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation"
      }
    }
  );

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(`Unable to delete portfolio row ${id}: ${errorBody?.message || response.statusText}`);
  }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
