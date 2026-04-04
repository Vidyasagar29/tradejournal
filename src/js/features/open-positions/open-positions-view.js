import { createElement } from "../../core/dom.js";
import {
  deleteOpenPosition,
  getOpenPositionsSnapshot,
  squareOffPosition,
  updateOpenPositionTrade
} from "./open-positions-service.js";

const ACTION_OPTIONS = [
  { value: "", label: "Actions" },
  { value: "edit", label: "Edit" },
  { value: "delete", label: "Delete" },
  { value: "square-off", label: "Square Off" }
];

export function createOpenPositionsView() {
  const wrapper = createElement("section", "open-positions-layout");
  const tableCard = createElement("article", "panel-card open-positions-card");
  const header = createHeader();
  const statusBanner = createElement("div", "trade-status-banner is-info");
  const summaryGrid = createElement("section", "positions-summary-grid");
  const tableWrap = createElement("div", "positions-table-wrap");
  const table = createElement("table", "positions-table");
  const tableHead = document.createElement("thead");
  const tableBody = document.createElement("tbody");
  const modal = createModal();
  let snapshotState = [];

  header.downloadButton.addEventListener("click", () => {
    if (snapshotState.length === 0) {
      setBanner(statusBanner, "No open positions available to export.", "warning");
      return;
    }

    downloadOpenPositionsCsv(snapshotState);
    setBanner(statusBanner, `Downloaded CSV for ${snapshotState.length} open position(s).`, "success");
  });

  statusBanner.textContent = "Loading open positions and reconciling remaining quantities...";
  tableHead.innerHTML = `
    <tr>
      <th>Strategy</th>
      <th>Side</th>
      <th>Symbol</th>
      <th>Expiry</th>
      <th>Strike</th>
      <th>Type</th>
      <th>Qty</th>
      <th>Remaining</th>
      <th>Entry</th>
      <th>Current</th>
      <th>P&amp;L</th>
      <th>Tag</th>
      <th>Action</th>
    </tr>
  `;

  table.append(tableHead, tableBody);
  tableWrap.appendChild(table);
  tableCard.append(header, statusBanner, summaryGrid, tableWrap);
  wrapper.append(tableCard, modal.overlay);

  loadSnapshot();

  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await getOpenPositionsSnapshot();
      snapshotState = snapshot.positions;
      renderSummary(summaryGrid, snapshot.summary);
      renderTable(snapshot.positions, tableBody, statusBanner, modal, loadSnapshot);

      if (snapshot.positions.length === 0) {
        setBanner(statusBanner, "No open positions yet. New trades will appear here automatically.", "info");
      } else {
        setBanner(statusBanner, `Loaded ${snapshot.summary.openCount} open position(s).`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load open positions.";
      setBanner(statusBanner, message, "error");
      tableBody.innerHTML = `
        <tr>
          <td colspan="13" class="positions-empty">${escapeHtml(message)}</td>
        </tr>
      `;
    }
  }
}

function createHeader() {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Open Positions");
  const actions = createElement("div", "positions-header-actions");
  const downloadButton = createElement("button", "button-secondary", "Download CSV");

  downloadButton.type = "button";
  copy.append(title);
  actions.appendChild(downloadButton);
  header.append(copy, actions);
  header.downloadButton = downloadButton;
  return header;
}

function renderTable(positions, tableBody, statusBanner, modal, reload) {
  tableBody.innerHTML = "";

  if (positions.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="positions-empty">No open positions found.</td>
      </tr>
    `;
    return;
  }

  const groupedPositions = groupPositionsForDisplay(positions);

  groupedPositions.forEach((strategyGroup) => {
    tableBody.appendChild(createGroupRow("positions-strategy-row", strategyGroup.label, 13));

    strategyGroup.instrumentGroups.forEach((instrumentGroup) => {
      tableBody.appendChild(createGroupRow("positions-instrument-row", instrumentGroup.label, 13));

      instrumentGroup.positions.forEach((position) => {
        tableBody.appendChild(createPositionRow(position, statusBanner, modal, reload));
      });
    });
  });
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <article class="trade-summary-block positions-stat-card">
      <span>Open Positions</span>
      <strong>${summary.openCount}</strong>
    </article>
    <article class="trade-summary-block positions-stat-card">
      <span>Open Notional</span>
      <strong>Rs. ${formatNumber(summary.totalOpenValue)}</strong>
    </article>
    <article class="trade-summary-block positions-stat-card">
      <span>Open P&amp;L</span>
      <strong>${formatSigned(summary.totalUnrealizedPnl)}</strong>
    </article>
  `;
}

function createModal() {
  const overlay = createElement("div", "positions-modal-overlay is-hidden");
  const dialog = createElement("div", "panel-card positions-modal");
  const body = createElement("div", "positions-modal-body");

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

  return { overlay, dialog, body };
}

function openActionModal({ action, position, statusBanner, modal, reload }) {
  modal.body.innerHTML = "";
  modal.overlay.classList.remove("is-hidden");

  const close = () => closeModal(modal.overlay, modal.body);

  modal.body.append(
    createModalHeader(action, close),
    createPositionDetails(position)
  );

  if (action === "edit") {
    modal.body.appendChild(createEditForm(position, close, statusBanner, reload));
    return;
  }

  if (action === "delete") {
    modal.body.appendChild(createDeletePanel(position, close, statusBanner, reload));
    return;
  }

  modal.body.appendChild(createSquareOffForm(position, close, statusBanner, reload));
}

function createModalHeader(action, onClose) {
  const header = createElement("div", "positions-modal-header");
  const copy = createElement("div");
  const title = createElement("h3", "", getActionTitle(action));
  const closeButton = createElement("button", "positions-modal-close", "Close");

  closeButton.type = "button";
  closeButton.addEventListener("click", onClose);
  copy.appendChild(title);
  header.append(copy, closeButton);
  return header;
}

function getActionTitle(action) {
  if (action === "edit") {
    return "Edit Position";
  }

  if (action === "delete") {
    return "Delete Position";
  }

  return "Square Off Position";
}

function createPositionDetails(position) {
  const card = createElement("section", "positions-detail-card");
  card.innerHTML = `
    <div class="positions-detail-head">
      <h3>${escapeHtml(position.symbol)} ${escapeHtml(position.optionType !== "-" ? position.optionType : "")}</h3>
      <p>${escapeHtml(position.action || "-")} | ${escapeHtml(position.strategyName)} | ${escapeHtml(position.instrument)}</p>
    </div>
    <div class="positions-inline-meta">
      <span>Trade: <strong>${escapeHtml(position.tradeDate)}</strong></span>
      <span>Side: <strong>${escapeHtml(position.action || "-")}</strong></span>
      <span>Rem: <strong>${position.remainingQty}</strong></span>
      <span>Exited: <strong>${position.exitedQty}</strong></span>
      <span>Entry: <strong>${formatValue(position.entryPrice)}</strong></span>
      <span>Strike: <strong>${escapeHtml(position.strike)}</strong></span>
      <span>Exits: <strong>${position.exitCount}</strong></span>
    </div>
  `;
  return card;
}

function createEditForm(position, onClose, statusBanner, reload) {
  const formCard = createElement("section", "positions-squareoff-card");
  const form = document.createElement("form");
  const grid = createElement("div", "positions-squareoff-grid");
  const strategyField = createSimpleField("Strategy Name", "text", "strategyName", position.strategyName === "-" ? "" : position.strategyName);
  const actionField = createSelectField("Side", "action", ["Long", "Short"], position.action || "Long");
  const tradeDateField = createSimpleField("Trade Date", "date", "tradeDate", position.tradeDate === "-" ? "" : position.tradeDate);
  const symbolField = createSimpleField("Symbol", "text", "symbol", position.symbol === "-" ? "" : position.symbol);
  const instrumentField = createSelectField("Instrument", "instrument", ["Option", "Future"], position.instrument || "Option");
  const expiryField = createSimpleField("Expiry", "date", "expiry", position.expiry === "-" ? "" : position.expiry);
  const strikeField = createSimpleField("Strike", "number", "strike", String(position.strike === "-" ? "" : position.strike));
  const optionTypeField = createSelectField("Option Type", "optionType", ["CE", "PE"], position.optionType === "-" ? "CE" : position.optionType);
  const qtyField = createSimpleField("Quantity", "number", "quantity", String(position.initialQty));
  const entryPriceField = createSimpleField("Entry Price", "number", "entryPrice", String(position.entryPrice === "-" ? "" : position.entryPrice));
  const entryIvField = createSimpleField("Entry IV", "number", "entryIv", String(position.entryIv === "-" ? "" : position.entryIv));
  const tagField = createSimpleField("Tag", "text", "tag", position.tag === "-" ? "" : position.tag);
  const notesField = createTextAreaField("Notes", "notes", position.notes || "");
  const actionRow = createElement("div", "positions-panel-actions");
  const submitButton = createElement("button", "button-primary", "Save Changes");
  const cancelButton = createElement("button", "button-secondary", "Cancel");

  strikeField.input.min = "0";
  strikeField.input.step = "0.01";
  qtyField.input.min = "1";
  qtyField.input.step = "1";
  entryPriceField.input.min = "0";
  entryPriceField.input.step = "0.01";
  entryIvField.input.min = "0";
  entryIvField.input.step = "0.01";
  submitButton.type = "submit";
  cancelButton.type = "button";
  notesField.wrapper.classList.add("trade-field-full", "positions-notes-field");
  cancelButton.addEventListener("click", onClose);

  grid.append(
    strategyField.wrapper,
    actionField.wrapper,
    tradeDateField.wrapper,
    symbolField.wrapper,
    instrumentField.wrapper,
    expiryField.wrapper,
    strikeField.wrapper,
    optionTypeField.wrapper,
    qtyField.wrapper,
    entryPriceField.wrapper,
    entryIvField.wrapper,
    tagField.wrapper,
    notesField.wrapper
  );
  actionRow.append(submitButton, cancelButton);
  form.append(grid, actionRow);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setBanner(statusBanner, "Saving trade changes...", "info");

    try {
      await updateOpenPositionTrade({
        tradeId: position.tradeId,
        updates: {
          strategyName: strategyField.input.value,
          action: actionField.input.value,
          tradeDate: tradeDateField.input.value,
          symbol: symbolField.input.value,
          instrument: instrumentField.input.value,
          expiry: expiryField.input.value,
          strike: strikeField.input.value,
          optionType: instrumentField.input.value === "Future" ? "" : optionTypeField.input.value,
          quantity: qtyField.input.value,
          tag: tagField.input.value,
          entryPrice: entryPriceField.input.value,
          entryIv: entryIvField.input.value,
          notes: notesField.input.value
        }
      });

      setBanner(statusBanner, "Open trade updated successfully.", "success");
      onClose();
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the trade.";
      setBanner(statusBanner, message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  formCard.appendChild(form);
  return formCard;
}

function createDeletePanel(position, onClose, statusBanner, reload) {
  const panel = createElement("section", "positions-delete-card");
  const text = createElement(
    "p",
    "",
    "This removes the trade and its linked position and exit records. Use this only for incorrect entries."
  );
  const warning = createElement("div", "positions-delete-warning", `Delete ${position.symbol} ${position.optionType !== "-" ? position.optionType : position.instrument} with ${position.remainingQty} quantity still open?`);
  const actionRow = createElement("div", "positions-panel-actions");
  const button = createElement("button", "button-secondary", "Delete Trade");
  const cancelButton = createElement("button", "button-secondary", "Cancel");

  button.type = "button";
  cancelButton.type = "button";
  cancelButton.addEventListener("click", onClose);
  button.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete this trade, its open position, and any exit records?");

    if (!confirmed) {
      return;
    }

    button.disabled = true;
    setBanner(statusBanner, "Deleting trade and linked records...", "info");

    try {
      await deleteOpenPosition({
        positionId: position.id,
        tradeId: position.tradeId
      });

      setBanner(statusBanner, "Trade deleted successfully.", "success");
      onClose();
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the trade.";
      setBanner(statusBanner, message, "error");
    } finally {
      button.disabled = false;
    }
  });

  actionRow.append(button, cancelButton);
  panel.append(text, warning, actionRow);
  return panel;
}

function createSquareOffForm(position, onClose, statusBanner, reload) {
  const formCard = createElement("section", "positions-squareoff-card");
  const form = document.createElement("form");
  const grid = createElement("div", "positions-squareoff-grid");
  const dateField = createSimpleField("Exit Date", "date", "exitDate", getTodayIsoDate());
  const qtyField = createSimpleField("Exit Quantity", "number", "exitQty", String(position.remainingQty));
  const priceField = createSimpleField("Exit Price", "number", "exitPrice", "");
  const actionRow = createElement("div", "positions-panel-actions");
  const submitButton = createElement("button", "button-primary", "Confirm Square Off");
  const cancelButton = createElement("button", "button-secondary", "Cancel");

  qtyField.input.min = "1";
  qtyField.input.max = String(position.remainingQty);
  qtyField.input.step = "1";
  priceField.input.min = "0";
  priceField.input.step = "0.01";
  submitButton.type = "submit";
  cancelButton.type = "button";
  cancelButton.addEventListener("click", onClose);

  grid.append(dateField.wrapper, qtyField.wrapper, priceField.wrapper);
  actionRow.append(submitButton, cancelButton);
  form.append(grid, actionRow);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setBanner(statusBanner, "Recording square-off...", "info");

    try {
      const result = await squareOffPosition({
        positionId: position.id,
        tradeId: position.tradeId,
        exitDate: dateField.input.value,
        exitQty: qtyField.input.value,
        exitPrice: priceField.input.value
      });

      setBanner(
        statusBanner,
        result.remainingQty > 0
          ? `Partial exit saved. ${result.remainingQty} quantity still open.`
          : "Position closed successfully.",
        "success"
      );
      onClose();
      await reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to square off the position.";
      setBanner(statusBanner, message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  formCard.appendChild(form);
  return formCard;
}

function createActionSelect() {
  const select = document.createElement("select");
  select.className = "positions-action-select";

  ACTION_OPTIONS.forEach((action) => {
    const option = document.createElement("option");
    option.value = action.value;
    option.textContent = action.label;
    select.appendChild(option);
  });

  return select;
}

function createPositionRow(position, statusBanner, modal, reload) {
  const row = document.createElement("tr");
  const actionCell = document.createElement("td");
  const actionSelect = createActionSelect();

  row.innerHTML = `
    <td>${escapeHtml(position.strategyName)}</td>
    <td><span class="positions-side-badge ${getSideTone(position.action)}">${escapeHtml(position.action || "-")}</span></td>
    <td>${escapeHtml(position.symbol)}</td>
    <td>${escapeHtml(position.expiry)}</td>
    <td>${formatValue(position.strike)}</td>
    <td>${escapeHtml(getInstrumentLabel(position))}</td>
    <td>${position.initialQty}</td>
    <td><strong>${position.remainingQty}</strong></td>
    <td>${formatValue(position.entryPrice)}</td>
    <td>${formatPrice(position.currentPrice)}</td>
    <td class="${Number(position.unrealizedPnl || 0) >= 0 ? "positions-pnl-positive" : "positions-pnl-negative"}">${formatSigned(position.unrealizedPnl)}</td>
    <td>${escapeHtml(position.tag)}</td>
  `;

  actionSelect.addEventListener("change", () => {
    const action = actionSelect.value;
    actionSelect.value = "";

    if (!action) {
      return;
    }

    openActionModal({
      action,
      position,
      statusBanner,
      modal,
      reload
    });
  });

  actionCell.appendChild(actionSelect);
  row.appendChild(actionCell);
  return row;
}

function createGroupRow(className, label, columnSpan) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  row.className = className;
  cell.colSpan = columnSpan;
  cell.textContent = label;
  row.appendChild(cell);

  return row;
}

function groupPositionsForDisplay(positions) {
  const strategyMap = new Map();

  positions.forEach((position) => {
    const strategyName = position.strategyName || "-";
    const instrumentKey = getInstrumentGroupKey(position);
    const instrumentLabel = getInstrumentGroupLabel(instrumentKey);

    if (!strategyMap.has(strategyName)) {
      strategyMap.set(strategyName, new Map());
    }

    const instrumentMap = strategyMap.get(strategyName);

    if (!instrumentMap.has(instrumentKey)) {
      instrumentMap.set(instrumentKey, {
        label: instrumentLabel,
        positions: []
      });
    }

    instrumentMap.get(instrumentKey).positions.push(position);
  });

  return [...strategyMap.entries()].map(([label, instrumentMap]) => {
    const instrumentGroups = [...instrumentMap.entries()]
      .sort(([leftKey], [rightKey]) => getInstrumentGroupOrder(leftKey) - getInstrumentGroupOrder(rightKey))
      .map(([, group]) => ({
        label: group.label,
        positions: [...group.positions].sort(compareGroupedPositions)
      }));

    return { label, instrumentGroups };
  });
}

function compareGroupedPositions(left, right) {
  const sideDifference = getSideOrder(left.action) - getSideOrder(right.action);
  if (sideDifference !== 0) {
    return sideDifference;
  }

  const tradeDateDifference = String(right.tradeDate || "").localeCompare(String(left.tradeDate || ""));
  if (tradeDateDifference !== 0) {
    return tradeDateDifference;
  }

  return String(left.symbol || "").localeCompare(String(right.symbol || ""));
}

function getInstrumentGroupKey(position) {
  if (position.optionType === "CE") {
    return "CE";
  }

  if (position.optionType === "PE") {
    return "PE";
  }

  return "FUTURE";
}

function getInstrumentGroupLabel(groupKey) {
  if (groupKey === "CE") {
    return "Calls";
  }

  if (groupKey === "PE") {
    return "Puts";
  }

  return "Futures";
}

function getInstrumentGroupOrder(groupKey) {
  if (groupKey === "CE") {
    return 0;
  }

  if (groupKey === "PE") {
    return 1;
  }

  return 2;
}

function getSideOrder(action) {
  return String(action || "").toLowerCase() === "short" ? 0 : 1;
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

function closeModal(overlay, body) {
  overlay.classList.add("is-hidden");
  body.innerHTML = "";
}

function setBanner(element, message, tone) {
  element.textContent = message;
  element.className = `trade-status-banner is-${tone}`;
}

function downloadOpenPositionsCsv(positions) {
  const headers = [
    "trade_date",
    "symbol",
    "strategy_name",
    "side",
    "instrument",
    "option_type",
    "expiry",
    "strike",
    "initial_qty",
    "remaining_qty",
    "entry_price",
    "entry_iv",
    "tag",
    "notes"
  ];

  const rows = positions.map((position) => [
    position.tradeDate,
    position.symbol,
    position.strategyName,
    position.action,
    position.instrument,
    position.optionType,
    position.expiry,
    position.strike,
    position.initialQty,
    position.remainingQty,
    position.entryPrice,
    position.entryIv,
    position.tag,
    position.notes
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `open-positions-${getTodayIsoDate()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsvCell(value) {
  const normalized = String(value ?? "");
  return `"${normalized.replaceAll('"', '""')}"`;
}

function getTodayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatNumber(numeric) : "-";
}

function formatPrice(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  if (numeric !== 0 && Math.abs(numeric) < 1) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(numeric);
  }

  return formatNumber(numeric);
}

function getInstrumentLabel(position) {
  if (position.optionType && position.optionType !== "-") {
    return position.optionType;
  }

  return position.instrument || "-";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSigned(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatNumber(amount)}`;
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
