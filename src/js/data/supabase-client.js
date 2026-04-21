const DEFAULT_TEST_TABLE = "portfolio";

let cachedClient = null;
let cachedConfig = null;

export function getSupabaseConfig() {
  const config = window.TRADE_JOURNAL_CONFIG || {};

  return {
    url: config.supabaseUrl?.trim() || "",
    anonKey: config.supabaseAnonKey?.trim() || "",
    connectionTestTable: config.connectionTestTable?.trim() || DEFAULT_TEST_TABLE
  };
}

export function isSupabaseConfigured() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey) {
    return null;
  }

  if (!window.supabase?.createClient) {
    throw new Error("Supabase library failed to load from CDN.");
  }

  cachedConfig = config;
  cachedClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return cachedClient;
}

export async function testSupabaseConnection() {
  const config = getSupabaseConfig();

  if (!config.url || !config.anonKey) {
    return {
      ok: false,
      status: "missing_config",
      message: "Add supabaseUrl and supabaseAnonKey in src/js/config/app-config.js."
    };
  }

  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from(config.connectionTestTable)
      .select("*", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      return {
        ok: false,
        status: "query_error",
        message: error.message
      };
    }

    return {
      ok: true,
      status: "connected",
      message: `Connected to Supabase. Test table "${config.connectionTestTable}" is reachable.`
    };
  } catch (error) {
    return {
      ok: false,
      status: "client_error",
      message: error instanceof Error ? error.message : "Unknown Supabase connection error."
    };
  }
}

export function resetSupabaseClient() {
  cachedClient = null;
  cachedConfig = null;
}

export function getCachedSupabaseMetadata() {
  return cachedConfig;
}
