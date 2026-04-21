import { createElement } from "../../core/dom.js";
import { getStrategySnapshot } from "./strategies-service.js";

export function createStrategiesView() {
  const wrapper = createElement("section", "strategies-layout");
  const card = createElement("article", "panel-card strategies-card");
  const header = createHeader();
  const statusBanner = createElement("div", "trade-status-banner is-info");
  const summaryGrid = createElement("section", "strategies-summary-grid");
  const tableWrap = createElement("div", "strategies-table-wrap");
  const table = createElement("table", "strategies-table");
  const tableHead = document.createElement("thead");
  const tableBody = document.createElement("tbody");
  const modal = createModal();

  statusBanner.textContent = "Loading strategy groups...";
  tableHead.innerHTML = `
    <tr>
      <th>Strategy</th>
      <th>Symbols</th>
      <th>Trades</th>
      <th>Open</th>
      <th>Closed</th>
      <th>Remaining</th>
      <th>Total Profit</th>
      <th>View</th>
    </tr>
  `;

  table.append(tableHead, tableBody);
  tableWrap.appendChild(table);
  card.append(header, statusBanner, summaryGrid, tableWrap);
  wrapper.append(card, modal.overlay);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await getStrategySnapshot();
      renderSummary(summaryGrid, snapshot.summary);
      renderTable(snapshot.strategies, tableBody, modal);
      setStatus(statusBanner, `Loaded ${snapshot.summary.strategyCount} strategy group(s).`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load strategies.";
      setStatus(statusBanner, message, "error");
      tableBody.innerHTML = `<tr><td colspan="8" class="positions-empty">${escapeHtml(message)}</td></tr>`;
    }
  }
}

function createHeader() {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Strategies");
  copy.appendChild(title);
  header.appendChild(copy);
  return header;
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <article class="trade-summary-block strategies-stat-card">
      <span>Strategies</span>
      <strong>${summary.strategyCount}</strong>
    </article>
    <article class="trade-summary-block strategies-stat-card">
      <span>Open Strategies</span>
      <strong>${summary.openStrategies}</strong>
    </article>
    <article class="trade-summary-block strategies-stat-card">
      <span>Multi Symbol</span>
      <strong>${summary.multiSymbolStrategies}</strong>
    </article>
    <article class="trade-summary-block strategies-stat-card">
      <span>Open Value</span>
      <strong>Rs. ${formatNumber(summary.totalOpenValue)}</strong>
    </article>
  `;
}

function renderTable(strategies, tableBody, modal) {
  tableBody.innerHTML = "";

  if (strategies.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="positions-empty">No strategies found.</td></tr>`;
    return;
  }

  strategies.forEach((strategy) => {
    const row = document.createElement("tr");
    const viewCell = document.createElement("td");
    const button = createElement("button", "button-secondary strategies-view-btn", "View");

    row.innerHTML = `
      <td>${escapeHtml(strategy.name)}</td>
      <td>${escapeHtml(strategy.symbols.join(", ") || "-")}</td>
      <td>${strategy.tradeCount}</td>
      <td>${strategy.openCount}</td>
      <td>${strategy.closedCount}</td>
      <td>${strategy.remainingQty}</td>
      <td class="${strategy.totalProfitMade >= 0 ? "strategies-pnl-positive" : "strategies-pnl-negative"}">${formatSigned(strategy.totalProfitMade)}</td>
    `;

    button.type = "button";
    button.addEventListener("click", () => {
      openStrategyModal(strategy, modal);
    });

    viewCell.appendChild(button);
    row.appendChild(viewCell);
    tableBody.appendChild(row);
  });
}

function createModal() {
  const overlay = createElement("div", "strategies-modal-overlay is-hidden");
  const dialog = createElement("div", "panel-card strategies-modal");
  const body = createElement("div", "strategies-modal-body");

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

function openStrategyModal(strategy, modal) {
  modal.body.innerHTML = "";
  modal.overlay.classList.remove("is-hidden");

  const header = createElement("div", "strategies-modal-header");
  const title = createElement("h3", "", "Strategy Details");
  const closeButton = createElement("button", "strategies-modal-close", "Close");
  const hero = createElement("div", "strategies-modal-hero");
  const stats = createElement("div", "strategies-inline-meta");
  const tradeSection = createElement("section", "strategies-trade-section");
  const tradeHeading = createElement("h5", "", "Strategy Trades");
  const tradeColumns = createElement("div", "strategies-trade-columns");
  const tradeList = createElement("div", "strategies-trade-list");
  const heroTitle = createElement("h4", "", strategy.name);
  const heroCopy = createElement(
    "p",
    "",
    `${strategy.tradeCount} trade(s) grouped under this strategy across ${strategy.symbols.length || 1} symbol(s).`
  );

  closeButton.type = "button";
  closeButton.addEventListener("click", () => closeModal(modal.overlay, modal.body));
  header.append(title, closeButton);
  hero.append(heroTitle, heroCopy);

  stats.innerHTML = `
    <span>Symbols <strong>${escapeHtml(strategy.symbols.join(", ") || "-")}</strong></span>
    <span>Open <strong>${strategy.openCount}</strong></span>
    <span>Closed <strong>${strategy.closedCount}</strong></span>
    <span>Remaining <strong>${strategy.remainingQty}</strong></span>
  `;

  tradeColumns.innerHTML = `
    <span>Date</span>
    <span>Symbol</span>
    <span>Action</span>
    <span>Instrument</span>
    <span>Expiry</span>
    <span>Strike</span>
    <span>Qty</span>
    <span>Price</span>
    <span>Tag</span>
  `;

  tradeList.innerHTML = strategy.trades.map((trade) => `
    <article class="strategies-trade-row">
      <span>${escapeHtml(trade.tradeDate)}</span>
      <span>${escapeHtml(trade.symbol)}</span>
      <span>${escapeHtml(trade.action)}</span>
      <span>${escapeHtml(trade.instrument)} ${escapeHtml(trade.optionType !== "-" ? trade.optionType : "")}</span>
      <span>${escapeHtml(trade.expiry)}</span>
      <span>${escapeHtml(trade.strike)}</span>
      <span>${trade.qty}/${trade.remainingQty}</span>
      <span>${formatNumber(trade.entryPrice)}</span>
      <span>${escapeHtml(trade.tag)}</span>
    </article>
  `).join("");

  tradeSection.append(tradeHeading, tradeColumns, tradeList);
  modal.body.append(header, hero, stats, tradeSection);
}

function closeModal(overlay, body) {
  overlay.classList.add("is-hidden");
  body.innerHTML = "";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
