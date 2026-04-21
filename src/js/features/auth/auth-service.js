import { getSupabaseClient, isSupabaseConfigured } from "../../data/supabase-client.js";

let authSubscription = null;

export async function getCurrentSession() {
  const client = getConfiguredClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session ?? null;
}

export function subscribeToAuthChanges(listener) {
  const client = getConfiguredClient();

  if (authSubscription) {
    authSubscription.subscription.unsubscribe();
  }

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    listener(session ?? null);
  });

  authSubscription = data;

  return () => {
    authSubscription?.subscription.unsubscribe();
    authSubscription = null;
  };
}

export async function signInWithPassword({ email, password }) {
  const client = getConfiguredClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data.session ?? null;
}

export async function signOutCurrentUser() {
  const client = getConfiguredClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

function getConfiguredClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase auth is not configured. Update src/js/config/app-config.js first.");
  }

  const client = getSupabaseClient();

  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  return client;
}
