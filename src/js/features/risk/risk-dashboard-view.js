import { createElement } from "../../core/dom.js";
import { getRiskDashboardSnapshot } from "./risk-dashboard-service.js";

export function createRiskDashboardView() {
  const wrapper = createElement("section", "risk-layout");
  const card = createElement("article", "panel-card risk-card");
  const header = createHeader("Risk Dashboard");
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading open-position Greeks...");
  const summaryGrid = createElement("section", "risk-summary-grid");
  const controls = createMultiplierControls();
  const chartGrid = createElement("section", "risk-grid");
  const exposureCard = createChartCard("Portfolio Aggregate");
  const symbolCard = createElement("article", "panel-card risk-list-card");
  const symbolTitle = createElement("h3", "", "Symbol Risk");
  const symbolList = createElement("div", "risk-symbol-list");
  const tableCard = createElement("section", "risk-table-card");
  const tableTitle = createElement("h3", "", "Open Position Greeks");
  const tableWrap = createElement("div", "risk-table-wrap");
  const table = document.createElement("table");
  const tableBody = document.createElement("tbody");
  let snapshotState = null;
  let chartInstance = null;

  table.className = "risk-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Side</th>
        <th>Instrument</th>
        <th>Qty</th>
        <th>Strike</th>
        <th>IV</th>
        <th>Delta</th>
        <th>Theta</th>
      </tr>
    </thead>
  `;
  table.appendChild(tableBody);
  tableWrap.appendChild(table);
  tableCard.append(tableTitle, tableWrap);
  symbolCard.append(symbolTitle, symbolList);
  chartGrid.append(exposureCard.card, symbolCard);
  card.append(header, statusBanner, controls.element, summaryGrid, chartGrid, tableCard);
  wrapper.appendChild(card);

  controls.onChange(() => {
    if (snapshotState) {
      renderSnapshot(snapshotState);
    }
  });

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      snapshotState = await getRiskDashboardSnapshot();
      renderSnapshot(snapshotState);

      statusBanner.textContent = snapshotState.summary.openCount > 0
        ? `Calculated portfolio Greeks for ${snapshotState.summary.openCount} open position(s).`
        : "No open positions yet. Risk metrics appear only for active trades.";
      statusBanner.className = `trade-status-banner ${snapshotState.summary.openCount > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load risk dashboard.";
      statusBanner.textContent = message;
      statusBanner.className = "trade-status-banner is-error";
      tableBody.innerHTML = `<tr><td colspan="8" class="positions-empty">${escapeHtml(message)}</td></tr>`;
    }
  }

  function renderSnapshot(snapshot) {
    const multiplierState = controls.getValue();
    const scaledPositions = snapshot.positions.map((row) => applyDisplayScale(row, multiplierState));
    const scaledSummary = applySummaryScale(snapshot.summary, snapshot.positions, multiplierState);
    const scaledBySymbol = applySymbolScale(snapshot.bySymbol, snapshot.positions, multiplierState);

    renderSummary(summaryGrid, scaledSummary);
    renderSymbolList(symbolList, scaledBySymbol);
    renderPositionsTable(tableBody, scaledPositions);
    chartInstance = renderRiskChart(exposureCard.canvas, scaledSummary, chartInstance);
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

function createChartCard(titleText) {
  const card = createElement("article", "panel-card risk-chart-card");
  const title = createElement("h3", "", titleText);
  const frame = createElement("div", "risk-chart-frame");
  const canvas = document.createElement("canvas");
  frame.appendChild(canvas);
  card.append(title, frame);
  return { card, canvas };
}

function createMultiplierControls() {
  const element = createElement("div", "risk-toggle-group");
  const note = createElement("span", "risk-toggle-note", "Base = 1 unit. Lot Size = per lot. No. of Lots = lot count. Both = full qty.");
  const lotSizeButton = createToggleButton("Multiply by Lot Size");
  const lotsButton = createToggleButton("Multiply by No. of Lots");
  const listeners = new Set();
  const state = {
    multiplyByLotSize: false,
    multiplyByLots: false
  };

  lotSizeButton.addEventListener("click", () => {
    state.multiplyByLotSize = !state.multiplyByLotSize;
    syncToggleState(lotSizeButton, state.multiplyByLotSize);
    listeners.forEach((listener) => listener());
  });

  lotsButton.addEventListener("click", () => {
    state.multiplyByLots = !state.multiplyByLots;
    syncToggleState(lotsButton, state.multiplyByLots);
    listeners.forEach((listener) => listener());
  });

  element.append(note, lotSizeButton, lotsButton);

  return {
    element,
    getValue() {
      return { ...state };
    },
    onChange(listener) {
      listeners.add(listener);
    }
  };
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <article class="trade-summary-block risk-stat-card">
      <span>Portfolio Delta</span>
      <strong>${formatSigned(summary.portfolioDelta)}</strong>
    </article>
    <article class="trade-summary-block risk-stat-card">
      <span>Portfolio Theta</span>
      <strong>${formatSigned(summary.portfolioTheta)}</strong>
    </article>
    <article class="trade-summary-block risk-stat-card">
      <span>Market IV</span>
      <strong>${summary.marketIvCount}</strong>
    </article>
    <article class="trade-summary-block risk-stat-card">
      <span>Fallback IV</span>
      <strong>${summary.fallbackIvCount}</strong>
    </article>
  `;
}

function renderSymbolList(container, rows) {
  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = `<div class="positions-empty">No open symbol exposure yet.</div>`;
    return;
  }

  rows.forEach((row) => {
    const item = createElement("article", "risk-symbol-row");
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${row.count} trade(s)</span>
      </div>
      <div>
        <strong>${formatSigned(row.delta)}</strong>
        <span>Theta ${formatSigned(row.theta)}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderPositionsTable(tableBody, rows) {
  tableBody.innerHTML = "";

  if (rows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="positions-empty">No open positions found.</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.symbol)}</td>
      <td>${escapeHtml(row.action)}</td>
      <td>${escapeHtml(row.instrument)} ${escapeHtml(row.optionType !== "-" ? row.optionType : "")}</td>
      <td>${row.remainingQty}</td>
      <td>${formatStrike(row.strike)}</td>
      <td>${formatNumber(row.resolvedIv)} <span class="risk-iv-source">${escapeHtml(row.ivSource)}</span></td>
      <td class="${row.displayDelta >= 0 ? "risk-positive" : "risk-negative"}">${formatSigned(row.displayDelta)}</td>
      <td class="${row.displayTheta >= 0 ? "risk-positive" : "risk-negative"}">${formatSigned(row.displayTheta)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderRiskChart(canvas, summary, existingChart) {
  if (!window.Chart) {
    return existingChart;
  }

  if (existingChart) {
    existingChart.destroy();
  }

  return new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Portfolio"],
      datasets: [
        {
          label: "Delta",
          data: [summary.portfolioDelta],
          backgroundColor: "rgba(39, 193, 184, 0.74)",
          borderRadius: 6
        },
        {
          label: "Theta",
          data: [summary.portfolioTheta],
          backgroundColor: "rgba(255, 157, 30, 0.74)",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            color: "#b9c8d6"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#7f94a8"
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: "#7f94a8"
          },
          grid: {
            color: "rgba(91, 118, 148, 0.18)"
          }
        }
      }
    }
  });
}

function applyDisplayScale(row, multiplierState) {
  const scaleFactor = getScaleFactor(row, multiplierState);

  return {
    ...row,
    displayDelta: row.delta * scaleFactor,
    displayTheta: row.theta * scaleFactor
  };
}

function applySummaryScale(summary, rows, multiplierState) {
  return {
    ...summary,
    portfolioDelta: rows.reduce((total, row) => {
      return total + row.delta * getScaleFactor(row, multiplierState);
    }, 0),
    portfolioTheta: rows.reduce((total, row) => {
      return total + row.theta * getScaleFactor(row, multiplierState);
    }, 0)
  };
}

function applySymbolScale(symbolRows, positions, multiplierState) {
  return symbolRows.map((symbolRow) => {
    const relatedRows = positions.filter((position) => position.symbol === symbolRow.name);

    return {
      ...symbolRow,
      delta: relatedRows.reduce((total, row) => total + row.delta * getScaleFactor(row, multiplierState), 0),
      theta: relatedRows.reduce((total, row) => total + row.theta * getScaleFactor(row, multiplierState), 0)
    };
  });
}

function getScaleFactor(row, multiplierState) {
  if (multiplierState.multiplyByLotSize && multiplierState.multiplyByLots) {
    return Number(row.remainingQty || 1);
  }

  if (multiplierState.multiplyByLotSize) {
    return Number(row.lotSize || 1);
  }

  if (multiplierState.multiplyByLots) {
    return Number(row.lotCount || 1);
  }

  return 1;
}

function createToggleButton(label) {
  const button = createElement("button", "button-secondary risk-toggle-button", label);
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  return button;
}

function syncToggleState(button, isActive) {
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSigned(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";

  if (Math.abs(amount) < 10) {
    return `${sign}${amount.toFixed(4)}`;
  }

  return `${sign}${formatNumber(amount)}`;
}

function formatStrike(value) {
  if (value === "-" || value === null || typeof value === "undefined" || value === "") {
    return "-";
  }

  return formatNumber(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
