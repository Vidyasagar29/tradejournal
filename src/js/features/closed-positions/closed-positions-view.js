import { createElement } from "../../core/dom.js";
import {
  deleteClosedPosition,
  getClosedPositionsSnapshot,
  updateClosedPosition
} from "./closed-positions-service.js";

export function createClosedPositionsView() {
  const wrapper = createElement("section", "closed-positions-layout");
  const card = createElement("article", "panel-card closed-positions-card");
  const header = createHeader();
  const statusBanner = createElement("div", "trade-status-banner is-info");
  const summaryGrid = createElement("section", "closed-summary-grid");
  const filters = createFilterBar();
  const filteredSummary = createElement("div", "closed-filter-summary");
  const tableWrap = createElement("div", "closed-table-wrap");
  const table = createElement("table", "closed-table");
  const tableHead = document.createElement("thead");
  const tableBody = document.createElement("tbody");
  const modal = createModal();

  let snapshotState = [];
  let selectedTradeIds = new Set();

  statusBanner.textContent = "Loading closed positions...";
  tableHead.innerHTML = `
    <tr>
      <th><input type="checkbox" class="closed-row-checkbox" aria-label="Select all closed trades"></th>
      <th>Strategy</th>
      <th>Side</th>
      <th>Symbol</th>
      <th>Expiry</th>
      <th>Strike</th>
      <th>Type</th>
      <th>Qty</th>
      <th>Entry</th>
      <th>Exit</th>
      <th>P&L</th>
      <th>Tag</th>
      <th>Entry Date</th>
      <th>Exit Date</th>
      <th>View</th>
    </tr>
  `;

  table.append(tableHead, tableBody);
  tableWrap.appendChild(table);
  card.append(header, statusBanner, summaryGrid, filters.element, filteredSummary, tableWrap);
  wrapper.append(card, modal.overlay);

  const selectAllCheckbox = tableHead.querySelector('input[type="checkbox"]');

  filters.onChange(() => {
    renderFilteredState();
  });

  selectAllCheckbox?.addEventListener("change", () => {
    const filteredPositions = applyFilters(snapshotState, filters.getValue());

    if (selectAllCheckbox.checked) {
      filteredPositions.forEach((position) => selectedTradeIds.add(position.tradeId));
    } else {
      filteredPositions.forEach((position) => selectedTradeIds.delete(position.tradeId));
    }

    renderFilteredState();
  });

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await getClosedPositionsSnapshot();
      snapshotState = snapshot.positions;
      renderSummary(summaryGrid, snapshot.summary);
      populateFilterOptions(filters, snapshot.positions);
      syncSelectionState(snapshotState, selectedTradeIds);
      renderFilteredState();
      setStatus(statusBanner, `Loaded ${snapshot.summary.closedCount} closed position(s).`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load closed positions.";
      setStatus(statusBanner, message, "error");
      tableBody.innerHTML = `<tr><td colspan="15" class="positions-empty">${escapeHtml(message)}</td></tr>`;
    }
  }

  function renderFilteredState() {
    const filteredPositions = applyFilters(snapshotState, filters.getValue());
    renderFilteredSummary(filteredSummary, filteredPositions, snapshotState.length, selectedTradeIds);
    renderTable(
      filteredPositions,
      tableBody,
      modal,
      loadSnapshot,
      statusBanner,
      selectedTradeIds,
      () => renderFilteredState(),
      selectAllCheckbox
    );
  }
}

function createHeader() {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Closed Positions");
  copy.appendChild(title);
  header.appendChild(copy);
  return header;
}

function createFilterBar() {
  const element = createElement("div", "closed-filter-bar");
  const symbol = createSelect("All Symbols");
  const strategy = createSelect("All Strategies");
  const tag = createSelect("All Tags");
  const side = createSelect("All Sides");
  const optionType = createSelect("All Types");
  const sort = createSelect("Sort Order");
  const dateFrom = document.createElement("input");
  const dateTo = document.createElement("input");
  const search = document.createElement("input");
  const listeners = new Set();

  dateFrom.type = "date";
  dateFrom.className = "closed-filter-input";
  dateFrom.setAttribute("aria-label", "Closed from date");

  dateTo.type = "date";
  dateTo.className = "closed-filter-input";
  dateTo.setAttribute("aria-label", "Closed to date");

  search.type = "search";
  search.className = "closed-filter-input";
  search.placeholder = "Search symbol or strategy";

  setSelectOptions(sort, "Sort Order", [
    { value: "exit-desc", label: "Exit Date: Newest" },
    { value: "exit-asc", label: "Exit Date: Oldest" },
    { value: "entry-asc", label: "Entry Date: Oldest" },
    { value: "entry-desc", label: "Entry Date: Newest" }
  ]);
  sort.value = "exit-desc";

  [symbol, strategy, tag, side, optionType, sort, dateFrom, dateTo, search].forEach((control) => {
    control.addEventListener("input", () => {
      listeners.forEach((listener) => listener());
    });
  });

  element.append(symbol, strategy, tag, side, optionType, sort, dateFrom, dateTo, search);

  return {
    element,
    onChange(listener) {
      listeners.add(listener);
    },
    getValue() {
      return {
        symbol: symbol.value,
        strategy: strategy.value,
        tag: tag.value,
        side: side.value,
        optionType: optionType.value,
        sortBy: sort.value || "exit-desc",
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        search: search.value.trim().toLowerCase()
      };
    },
    setOptions({ symbols, strategies, tags, sides, optionTypes }) {
      setSelectOptions(symbol, "All Symbols", symbols);
      setSelectOptions(strategy, "All Strategies", strategies);
      setSelectOptions(tag, "All Tags", tags);
      setSelectOptions(side, "All Sides", sides);
      setSelectOptions(optionType, "All Types", optionTypes);
    }
  };
}

function createSelect(defaultLabel) {
  const select = document.createElement("select");
  select.className = "closed-filter-select";
  setSelectOptions(select, defaultLabel, []);
  return select;
}

function setSelectOptions(select, defaultLabel, values) {
  const currentValue = select.value;
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  select.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    if (typeof value === "string") {
      option.value = value;
      option.textContent = value;
    } else {
      option.value = value.value;
      option.textContent = value.label;
    }
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function populateFilterOptions(filters, positions) {
  filters.setOptions({
    symbols: sortUnique(positions.map((item) => item.symbol)),
    strategies: sortUnique(positions.map((item) => item.strategyName)),
    tags: sortUnique(positions.map((item) => item.tag).filter((value) => value && value !== "-")),
    sides: sortUnique(positions.map((item) => item.action).filter((value) => value && value !== "-")),
    optionTypes: sortUnique(positions.map((item) => getInstrumentLabel(item)).filter((value) => value && value !== "-"))
  });
}

function renderSummary(container, summary) {
  const realizedPnlClass = summary.totalRealizedPnl >= 0 ? "value-positive" : "value-negative";

  container.innerHTML = `
    <article class="trade-summary-block closed-stat-card">
      <span>Closed Trades</span>
      <strong>${summary.closedCount}</strong>
    </article>
    <article class="trade-summary-block closed-stat-card">
      <span>Closed Qty</span>
      <strong>${summary.totalClosedQty}</strong>
    </article>
    <article class="trade-summary-block closed-stat-card">
      <span>Wins</span>
      <strong>${summary.winCount}</strong>
    </article>
    <article class="trade-summary-block closed-stat-card">
      <span>Losses</span>
      <strong>${summary.lossCount}</strong>
    </article>
    <article class="trade-summary-block closed-stat-card">
      <span>Realized P&L</span>
      <strong class="${realizedPnlClass}">${formatSigned(summary.totalRealizedPnl)}</strong>
    </article>
    <article class="trade-summary-block closed-stat-card">
      <span>Win Rate</span>
      <strong>${formatPercent(summary.winRate)}</strong>
    </article>
  `;
}

function renderFilteredSummary(container, positions, totalCount, selectedTradeIds) {
  const selectedPositions = positions.filter((position) => selectedTradeIds.has(position.tradeId));
  const scopedPositions = selectedPositions.length > 0 ? selectedPositions : positions;
  const scopedPnl = scopedPositions.reduce((total, position) => total + Number(position.realizedPnl || 0), 0);
  const winCount = scopedPositions.filter((position) => Number(position.realizedPnl || 0) > 0).length;
  const lossCount = scopedPositions.filter((position) => Number(position.realizedPnl || 0) < 0).length;
  const isFiltered = positions.length !== totalCount;
  const hasSelection = selectedPositions.length > 0;
  const scopeLabel = hasSelection
    ? "Selected Trades"
    : isFiltered
      ? "Filtered View"
      : "All Visible Rows";
  const pnlToneClass = scopedPnl >= 0 ? "is-positive" : "is-negative";

  container.innerHTML = `
    <span class="closed-filter-pill">${scopeLabel}</span>
    <span>Trades <strong>${scopedPositions.length}</strong></span>
    <span class="${pnlToneClass}">P&amp;L <strong>${formatSigned(scopedPnl)}</strong></span>
    <span>Wins <strong>${winCount}</strong></span>
    <span>Losses <strong>${lossCount}</strong></span>
    ${hasSelection ? `<span>Visible Rows <strong>${positions.length}</strong></span>` : ""}
  `;
}

function renderTable(positions, tableBody, modal, reload, statusBanner, selectedTradeIds, onSelectionChange, selectAllCheckbox) {
  tableBody.innerHTML = "";

  if (positions.length === 0) {
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    tableBody.innerHTML = `<tr><td colspan="15" class="positions-empty">No closed positions match the current filters.</td></tr>`;
    return;
  }

  positions.forEach((position) => {
    const row = document.createElement("tr");
    const checkboxCell = document.createElement("td");
    const viewCell = document.createElement("td");
    const button = createElement("button", "button-secondary closed-view-btn", "View");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = "closed-row-checkbox";
    checkbox.checked = selectedTradeIds.has(position.tradeId);
    checkbox.setAttribute("aria-label", `Select ${position.symbol} ${position.tradeDate}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedTradeIds.add(position.tradeId);
      } else {
        selectedTradeIds.delete(position.tradeId);
      }

      updateSelectAllState(selectAllCheckbox, positions, selectedTradeIds);
      onSelectionChange();
    });

    row.innerHTML = `
      <td>${escapeHtml(position.strategyName)}</td>
      <td><span class="closed-side-badge ${getSideTone(position.action)}">${escapeHtml(position.action || "-")}</span></td>
      <td>${escapeHtml(position.symbol)}</td>
      <td>${escapeHtml(position.expiry)}</td>
      <td>${formatNumber(position.strike)}</td>
      <td>${escapeHtml(getInstrumentLabel(position))}</td>
      <td>${position.qty}</td>
      <td>${formatNumber(position.entryPrice)}</td>
      <td>${formatNumber(position.averageExitPrice)}</td>
      <td class="${position.realizedPnl >= 0 ? "closed-pnl-positive" : "closed-pnl-negative"}">${formatSigned(position.realizedPnl)}</td>
      <td>${escapeHtml(position.tag)}</td>
      <td>${escapeHtml(position.tradeDate)}</td>
      <td>${escapeHtml(position.lastExitDate)}</td>
    `;

    button.type = "button";
    button.addEventListener("click", () => {
      openModal(position, modal, reload, statusBanner);
    });

    checkboxCell.appendChild(checkbox);
    row.insertBefore(checkboxCell, row.firstChild);
    viewCell.appendChild(button);
    row.appendChild(viewCell);
    tableBody.appendChild(row);
  });

  updateSelectAllState(selectAllCheckbox, positions, selectedTradeIds);
}

function openModal(position, modal, reload, statusBanner) {
  modal.body.innerHTML = "";
  modal.overlay.classList.remove("is-hidden");

  const header = createElement("div", "closed-modal-header");
  const title = createElement("h3", "", "Closed Trade Details");
  const actions = createElement("div", "closed-modal-actions");
  const editButton = createElement("button", "button-primary", "Save Changes");
  const deleteButton = createElement("button", "button-secondary closed-delete-btn", "Delete");
  const closeButton = createElement("button", "closed-modal-close", "Close");
  const hero = createElement("div", "closed-modal-hero");
  const stats = createElement("div", "closed-inline-meta");
  const tradeSection = createElement("section", "closed-trade-section");
  const tradeHeading = createElement("h5", "", "Trade Snapshot");
  const tradeColumns = createElement("div", "closed-trade-columns");
  const tradeRow = createElement("div", "closed-trade-row");
  const editSection = createElement("section", "positions-squareoff-card");
  const exitSection = createElement("section", "closed-exit-section");
  const exitHeading = createElement("h5", "", "Exit History");
  const exitColumns = createElement("div", "closed-exit-columns");
  const exitList = createElement("div", "closed-exit-list");
  const editForm = document.createElement("form");
  const editGrid = createElement("div", "positions-squareoff-grid");

  closeButton.type = "button";
  editButton.type = "button";
  deleteButton.type = "button";
  closeButton.addEventListener("click", () => closeModal(modal.overlay, modal.body));
  editButton.addEventListener("click", () => {
    editForm.requestSubmit();
  });
  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete this closed trade, its position record, and all exit history?");

    if (!confirmed) {
      return;
    }

    deleteButton.disabled = true;
    setStatus(statusBanner, "Deleting closed trade and linked records...", "info");

    try {
      await deleteClosedPosition({
        positionId: position.positionId,
        tradeId: position.tradeId
      });

      closeModal(modal.overlay, modal.body);
      setStatus(statusBanner, "Closed trade deleted successfully.", "success");
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the closed trade.";
      setStatus(statusBanner, message, "error");
      deleteButton.disabled = false;
    }
  });
  actions.append(editButton, deleteButton, closeButton);
  header.append(title, actions);

  hero.innerHTML = `
    <h4>${escapeHtml(position.symbol)} ${escapeHtml(position.optionType !== "-" ? position.optionType : "")}</h4>
    <p>${escapeHtml(position.action || "-")} | ${escapeHtml(position.strategyName)} | ${escapeHtml(position.instrument)} | Qty ${position.qty}</p>
  `;

  stats.innerHTML = `
    <span>Trade <strong>${escapeHtml(position.tradeDate)}</strong></span>
    <span>Side <strong>${escapeHtml(position.action || "-")}</strong></span>
    <span>Exit <strong>${escapeHtml(position.lastExitDate)}</strong></span>
    <span>Expiry <strong>${escapeHtml(position.expiry)}</strong></span>
    <span>Strike <strong>${escapeHtml(position.strike)}</strong></span>
    <span class="${position.realizedPnl >= 0 ? "is-positive" : "is-negative"}">P&L <strong>${formatSigned(position.realizedPnl)}</strong></span>
  `;

  tradeColumns.innerHTML = `
    <span>Date</span>
    <span>Symbol</span>
    <span>Qty</span>
    <span>Entry</span>
    <span>Exit Avg</span>
    <span>Tag</span>
  `;

  tradeRow.innerHTML = `
    <span>${escapeHtml(position.tradeDate)}</span>
    <span>${escapeHtml(position.symbol)} ${escapeHtml(position.optionType !== "-" ? position.optionType : "")}</span>
    <span>${position.qty}</span>
    <span>${formatNumber(position.entryPrice)}</span>
    <span>${formatNumber(position.averageExitPrice)}</span>
    <span>${escapeHtml(position.tag)}</span>
  `;

  exitColumns.innerHTML = `
    <span>Date</span>
    <span>Qty</span>
    <span>Exit Price</span>
  `;

  exitList.innerHTML = position.exits.map((exitRow) => `
    <article class="closed-exit-row">
      <span>${escapeHtml(exitRow.exit_date)}</span>
      <span>${Number(exitRow.qty || 0)}</span>
      <span>${formatNumber(exitRow.exit_price)}</span>
    </article>
  `).join("");

  tradeSection.append(tradeHeading, tradeColumns, tradeRow);
  buildClosedEditFields(editGrid, position);
  editForm.appendChild(editGrid);
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    editButton.disabled = true;
    deleteButton.disabled = true;
    setStatus(statusBanner, "Saving closed trade changes...", "info");

    try {
      await updateClosedPosition({
        tradeId: position.tradeId,
        updates: collectClosedTradeUpdates(editGrid),
        exits: collectExitUpdates(editGrid)
      });

      closeModal(modal.overlay, modal.body);
      setStatus(statusBanner, "Closed trade updated successfully.", "success");
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the closed trade.";
      setStatus(statusBanner, message, "error");
      editButton.disabled = false;
      deleteButton.disabled = false;
    }
  });
  editSection.appendChild(editForm);

  modal.body.append(header, hero, stats, tradeSection, editSection);

  if (position.notes) {
    const notesSection = createElement("section", "closed-notes-card");
    const notesHeading = createElement("h5", "", "Notes");
    const notesBody = createElement("p", "", position.notes);
    notesSection.append(notesHeading, notesBody);
    modal.body.appendChild(notesSection);
  }

  exitSection.append(exitHeading, exitColumns, exitList);
  modal.body.appendChild(exitSection);
}

function createModal() {
  const overlay = createElement("div", "closed-modal-overlay is-hidden");
  const dialog = createElement("div", "panel-card closed-modal");
  const body = createElement("div", "closed-modal-body");

  overlay.appendChild(dialog);
  dialog.appendChild(body);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal(overlay, body);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("is-hidden")) {
      closeModal(overlay, body);
    }
  });

  return { overlay, body };
}

function buildClosedEditFields(container, position) {
  const fields = [
    createSimpleField("Strategy Name", "text", "strategyName", position.strategyName === "-" ? "" : position.strategyName),
    createSelectField("Side", "action", ["Long", "Short"], position.action || "Long"),
    createSimpleField("Trade Date", "date", "tradeDate", position.tradeDate === "-" ? "" : position.tradeDate),
    createSimpleField("Symbol", "text", "symbol", position.symbol === "-" ? "" : position.symbol),
    createSelectField("Instrument", "instrument", ["Option", "Future"], position.instrument || "Option"),
    createSimpleField("Expiry", "date", "expiry", position.expiry === "-" ? "" : position.expiry),
    createSimpleField("Strike", "number", "strike", String(position.strike === "-" ? "" : position.strike)),
    createSelectField("Option Type", "optionType", ["CE", "PE"], position.optionType === "-" ? "CE" : position.optionType),
    createSimpleField("Quantity", "number", "quantity", String(position.qty)),
    createSimpleField("Entry Price", "number", "entryPrice", String(position.entryPrice)),
    createSimpleField("Tag", "text", "tag", position.tag === "-" ? "" : position.tag),
    createTextAreaField("Notes", "notes", position.notes || "")
  ];

  fields[6].input.min = "0";
  fields[6].input.step = "0.01";
  fields[8].input.min = "1";
  fields[8].input.step = "1";
  fields[9].input.min = "0";
  fields[9].input.step = "0.01";
  fields.at(-1).wrapper.classList.add("trade-field-full", "positions-notes-field");
  fields.forEach((field) => container.appendChild(field.wrapper));

  position.exits.forEach((exitRow, index) => {
    const group = createElement("div", "trade-field-full");
    const title = createElement("span", "trade-label", `Exit ${index + 1}`);
    const row = createElement("div", "positions-squareoff-grid");
    const dateField = createSimpleField("Exit Date", "date", `exitDate-${exitRow.id}`, exitRow.exit_date || "");
    const qtyField = createSimpleField("Exit Qty", "number", `exitQty-${exitRow.id}`, String(Number(exitRow.qty || 0)));
    const priceField = createSimpleField("Exit Price", "number", `exitPrice-${exitRow.id}`, String(Number(exitRow.exit_price || 0)));

    dateField.input.dataset.exitId = String(exitRow.id);
    qtyField.input.dataset.exitId = String(exitRow.id);
    priceField.input.dataset.exitId = String(exitRow.id);
    qtyField.input.min = "1";
    qtyField.input.step = "1";
    priceField.input.min = "0";
    priceField.input.step = "0.01";
    row.append(dateField.wrapper, qtyField.wrapper, priceField.wrapper);
    group.append(title, row);
    container.appendChild(group);
  });
}

function collectClosedTradeUpdates(container) {
  const getValue = (name) => container.querySelector(`[name="${name}"]`)?.value ?? "";

  return {
    strategyName: getValue("strategyName"),
    action: getValue("action"),
    tradeDate: getValue("tradeDate"),
    symbol: getValue("symbol"),
    instrument: getValue("instrument"),
    expiry: getValue("expiry"),
    strike: getValue("strike"),
    optionType: getValue("instrument") === "Future" ? "" : getValue("optionType"),
    quantity: getValue("quantity"),
    entryPrice: getValue("entryPrice"),
    tag: getValue("tag"),
    notes: getValue("notes")
  };
}

function collectExitUpdates(container) {
  const dateInputs = [...container.querySelectorAll('input[name^="exitDate-"]')];

  return dateInputs.map((input) => {
    const exitId = input.dataset.exitId;
    const qtyInput = container.querySelector(`input[name="exitQty-${exitId}"]`);
    const priceInput = container.querySelector(`input[name="exitPrice-${exitId}"]`);

    return {
      id: exitId,
      exitDate: input.value,
      qty: qtyInput?.value ?? "",
      exitPrice: priceInput?.value ?? ""
    };
  });
}

function closeModal(overlay, body) {
  overlay.classList.add("is-hidden");
  body.innerHTML = "";
}

function applyFilters(positions, filters) {
  const filtered = positions.filter((item) => {
    if (filters.symbol && item.symbol !== filters.symbol) {
      return false;
    }

    if (filters.strategy && item.strategyName !== filters.strategy) {
      return false;
    }

    if (filters.tag && item.tag !== filters.tag) {
      return false;
    }

    if (filters.side && item.action !== filters.side) {
      return false;
    }

    if (filters.optionType && getInstrumentLabel(item) !== filters.optionType) {
      return false;
    }

    if (filters.dateFrom && item.lastExitDate < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && item.lastExitDate > filters.dateTo) {
      return false;
    }

    if (filters.search) {
      const haystack = `${item.symbol} ${item.strategyName} ${item.tag}`.toLowerCase();
      if (!haystack.includes(filters.search)) {
        return false;
      }
    }

    return true;
  });

  return sortClosedPositions(filtered, filters.sortBy);
}

function syncSelectionState(positions, selectedTradeIds) {
  const availableTradeIds = new Set(positions.map((position) => position.tradeId));

  [...selectedTradeIds].forEach((tradeId) => {
    if (!availableTradeIds.has(tradeId)) {
      selectedTradeIds.delete(tradeId);
    }
  });
}

function updateSelectAllState(selectAllCheckbox, positions, selectedTradeIds) {
  if (!selectAllCheckbox) {
    return;
  }

  const visibleTradeIds = positions.map((position) => position.tradeId);
  const selectedVisibleCount = visibleTradeIds.filter((tradeId) => selectedTradeIds.has(tradeId)).length;

  selectAllCheckbox.checked = selectedVisibleCount > 0 && selectedVisibleCount === visibleTradeIds.length;
  selectAllCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleTradeIds.length;
}

function sortUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sortClosedPositions(positions, sortBy) {
  const sorted = [...positions];

  sorted.sort((left, right) => {
    if (sortBy === "entry-asc") {
      return compareDates(left.tradeDate, right.tradeDate)
        || compareDates(left.lastExitDate, right.lastExitDate)
        || left.symbol.localeCompare(right.symbol);
    }

    if (sortBy === "entry-desc") {
      return compareDates(right.tradeDate, left.tradeDate)
        || compareDates(right.lastExitDate, left.lastExitDate)
        || left.symbol.localeCompare(right.symbol);
    }

    if (sortBy === "exit-asc") {
      return compareDates(left.lastExitDate, right.lastExitDate)
        || compareDates(left.tradeDate, right.tradeDate)
        || left.symbol.localeCompare(right.symbol);
    }

    return compareDates(right.lastExitDate, left.lastExitDate)
      || compareDates(right.tradeDate, left.tradeDate)
      || left.symbol.localeCompare(right.symbol);
  });

  return sorted;
}

function compareDates(left, right) {
  const normalizedLeft = normalizeDateValue(left);
  const normalizedRight = normalizeDateValue(right);
  return normalizedLeft.localeCompare(normalizedRight);
}

function normalizeDateValue(value) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "-" ? normalized : "0000-00-00";
}

function createSimpleField(label, type, name, value) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const input = document.createElement("input");

  input.type = type;
  input.name = name;
  input.value = value;
  wrapper.append(labelText, input);

  return { wrapper, input };
}

function createSelectField(label, name, values, selectedValue) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const input = document.createElement("select");

  input.name = name;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selectedValue;
    input.appendChild(option);
  });

  wrapper.append(labelText, input);
  return { wrapper, input };
}

function createTextAreaField(label, name, value) {
  const wrapper = createElement("label", "trade-field");
  const labelText = createElement("span", "trade-label", label);
  const input = document.createElement("textarea");

  input.name = name;
  input.rows = 2;
  input.value = value;
  wrapper.append(labelText, input);

  return { wrapper, input };
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.className = `trade-status-banner is-${tone}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSigned(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatNumber(amount)}`;
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function getInstrumentLabel(position) {
  if (position.optionType && position.optionType !== "-") {
    return position.optionType;
  }

  return position.instrument || "-";
}

function getSideTone(action) {
  return String(action).toLowerCase() === "short" ? "is-short" : "is-long";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
