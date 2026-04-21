import { createAppShell } from "./ui/shell.js";
import { createRouter } from "./core/router.js";
import { createStore } from "./core/state.js";
import { routes } from "./routes.js";
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

store.subscribe((nextState) => {
  if (nextState.authSession) {
    shell.showApp(nextState.authSession);

    if (!routerStarted) {
      if (!window.location.hash) {
        window.location.hash = nextState.activeRoute || "trade-entry";
      }

      router.start();
      routerStarted = true;
    } else {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }

    return;
  }

  shell.showAuth(buildAuthView());
});

initializeApp();

async function initializeApp() {
  if (!authInitialized) {
    subscribeToAuthChanges((session) => {
      store.setState({ authSession: session });
    });
    authInitialized = true;
  }

  shell.showAuth(buildAuthView());

  try {
    const session = await getCurrentSession();
    store.setState({ authSession: session });
  } catch (error) {
    shell.showAuth(buildAuthView());

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
        await signInWithPassword(credentials);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Unable to sign in."
        };
      }
    }
  });
}
