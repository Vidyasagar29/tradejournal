import {
  getSupabaseClient,
  testSupabaseConnection
} from "./supabase-client.js";

const KNOWN_TABLES = [
  "strategies",
  "trades",
  "positions",
  "exits",
  "portfolio",
  "default_iv"
];

export function createDatabase() {
  const client = getSupabaseClient();

  function ensureClient() {
    if (!client) {
      throw new Error("Supabase client is not configured. Update src/js/config/app-config.js.");
    }
  }

  function table(tableName) {
    ensureKnownTable(tableName);

    return {
      async list({ columns = "*", limit = 100, orderBy, ascending = false } = {}) {
        ensureClient();

        let query = client.from(tableName).select(columns).limit(limit);

        if (orderBy) {
          query = query.order(orderBy, { ascending });
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return data ?? [];
      },
      async findBy(field, value, { columns = "*", limit = 100 } = {}) {
        ensureClient();

        const { data, error } = await client
          .from(tableName)
          .select(columns)
          .eq(field, value)
          .limit(limit);

        if (error) {
          throw error;
        }

        return data ?? [];
      },
      async insert(payload) {
        ensureClient();

        const rows = Array.isArray(payload) ? payload : [payload];
        const { data, error } = await client
          .from(tableName)
          .insert(rows)
          .select();

        if (error) {
          throw error;
        }

        return data ?? [];
      },
      async update(matchers, payload) {
        ensureClient();

        let query = client.from(tableName).update(payload);
        query = applyMatchers(query, matchers);

        const { data, error } = await query.select();

        if (error) {
          throw error;
        }

        return data ?? [];
      },
      async remove(matchers) {
        ensureClient();

        let query = client.from(tableName).delete();
        query = applyMatchers(query, matchers);

        const { data, error } = await query.select();

        if (error) {
          throw error;
        }

        return data ?? [];
      }
    };
  }

  return {
    client,
    tables: KNOWN_TABLES.reduce((accumulator, tableName) => {
      accumulator[tableName] = table(tableName);
      return accumulator;
    }, {}),
    table,
    async testConnection() {
      return testSupabaseConnection();
    }
  };
}

function ensureKnownTable(tableName) {
  if (!KNOWN_TABLES.includes(tableName)) {
    throw new Error(`Unknown table "${tableName}". Add it to the database module before use.`);
  }
}

function applyMatchers(query, matchers = {}) {
  return Object.entries(matchers).reduce((currentQuery, [field, value]) => {
    if (Array.isArray(value)) {
      return currentQuery.in(field, value);
    }

    return currentQuery.eq(field, value);
  }, query);
}
