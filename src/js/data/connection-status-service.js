import {
  getCachedSupabaseMetadata,
  getSupabaseConfig,
  isSupabaseConfigured,
  testSupabaseConnection
} from "./supabase-client.js";

let connectionState = buildInitialState();

export function getConnectionState() {
  return { ...connectionState };
}

export async function runConnectionTest() {
  setConnectionState({
    ...connectionState,
    isLoading: true,
    message: "Testing database connection..."
  });

  const result = await testSupabaseConnection();

  setConnectionState({
    isConfigured: isSupabaseConfigured(),
    isConnected: result.ok,
    isLoading: false,
    status: result.status,
    message: result.message,
    metadata: getCachedSupabaseMetadata() || getSupabaseConfig()
  });

  return result;
}

function buildInitialState() {
  const config = getSupabaseConfig();

  return {
    isConfigured: isSupabaseConfigured(),
    isConnected: false,
    isLoading: false,
    status: isSupabaseConfigured() ? "idle" : "missing_config",
    message: isSupabaseConfigured()
      ? "Supabase config found. Run the connection test to verify database access."
      : "Supabase config is missing. Update src/js/config/app-config.js to continue.",
    metadata: config
  };
}

function setConnectionState(nextState) {
  connectionState = nextState;
}
