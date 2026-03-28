import { createElement } from "../core/dom.js";

export function createSidebar({ routes }) {
  const element = createElement("aside", "sidebar");
  const brand = createBrandBlock();
  const meta = createSidebarMeta();
  const navLabel = createElement("div", "sidebar-section-label", "Workspace");
  const nav = createElement("nav", "sidebar-nav");
  const footer = createSidebarFooter();

  const buttons = routes.map((route, index) => {
    const button = createElement("button", "nav-button");
    const text = createElement("span", "nav-text");
    const title = createElement("span", "nav-title", route.label);
    const subtitle = createElement("span", "nav-subtitle", route.subtitle);
    const order = createElement("span", "nav-index", String(index + 1).padStart(2, "0"));

    button.type = "button";
    button.dataset.route = route.id;
    button.addEventListener("click", () => {
      window.location.hash = route.id;
    });

    text.append(title, subtitle);
    button.append(text, order);
    nav.appendChild(button);

    return button;
  });

  element.append(brand, meta, navLabel, nav, footer);

  return {
    element,
    update(activeRoute) {
      buttons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.route === activeRoute);
      });
    }
  };
}

function createBrandBlock() {
  const container = createElement("div", "brand-block");
  const mark = createElement("div", "brand-mark", "TJ");
  const text = createElement("div", "brand-text");
  const heading = createElement("h1", "", "Trade Journal");
  const subheading = createElement("p", "", "Options and futures command view");

  text.append(heading, subheading);
  container.append(mark, text);
  return container;
}

function createSidebarMeta() {
  const container = createElement("div", "sidebar-meta");
  const marketBlock = createElement("div", "sidebar-meta-card");
  const marketLabel = createElement("span", "sidebar-meta-label", "Session");
  const marketValue = createElement("strong", "", "LIVE");
  const modeBlock = createElement("div", "sidebar-meta-card");
  const modeLabel = createElement("span", "sidebar-meta-label", "Interface");
  const modeValue = createElement("strong", "", "Terminal");

  marketBlock.append(marketLabel, marketValue);
  modeBlock.append(modeLabel, modeValue);
  container.append(marketBlock, modeBlock);
  return container;
}

function createSidebarFooter() {
  const container = createElement("div", "sidebar-footer");
  const heading = createElement("span", "sidebar-section-label", "Status");
  const line = createElement("p", "sidebar-footer-copy", "Presentation refreshed without changing trading workflows.");

  container.append(heading, line);
  return container;
}
