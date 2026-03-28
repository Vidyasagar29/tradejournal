import { createAppShell } from "./ui/shell.js";
import { createRouter } from "./core/router.js";
import { createStore } from "./core/state.js";
import { routes } from "./routes.js";

const store = createStore({
  activeRoute: "dashboard"
});

const root = document.querySelector("#app");

if (!root) {
  throw new Error("App root element not found.");
}

const shell = createAppShell({
  root,
  routes,
  store
});

createRouter({
  routes,
  store,
  mount: shell.renderView
}).start();
