import { clearElement, createElement } from "../core/dom.js";
import { createSidebar } from "./sidebar.js";

export function createAppShell({ root, routes, store }) {
  clearElement(root);

  const appShell = createElement("div", "app-shell");
  const appFrame = createElement("div", "app-frame");
  const sidebar = createSidebar({ routes, store });
  const contentShell = createElement("div", "content-shell");
  const topbar = createTopbar();
  const contentPanel = createElement("main", "content-panel");
  const contentView = createElement("section", "content-view");

  contentPanel.id = "main-content";
  contentPanel.setAttribute("aria-live", "polite");
  contentView.setAttribute("data-view-root", "");

  contentPanel.appendChild(contentView);
  contentShell.append(topbar.element, contentPanel);
  appFrame.append(sidebar.element, contentShell);
  appShell.appendChild(appFrame);
  root.appendChild(appShell);

  function renderView(route) {
    topbar.update(route);
    sidebar.update(route.id);
    clearElement(contentView);
    contentView.appendChild(route.view(route));
  }

  return { renderView };
}

function createTopbar() {
  const element = createElement("header", "topbar");
  const rail = createElement("div", "topbar-rail");
  const copy = createElement("div", "topbar-copy");
  const kicker = createElement("span", "topbar-kicker");
  const heading = createElement("h2");
  const description = createElement("p");
  const actions = createElement("div", "topbar-actions");
  const modePill = createElement("span", "pill", "Browser Runtime");
  const routePill = createElement("span", "pill");
  const routeLabel = createElement("strong", "", "Route");
  const refreshButton = createElement("button", "button-secondary", "Refresh View");

  refreshButton.type = "button";
  refreshButton.addEventListener("click", () => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  kicker.textContent = "Terminal Monitor";
  routePill.append("Section ", routeLabel);
  copy.append(kicker, heading, description);
  actions.append(modePill, routePill, refreshButton);
  rail.append(copy, actions);
  element.appendChild(rail);

  return {
    element,
    update(route) {
      heading.textContent = route.heading;
      description.textContent = route.description;
      routeLabel.textContent = route.id.toUpperCase();
    }
  };
}
