import { createElement } from "../core/dom.js";

export function createPlaceholderView({ title, description, bullets }) {
  const wrapper = createElement("section", "placeholder-card");
  const kicker = createElement("span", "placeholder-kicker", "Scaffolded");
  const copy = createElement("div", "placeholder-copy");
  const heading = createElement("h2", "", title);
  const paragraph = createElement("p", "", description);
  const list = createElement("ul", "placeholder-list");

  bullets.forEach((bullet) => {
    const item = createElement("li", "", bullet);
    list.appendChild(item);
  });

  copy.append(heading, paragraph);
  wrapper.append(kicker, copy, list);

  return wrapper;
}
