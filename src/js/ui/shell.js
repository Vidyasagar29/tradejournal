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

  function renderView(route) {
    topbar.update(route);
    sidebar.update(route.id);
    clearElement(contentView);
    contentView.appendChild(route.view(route));
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
