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
  activeRoute: "dashboard",
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

store.subscribe((nextState) => {
  if (nextState.authSession) {
    shell.showApp(nextState.authSession);
    return;
  }

  shell.showAuth(createAuthView({
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
  }));
});

initializeApp();

async function initializeApp() {
  if (!authInitialized) {
    router.start();
    subscribeToAuthChanges((session) => {
      store.setState({ authSession: session });
    });
    authInitialized = true;
  }

  try {
    const session = await getCurrentSession();
    store.setState({ authSession: session });
  } catch (error) {
    shell.showAuth(createAuthView({
      isConfigured: isSupabaseConfigured(),
      onSubmit: async (credentials) => {
        try {
          await signInWithPassword(credentials);
          return { ok: true };
        } catch (signInError) {
          return {
            ok: false,
            message: signInError instanceof Error ? signInError.message : "Unable to sign in."
          };
        }
      }
    }));

    if (error instanceof Error) {
      console.error("Auth bootstrap failed:", error.message);
    }
  }
}
