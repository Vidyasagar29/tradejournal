import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { createElement } from "../../core/dom.js";

export function createAssetExposureView() {
  const wrapper = createElement("section", "analytics-layout");
  const card = createElement("article", "panel-card analytics-card");
  const header = createHeader("Asset Exposure");
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading asset exposure...");
  const grid = createElement("section", "exposure-grid");
  const symbolCard = createExposureCard("By Symbol");
  const instrumentCard = createExposureCard("By Instrument");
  const strategyCard = createExposureCard("By Strategy");

  grid.append(symbolCard, instrumentCard, strategyCard);
  card.append(header, statusBanner, grid);
  wrapper.appendChild(card);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await summarizePortfolio();
      renderExposureList(symbolCard.querySelector(".exposure-list"), snapshot.exposure.bySymbol);
      renderExposureList(instrumentCard.querySelector(".exposure-list"), snapshot.exposure.byInstrument);
      renderExposureList(strategyCard.querySelector(".exposure-list"), snapshot.exposure.byStrategy);

      const openRows = [
        ...snapshot.exposure.bySymbol,
        ...snapshot.exposure.byInstrument,
        ...snapshot.exposure.byStrategy
      ];

      statusBanner.textContent = openRows.length > 0
        ? "Built open-book exposure from current active positions."
        : "No open positions yet. Exposure appears only for active trades.";
      statusBanner.className = `trade-status-banner ${openRows.length > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load asset exposure.";
      statusBanner.textContent = message;
      statusBanner.className = "trade-status-banner is-error";
    }
  }
}

function createHeader(titleText) {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", titleText);
  copy.appendChild(title);
  header.appendChild(copy);
  return header;
}

function createExposureCard(titleText) {
  const card = createElement("article", "panel-card exposure-card");
  const title = createElement("h3", "", titleText);
  const list = createElement("div", "exposure-list");
  card.append(title, list);
  return card;
}

function renderExposureList(container, rows) {
  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = `<div class="positions-empty">No active exposure yet.</div>`;
    return;
  }

  rows.forEach((row) => {
    const item = createElement("article", "exposure-row");
    const meta = createElement("div", "exposure-meta");
    const name = createElement("strong", "", row.name);
    const sub = createElement("span", "", `${row.tradeCount} trade(s) | Qty ${row.remainingQty}`);
    const bar = createElement("div", "exposure-track");
    const fill = createElement("div", "exposure-fill");
    const stats = createElement("div", "exposure-stats");
    const value = createElement("strong", "", `Rs. ${formatNumber(row.openValue)}`);
    const share = createElement("span", "", `${row.share.toFixed(1)}%`);

    fill.style.width = `${Math.max(row.share, 4)}%`;
    meta.append(name, sub);
    stats.append(value, share);
    bar.appendChild(fill);
    item.append(meta, bar, stats);
    container.appendChild(item);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}
