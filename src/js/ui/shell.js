import { clearElement, createElement } from "../core/dom.js";
import { createSidebar } from "./sidebar.js";

export function createAppShell({ root, routes, store, auth }) {
  clearElement(root);

  const appShell = createElement("div", "app-shell");
  const authShell = createElement("div", "auth-shell");
  const appFrame = createElement("div", "app-frame");
  const sidebar = createSidebar({ routes, store });
  const contentShell = createElement("div", "content-shell");
  const topbar = createTopbar(auth);
  const contentPanel = createElement("main", "content-panel");
  const contentView = createElement("section", "content-view");

  contentPanel.id = "main-content";
  contentPanel.setAttribute("aria-live", "polite");
  contentView.setAttribute("data-view-root", "");

  contentPanel.appendChild(contentView);
  contentShell.append(topbar.element, contentPanel);
  appFrame.append(sidebar.element, contentShell);
  appShell.append(authShell, appFrame);
  root.appendChild(appShell);

  let renderToken = 0;

  async function renderView(route) {
    const nextToken = renderToken + 1;
    renderToken = nextToken;
    topbar.update(route);
    sidebar.update(route.id);
    clearElement(contentView);
    contentView.appendChild(createRouteLoadingView(route));

    try {
      const viewFactory = await route.loadView();

      if (renderToken !== nextToken) {
        return;
      }

      clearElement(contentView);
      contentView.appendChild(viewFactory(route));
    } catch (error) {
      if (renderToken !== nextToken) {
        return;
      }

      clearElement(contentView);
      contentView.appendChild(createRouteErrorView(route, error));
    }
  }

  return {
    renderView,
    showAuth(view) {
      authShell.hidden = false;
      appFrame.hidden = true;
      clearElement(authShell);
      authShell.appendChild(view);
    },
    showApp(session) {
      authShell.hidden = true;
      appFrame.hidden = false;
      topbar.setSession(session);
    }
  };
}

function createRouteLoadingView(route) {
  const wrapper = createElement("section", "panel-card auth-card");
  const title = createElement("h3", "", `Loading ${route.label}...`);
  const text = createElement("p", "", "Preparing this tab first. Other tabs can load quietly after the first view is ready.");
  wrapper.append(title, text);
  return wrapper;
}

function createRouteErrorView(route, error) {
  const wrapper = createElement("section", "panel-card auth-card");
  const title = createElement("h3", "", `Unable to load ${route.label}`);
  const text = createElement(
    "p",
    "",
    error instanceof Error ? error.message : "An unknown error occurred while loading this section."
  );
  wrapper.append(title, text);
  return wrapper;
}

function createTopbar(auth) {
  const element = createElement("header", "topbar");
  const rail = createElement("div", "topbar-rail");
  const copy = createElement("div", "topbar-copy");
  const kicker = createElement("span", "topbar-kicker");
  const heading = createElement("h2");
  const description = createElement("p");
  const actions = createElement("div", "topbar-actions");
  const modePill = createElement("span", "pill", "Browser Runtime");
  const routePill = createElement("span", "pill");
  const userPill = createElement("span", "pill");
  const routeLabel = createElement("strong", "", "Route");
  const refreshButton = createElement("button", "button-secondary", "Refresh View");
  const signOutButton = createElement("button", "button-secondary", "Sign Out");

  refreshButton.type = "button";
  refreshButton.addEventListener("click", () => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  signOutButton.type = "button";
  signOutButton.addEventListener("click", async () => {
    if (!auth?.onSignOut) {
      return;
    }

    signOutButton.disabled = true;

    try {
      await auth.onSignOut();
    } finally {
      signOutButton.disabled = false;
    }
  });

  kicker.textContent = "Terminal Monitor";
  routePill.append("Section ", routeLabel);
  copy.append(kicker, heading, description);
  actions.append(modePill, routePill, userPill, refreshButton, signOutButton);
  rail.append(copy, actions);
  element.appendChild(rail);

  return {
    element,
    update(route) {
      heading.textContent = route.heading;
      description.textContent = route.description;
      routeLabel.textContent = route.id.toUpperCase();
    },
    setSession(session) {
      const email = session?.user?.email || "Signed In";
      userPill.textContent = email;
    }
  };
}
