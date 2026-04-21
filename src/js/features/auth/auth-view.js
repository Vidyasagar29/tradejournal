import { createElement } from "../../core/dom.js";

let activeDebugPanel = null;
let debugListenerAttached = false;

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
  const debugPanel = createElement("pre", "auth-debug-log");
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
  const passwordToggle = createElement("button", "button-secondary auth-password-toggle", "Show");
  const submitButton = createElement("button", "button-primary", "Sign In");
  const debug = createDebugLogger(debugPanel);

  form.className = "trade-entry-form auth-form";
  form.noValidate = true;
  passwordToggle.type = "button";
  submitButton.type = "submit";
  submitButton.disabled = !isConfigured;

  passwordField.wrapper.classList.add("auth-password-field");
  passwordField.wrapper.appendChild(passwordToggle);
  copy.append(title, description);
  brand.append(mark, copy);
  grid.append(emailField.wrapper, passwordField.wrapper);
  actions.appendChild(submitButton);
  form.append(grid, actions);
  card.append(brand, statusBanner, form, debugPanel);
  wrapper.appendChild(card);

  syncExternalDebug(debugPanel);
  debug("Auth view ready");
  debug(`Supabase configured: ${isConfigured ? "yes" : "no"}`);

  passwordToggle.addEventListener("click", () => {
    const shouldShowPassword = passwordField.input.type === "password";
    passwordField.input.type = shouldShowPassword ? "text" : "password";
    passwordToggle.textContent = shouldShowPassword ? "Hide" : "Show";
    debug(`Password visibility changed: ${shouldShowPassword ? "shown" : "hidden"}`);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    debug("Submit clicked");

    if (!isConfigured) {
      debug("Blocked: Supabase config missing");
      return;
    }

    submitButton.disabled = true;
    statusBanner.textContent = "Signing in...";
    statusBanner.className = "trade-status-banner is-info";
    debug(`Submitting email: ${emailField.input.value.trim() || "(empty)"}`);

    const result = await onSubmit({
      email: emailField.input.value.trim(),
      password: passwordField.input.value
    });

    debug(`Submit result: ${result.ok ? "ok" : "error"}`);

    if (!result.ok) {
      debug(`Error message: ${result.message}`);
      statusBanner.textContent = result.message;
      statusBanner.className = "trade-status-banner is-error";
      submitButton.disabled = false;
      return;
    }

    debug("Waiting for app transition after successful sign-in");
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

function createDebugLogger(panel) {
  return (message) => {
    pushDebugLine(message);
    if (activeDebugPanel === panel) {
      renderDebugPanel(panel, window.__TRADE_JOURNAL_AUTH_DEBUG__);
    }
  };
}

function syncExternalDebug(panel) {
  activeDebugPanel = panel;
  renderDebugPanel(panel, window.__TRADE_JOURNAL_AUTH_DEBUG__);

  if (debugListenerAttached) {
    return;
  }

  window.addEventListener("trade-journal-auth-debug", (event) => {
    if (!activeDebugPanel) {
      return;
    }

    renderDebugPanel(activeDebugPanel, event.detail);
  });
  debugListenerAttached = true;
}

function pushDebugLine(message) {
  const history = window.__TRADE_JOURNAL_AUTH_DEBUG__ || [];
  const timestamp = new Date().toLocaleTimeString("en-IN", {
    hour12: false
  });
  history.push(`[${timestamp}] ${message}`);
  window.__TRADE_JOURNAL_AUTH_DEBUG__ = history.slice(-40);
}

function renderDebugPanel(panel, lines) {
  if (!Array.isArray(lines) || !lines.length) {
    panel.textContent = "Debug trace will appear here.";
    return;
  }

  panel.textContent = lines.join("\n");
}
