import { createElement } from "../../core/dom.js";
import {
  generateTradeId,
  getTradeEntryDefaults,
  getStrategyNameOptions,
  getTradeTagOptions,
  submitTradeEntry
} from "./trade-entry-service.js";

export function createTradeEntryView() {
  const defaults = getTradeEntryDefaults();
  const wrapper = createElement("section", "trade-entry-layout");
  const formCard = createElement("article", "panel-card trade-entry-card");
  const sectionHeader = createSectionHeader();
  const statusBanner = createElement("div", "trade-status-banner is-info");
  const form = document.createElement("form");
  const grid = createElement("div", "trade-form-grid");
  const actions = createElement("div", "trade-form-actions");
  const saveButton = createElement("button", "button-primary", "Save Trade");
  const resetButton = createElement("button", "button-secondary", "Reset Form");
  const strategyListId = "trade-entry-strategy-list";
  const tradeIdInput = createField({
    label: "Trade ID",
    name: "tradeId",
    type: "text",
    value: defaults.tradeId,
    readOnly: true
  });

  form.className = "trade-entry-form";
  form.noValidate = true;
  statusBanner.textContent = "Ready to capture a new trade. Fill the required fields and save to Supabase.";

  const fields = [
    createField({
      label: "Strategy Name",
      name: "strategyName",
      type: "text",
      value: defaults.strategyName,
      required: true,
      placeholder: "Hedge / Directional / Volatility",
      list: strategyListId
    }),
    createSelectField({ label: "Action", name: "action", value: defaults.action, options: ["Long", "Short"] }),
    createField({ label: "Trade Date", name: "tradeDate", type: "date", value: defaults.tradeDate, required: true }),
    createSelectField({ label: "Instrument Type", name: "instrumentType", value: defaults.instrumentType, options: ["Option", "Future"] }),
    createField({ label: "Symbol", name: "symbol", type: "text", value: defaults.symbol, required: true, placeholder: "NIFTY" }),
    createField({ label: "Expiry", name: "expiry", type: "date", value: defaults.expiry, required: true }),
    createField({ label: "Strike", name: "strike", type: "number", value: defaults.strike, min: "0", step: "0.01", placeholder: "22000" }),
    createSelectField({ label: "Option Type", name: "optionType", value: defaults.optionType, options: ["CE", "PE"] }),
    createField({ label: "Quantity", name: "quantity", type: "number", value: defaults.quantity, min: "1", step: "1", required: true, placeholder: "50" }),
    createField({ label: "Entry Price", name: "entryPrice", type: "number", value: defaults.entryPrice, min: "0", step: "0.01", required: true, placeholder: "125.50" }),
    createField({ label: "Entry IV", name: "entryIv", type: "number", value: defaults.entryIv, min: "0", step: "0.01", placeholder: "15.8" }),
    createSelectField({ label: "Tag", name: "tag", value: defaults.tag, options: getTradeTagOptions(), placeholder: "Select tag" }),
    createTextAreaField({ label: "Notes", name: "notes", value: defaults.notes, rows: 5, placeholder: "Add setup context, thesis, or execution notes." })
  ];
  const fieldMap = Object.fromEntries(fields.map((field) => [field.name, field.input]));

  saveButton.type = "submit";
  resetButton.type = "button";

  grid.appendChild(tradeIdInput.wrapper);

  fields.forEach((field) => {
    if (field.name === "notes") {
      field.wrapper.classList.add("trade-field-full");
    }

    grid.appendChild(field.wrapper);
  });

  resetButton.addEventListener("click", () => {
    form.reset();
    const nextDefaults = getTradeEntryDefaults();
    tradeIdInput.input.value = generateTradeId();
    fieldMap.tradeDate.value = nextDefaults.tradeDate;
    fieldMap.symbol.value = nextDefaults.symbol;
    fieldMap.action.value = "Long";
    fieldMap.instrumentType.value = "Option";
    fieldMap.optionType.value = "CE";
    syncInstrumentState(form);
    setStatus(statusBanner, "Ready to capture a new trade. Fill the required fields and save to Supabase.", "info");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitter = event.submitter || saveButton;
    submitter.disabled = true;
    setStatus(statusBanner, "Saving trade to Supabase...", "info");

    const formData = readTradeFormData(form);
    const result = await submitTradeEntry(formData);

    if (result.ok) {
      setStatus(statusBanner, result.message, "success");
      form.reset();
      const nextDefaults = getTradeEntryDefaults();
      tradeIdInput.input.value = generateTradeId();
      fieldMap.tradeDate.value = nextDefaults.tradeDate;
      fieldMap.symbol.value = nextDefaults.symbol;
      fieldMap.action.value = "Long";
      fieldMap.instrumentType.value = "Option";
      fieldMap.optionType.value = "CE";
      syncInstrumentState(form);
    } else {
      setStatus(statusBanner, result.message, result.type === "validation" ? "warning" : "error");
    }

    submitter.disabled = false;
  });

  actions.append(saveButton, resetButton);
  form.append(grid, actions);
  fieldMap.instrumentType.addEventListener("change", () => {
    syncInstrumentState(form);
  });
  formCard.append(sectionHeader, statusBanner, form);
  wrapper.append(formCard);
  syncInstrumentState(form);
  loadStrategySuggestions(fieldMap.strategyName, strategyListId, statusBanner);

  return wrapper;
}

function createSectionHeader() {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Trade Entry");

  copy.append(title);
  header.appendChild(copy);
  return header;
}

function createField({ label, name, type, value = "", placeholder = "", helper = "", required = false, readOnly = false, min = "", step = "", list = "" }) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const input = document.createElement("input");
  const helperText = helper ? createElement("span", "trade-helper", helper) : null;

  input.name = name;
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.required = required;
  input.readOnly = readOnly;

  if (min) {
    input.min = min;
  }

  if (step) {
    input.step = step;
  }

  if (list) {
    input.setAttribute("list", list);
  }

  wrapper.append(labelText, input);

  if (helperText) {
    wrapper.appendChild(helperText);
  }

  return { wrapper, input, name };
}

async function loadStrategySuggestions(input, listId, statusBanner) {
  try {
    const strategyNames = await getStrategyNameOptions();
    const dataList = document.createElement("datalist");
    dataList.id = listId;

    strategyNames.forEach((strategyName) => {
      const option = document.createElement("option");
      option.value = strategyName;
      dataList.appendChild(option);
    });

    input.parentElement?.appendChild(dataList);
  } catch {
    setStatus(statusBanner, "Strategy suggestions are unavailable right now. You can still type a new strategy name.", "warning");
  }
}

function createSelectField({ label, name, value = "", options, placeholder = "" }) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const select = document.createElement("select");

  select.name = name;

  if (placeholder) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.appendChild(option);
  }

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue || placeholder;
    select.appendChild(option);
  });

  select.value = value;
  wrapper.append(labelText, select);

  return { wrapper, input: select, name };
}

function createTextAreaField({ label, name, value = "", rows = 4, placeholder = "" }) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const textArea = document.createElement("textarea");

  textArea.name = name;
  textArea.rows = rows;
  textArea.value = value;
  textArea.placeholder = placeholder;

  wrapper.append(labelText, textArea);
  return { wrapper, input: textArea, name };
}

function readTradeFormData(form) {
  const formData = new FormData(form);

  return {
    tradeId: String(formData.get("tradeId") || ""),
    strategyName: String(formData.get("strategyName") || ""),
    action: String(formData.get("action") || "Long"),
    tradeDate: String(formData.get("tradeDate") || ""),
    symbol: String(formData.get("symbol") || ""),
    instrumentType: String(formData.get("instrumentType") || "Option"),
    expiry: String(formData.get("expiry") || ""),
    strike: String(formData.get("strike") || ""),
    optionType: String(formData.get("optionType") || ""),
    quantity: String(formData.get("quantity") || ""),
    entryPrice: String(formData.get("entryPrice") || ""),
    entryIv: String(formData.get("entryIv") || ""),
    tag: String(formData.get("tag") || ""),
    notes: String(formData.get("notes") || "")
  };
}

function syncInstrumentState(form) {
  const instrumentType = form.elements.namedItem("instrumentType").value;
  const strikeInput = form.elements.namedItem("strike");
  const optionTypeInput = form.elements.namedItem("optionType");
  const isOption = instrumentType === "Option";

  strikeInput.disabled = !isOption;
  optionTypeInput.disabled = !isOption;

  if (!isOption) {
    strikeInput.value = "";
    optionTypeInput.value = "";
  } else if (!optionTypeInput.value) {
    optionTypeInput.value = "CE";
  }
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.className = `trade-status-banner is-${tone}`;
}
