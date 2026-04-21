import { createAppShell } from "./ui/shell.js";
import { createRouter } from "./core/router.js";
import { createStore } from "./core/state.js";
import { preloadRemainingRouteViews, routes } from "./routes.js";
import { createAuthView } from "./features/auth/auth-view.js";
import {
  getCurrentSession,
  signInWithPassword,
  signOutCurrentUser,
  subscribeToAuthChanges
} from "./features/auth/auth-service.js";
import { isSupabaseConfigured } from "./data/supabase-client.js";

const store = createStore({
  activeRoute: "trade-entry",
  authSession: null
});

const root = document.querySelector("#app");

if (!root) {
  throw new Error("App root element not found.");
}

const shell = createAppShell({
  root,
  routes,
  store,
  auth: {
    onSignOut: signOutCurrentUser
  }
});

const router = createRouter({
  routes,
  store,
  mount: shell.renderView
});

let authInitialized = false;
let routerStarted = false;
let renderedSessionToken = "__signed_out__";
let routePreloadStarted = false;

function pushAuthDebug(message) {
  const history = window.__TRADE_JOURNAL_AUTH_DEBUG__ || [];
  const timestamp = new Date().toLocaleTimeString("en-IN", { hour12: false });
  history.push(`[${timestamp}] ${message}`);
  window.__TRADE_JOURNAL_AUTH_DEBUG__ = history.slice(-40);
  window.dispatchEvent(new CustomEvent("trade-journal-auth-debug", {
    detail: window.__TRADE_JOURNAL_AUTH_DEBUG__
  }));
}

store.subscribe((nextState) => {
  const nextSessionToken = nextState.authSession?.access_token || "__signed_out__";

  if (nextSessionToken === renderedSessionToken) {
    return;
  }

  renderedSessionToken = nextSessionToken;
  pushAuthDebug(`Store session changed: ${nextState.authSession ? "signed_in" : "signed_out"}`);

  if (nextState.authSession) {
    pushAuthDebug("Showing app shell");
    shell.showApp(nextState.authSession);

    if (!routerStarted) {
      if (!window.location.hash) {
        pushAuthDebug(`No hash route found. Defaulting to ${nextState.activeRoute || "trade-entry"}`);
        window.location.hash = nextState.activeRoute || "trade-entry";
      }

      pushAuthDebug("Starting router");
      router.start();
      routerStarted = true;
    }

    if (!routePreloadStarted) {
      routePreloadStarted = true;
      window.setTimeout(() => {
        pushAuthDebug(`Preloading remaining routes after ${nextState.activeRoute || "trade-entry"}`);
        preloadRemainingRouteViews(nextState.activeRoute || "trade-entry");
      }, 0);
    }

    return;
  }

  pushAuthDebug("Showing auth view");
  window.location.hash = "";
  shell.showAuth(buildAuthView());
});

initializeApp();

async function initializeApp() {
  if (!authInitialized) {
    subscribeToAuthChanges((session) => {
      pushAuthDebug(`Auth state event received: ${session ? "session_present" : "session_missing"}`);
      store.setState({ authSession: session });
    });
    authInitialized = true;
    pushAuthDebug("Auth subscription initialized");
  }

  pushAuthDebug("Rendering auth view before bootstrap");
  shell.showAuth(buildAuthView());

  try {
    pushAuthDebug("Requesting current session");
    const session = await getCurrentSession();
    pushAuthDebug(`Bootstrap session result: ${session ? "session_present" : "session_missing"}`);
    store.setState({ authSession: session });
  } catch (error) {
    shell.showAuth(buildAuthView());
    pushAuthDebug(`Bootstrap failed: ${error instanceof Error ? error.message : "Unknown error"}`);

    if (error instanceof Error) {
      console.error("Auth bootstrap failed:", error.message);
    }
  }
}

function buildAuthView() {
  return createAuthView({
    isConfigured: isSupabaseConfigured(),
    onSubmit: async (credentials) => {
      try {
        pushAuthDebug(`Sign-in requested for ${credentials.email || "(empty email)"}`);
        const session = await signInWithPassword(credentials);

        if (!session) {
          pushAuthDebug("Sign-in returned without session");
          return {
            ok: false,
            message: "Sign-in succeeded but no session was returned. Check Supabase Auth settings."
          };
        }

        pushAuthDebug("Sign-in returned a session");
        store.setState({ authSession: session });
        return { ok: true };
      } catch (error) {
        pushAuthDebug(`Sign-in failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Unable to sign in."
        };
      }
    }
  });
}
