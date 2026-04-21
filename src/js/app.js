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

store.subscribe((nextState) => {
  const nextSessionToken = nextState.authSession?.access_token || "__signed_out__";

  if (nextSessionToken === renderedSessionToken) {
    return;
  }

  renderedSessionToken = nextSessionToken;

  if (nextState.authSession) {
    shell.showApp(nextState.authSession);

    if (!routerStarted) {
      if (!window.location.hash) {
        window.location.hash = nextState.activeRoute || "trade-entry";
      }

      router.start();
      routerStarted = true;
    }

    if (!routePreloadStarted) {
      routePreloadStarted = true;
      window.setTimeout(() => {
        preloadRemainingRouteViews(nextState.activeRoute || "trade-entry");
      }, 0);
    }

    return;
  }

  window.location.hash = "";
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
        const session = await signInWithPassword(credentials);

        if (!session) {
          return {
            ok: false,
            message: "Sign-in succeeded but no session was returned. Check Supabase Auth settings."
          };
        }

        store.setState({ authSession: session });
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
