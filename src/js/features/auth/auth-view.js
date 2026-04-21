import { createElement } from "../../core/dom.js";

export function createAuthView({ onSubmit, isConfigured }) {
  const wrapper = createElement("section", "auth-layout");
  const card = createElement("article", "panel-card auth-card");
  const brand = createElement("div", "auth-brand");
  const mark = createElement("div", "brand-mark", "TJ");
  const copy = createElement("div", "auth-copy");
  const title = createElement("h2", "", "Secure Sign In");
  const description = createElement("p", "", "Sign in with your Supabase account to open the dashboard and write data.");
  const statusBanner = createElement(
    "div",
    `trade-status-banner ${isConfigured ? "is-info" : "is-error"}`,
    isConfigured
      ? "Supabase Auth is ready. Enter your email and password."
      : "Supabase config is missing. Update src/js/config/app-config.js before signing in."
  );
  const form = document.createElement("form");
  const grid = createElement("div", "trade-form-grid");
  const actions = createElement("div", "trade-form-actions");
  const emailField = createField({
    label: "Email",
    name: "email",
    type: "email",
    placeholder: "you@example.com",
    required: true
  });
  const passwordField = createField({
    label: "Password",
    name: "password",
    type: "password",
    placeholder: "Enter your password",
    required: true
  });
  const submitButton = createElement("button", "button-primary", "Sign In");

  form.className = "trade-entry-form auth-form";
  form.noValidate = true;
  submitButton.type = "submit";
  submitButton.disabled = !isConfigured;

  copy.append(title, description);
  brand.append(mark, copy);
  grid.append(emailField.wrapper, passwordField.wrapper);
  actions.appendChild(submitButton);
  form.append(grid, actions);
  card.append(brand, statusBanner, form);
  wrapper.appendChild(card);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isConfigured) {
      return;
    }

    submitButton.disabled = true;
    statusBanner.textContent = "Signing in...";
    statusBanner.className = "trade-status-banner is-info";

    const result = await onSubmit({
      email: emailField.input.value.trim(),
      password: passwordField.input.value
    });

    if (!result.ok) {
      statusBanner.textContent = result.message;
      statusBanner.className = "trade-status-banner is-error";
      submitButton.disabled = false;
    }
  });

  return wrapper;
}

function createField({ label, name, type, placeholder = "", required = false }) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const input = document.createElement("input");

  input.name = name;
  input.type = type;
  input.placeholder = placeholder;
  input.required = required;
  input.autocomplete = type === "password" ? "current-password" : "email";

  wrapper.append(labelText, input);
  return { wrapper, input };
}
