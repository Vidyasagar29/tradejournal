import { createElement } from "../../core/dom.js";
import {
  getPayoffSnapshot,
  simulateStrategyPayoff
} from "./payoff-charts-service.js";

const chartInstances = new WeakMap();
const PAYOFF_X_AXIS_STEP = 50;

const payoffHoverLinePlugin = {
  id: "payoffHoverLine",
  afterDatasetsDraw(chart) {
    const activeElements = chart.tooltip?.getActiveElements?.() || [];

    if (activeElements.length === 0) {
      return;
    }

    const { ctx, chartArea } = chart;
    const activePoint = activeElements[0].element;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(activePoint.x, chartArea.top);
    ctx.lineTo(activePoint.x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 157, 30, 0.34)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }
};

export function createPayoffChartsView() {
  const wrapper = createElement("section", "payoff-layout");
  const card = createElement("article", "panel-card payoff-card");
  const header = createHeader();
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading payoff charts...");
  const selectorRow = createElement("div", "payoff-selector-row");
  const strategySelect = document.createElement("select");
  const controls = createSimulationControls();
  const summaryGrid = createElement("section", "payoff-summary-grid");
  const content = createElement("section", "payoff-content");

  let snapshotState = null;
  let selectedStrategyName = "";

  strategySelect.className = "payoff-select";
  strategySelect.addEventListener("change", () => {
    selectedStrategyName = strategySelect.value;
    syncControlsForStrategy();
    renderSelection();
  });

  controls.onChange(() => {
    renderSelection();
  });

  selectorRow.append(strategySelect, controls.element);
  card.append(header, statusBanner, selectorRow, summaryGrid, content);
  wrapper.appendChild(card);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      snapshotState = await getPayoffSnapshot();
      renderSummary(summaryGrid, snapshotState.summary);
      populateStrategySelect(strategySelect, snapshotState.strategies);
      selectedStrategyName = snapshotState.strategies[0]?.name || "";
      strategySelect.value = selectedStrategyName;
      syncControlsForStrategy();
      renderSelection();
      statusBanner.textContent = snapshotState.strategies.length > 0
        ? `Built payoff diagrams for ${snapshotState.strategies.length} open strategy group(s).`
        : "No open strategies available for payoff diagrams yet.";
      statusBanner.className = `trade-status-banner ${snapshotState.strategies.length > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load payoff charts.";
      statusBanner.textContent = message;
      statusBanner.className = "trade-status-banner is-error";
      content.innerHTML = `<div class="positions-empty">${escapeHtml(message)}</div>`;
    }
  }

  function syncControlsForStrategy() {
    if (!snapshotState) {
      return;
    }

    const strategy = snapshotState.strategies.find((item) => item.name === selectedStrategyName);
    if (!strategy) {
      return;
    }

    const maxDays = Math.max(...strategy.symbolGroups.map((group) => group.maxDaysToExpiry), 30);
    const defaultDays = Math.max(...strategy.symbolGroups.map((group) => group.defaultDaysToExpiry), 0);
    controls.resetSpotShift();
    controls.setDaysRange(maxDays, defaultDays);
  }

  function renderSelection() {
    if (!snapshotState) {
      return;
    }

    const selectedStrategy = snapshotState.strategies.find((strategy) => strategy.name === selectedStrategyName);

    if (!selectedStrategy) {
      content.innerHTML = `<div class="positions-empty">No strategy selected.</div>`;
      return;
    }

    const simulatedPortfolio = simulateStrategyPayoff(snapshotState.portfolio, controls.getValue());
    const simulatedStrategy = simulateStrategyPayoff(selectedStrategy, controls.getValue());
    renderPayoffSections(content, simulatedPortfolio, simulatedStrategy);
  }
}

function createHeader() {
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Strategy Payoff Charts");
  copy.appendChild(title);
  header.appendChild(copy);
  return header;
}

function createSimulationControls() {
  const element = createElement("div", "payoff-controls");
  const spotField = createControlField("Spot Shift");
  const daysField = createControlField("Days to Expiry");
  const spotRange = document.createElement("input");
  const daysRange = document.createElement("input");
  const listeners = new Set();

  spotRange.type = "range";
  spotRange.min = "-3000";
  spotRange.max = "3000";
  spotRange.step = "100";
  spotRange.value = "0";
  spotRange.className = "payoff-range";
  spotField.value.textContent = "0";

  daysRange.type = "range";
  daysRange.min = "0";
  daysRange.max = "30";
  daysRange.step = "1";
  daysRange.value = "0";
  daysRange.className = "payoff-range";
  daysField.value.textContent = "0d";

  spotRange.addEventListener("input", () => {
    spotField.value.textContent = formatShiftValue(spotRange.value);
    listeners.forEach((listener) => listener());
  });

  daysRange.addEventListener("input", () => {
    daysField.value.textContent = `${daysRange.value}d`;
    listeners.forEach((listener) => listener());
  });

  spotField.decrementButton.addEventListener("click", () => {
    stepRangeInput(spotRange, -1);
    spotField.value.textContent = formatShiftValue(spotRange.value);
    listeners.forEach((listener) => listener());
  });

  spotField.incrementButton.addEventListener("click", () => {
    stepRangeInput(spotRange, 1);
    spotField.value.textContent = formatShiftValue(spotRange.value);
    listeners.forEach((listener) => listener());
  });

  daysField.decrementButton.addEventListener("click", () => {
    stepRangeInput(daysRange, -1);
    daysField.value.textContent = `${daysRange.value}d`;
    listeners.forEach((listener) => listener());
  });

  daysField.incrementButton.addEventListener("click", () => {
    stepRangeInput(daysRange, 1);
    daysField.value.textContent = `${daysRange.value}d`;
    listeners.forEach((listener) => listener());
  });

  spotField.wrapper.appendChild(spotRange);
  daysField.wrapper.appendChild(daysRange);
  element.append(spotField.wrapper, daysField.wrapper);

  return {
    element,
    getValue() {
      return {
        spotShift: Number(spotRange.value),
        daysToExpiry: Number(daysRange.value)
      };
    },
    setDaysRange(maxDays, defaultDays) {
      daysRange.max = String(Math.max(Math.round(maxDays), 1));
      daysRange.value = String(Math.min(Math.round(defaultDays), Number(daysRange.max)));
      daysField.value.textContent = `${daysRange.value}d`;
    },
    resetSpotShift() {
      spotRange.value = "0";
      spotField.value.textContent = formatShiftValue(spotRange.value);
    },
    onChange(listener) {
      listeners.add(listener);
    }
  };
}

function createControlField(labelText) {
  const wrapper = createElement("label", "payoff-control");
  const labelRow = createElement("div", "payoff-control-head");
  const label = createElement("span", "payoff-control-label", labelText);
  const value = createElement("strong", "payoff-control-value");
  const actions = createElement("div", "payoff-step-actions");
  const decrementButton = document.createElement("button");
  const incrementButton = document.createElement("button");

  decrementButton.type = "button";
  decrementButton.className = "payoff-step-button";
  decrementButton.textContent = "-";

  incrementButton.type = "button";
  incrementButton.className = "payoff-step-button";
  incrementButton.textContent = "+";

  actions.append(decrementButton, incrementButton);
  labelRow.append(label, value, actions);
  wrapper.appendChild(labelRow);

  return { wrapper, value, decrementButton, incrementButton };
}

function stepRangeInput(input, direction) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 0);
  const step = Number(input.step || 1);
  const current = Number(input.value || 0);
  const next = Math.min(Math.max(current + (step * direction), min), max);
  input.value = String(next);
}

function formatShiftValue(value) {
  const numericValue = Number(value) || 0;
  return numericValue > 0 ? `+${formatSpotTick(numericValue)}` : formatSpotTick(numericValue);
}

function populateStrategySelect(select, strategies) {
  select.innerHTML = "";

  if (strategies.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Open Strategies";
    select.appendChild(option);
    return;
  }

  strategies.forEach((strategy) => {
    const option = document.createElement("option");
    option.value = strategy.name;
    option.textContent = strategy.name;
    select.appendChild(option);
  });
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <article class="trade-summary-block payoff-stat-card">
      <span>Strategies</span>
      <strong>${summary.strategyCount}</strong>
    </article>
    <article class="trade-summary-block payoff-stat-card">
      <span>Open Groups</span>
      <strong>${summary.openStrategies}</strong>
    </article>
    <article class="trade-summary-block payoff-stat-card">
      <span>Mixed Symbols</span>
      <strong>${summary.mixedSymbolStrategies}</strong>
    </article>
  `;
}

function renderPayoffSections(container, portfolio, strategy) {
  container.innerHTML = "";

  const portfolioSection = createElement("section", "payoff-section");
  const portfolioHeader = createElement("div", "section-header");
  const portfolioCopy = createElement("div");
  const portfolioTitle = createElement("h3", "", "Entire Position");
  const portfolioText = createElement("p", "", "Combined payoff across all currently open positions.");

  portfolioCopy.append(portfolioTitle, portfolioText);
  portfolioHeader.appendChild(portfolioCopy);
  portfolioSection.append(portfolioHeader, createStrategyContent(portfolio));
  container.appendChild(portfolioSection);

  const strategySection = createElement("section", "payoff-section");
  const strategyHeader = createElement("div", "section-header");
  const strategyCopy = createElement("div");
  const strategyTitle = createElement("h3", "", "Strategy View");
  const strategyText = createElement("p", "", `Selected strategy: ${strategy.name}`);

  strategyCopy.append(strategyTitle, strategyText);
  strategyHeader.appendChild(strategyCopy);
  strategySection.append(strategyHeader, createStrategyContent(strategy));
  container.appendChild(strategySection);
}

function createStrategyContent(strategy) {
  const fragment = document.createDocumentFragment();
  const meta = createElement("article", "panel-card payoff-meta-card");
  meta.innerHTML = `
    <strong>${escapeHtml(strategy.name)}</strong>
    <span>${strategy.positionCount} open position(s) across ${strategy.symbolCount} symbol group(s)</span>
  `;
  fragment.appendChild(meta);

  strategy.symbolGroups.forEach((group) => {
    const groupCard = createElement("article", "panel-card payoff-group-card");
    const groupHeader = createElement("div", "payoff-group-header");
    const copy = createElement("div");
    const title = createElement("h3", "", group.symbol);
    const subtitle = createElement("p", "", `${group.positionCount} position(s) | Spot ${formatNumber(group.anchorSpot)} | TTE ${group.simulation.daysToExpiry}d`);
    const metricStrip = createElement("div", "payoff-metric-strip");
    const chartFrame = createElement("div", "payoff-chart-frame");
    const canvas = document.createElement("canvas");
    const table = document.createElement("table");
    const wrap = createElement("div", "payoff-table-wrap");

    copy.append(title, subtitle);
    groupHeader.appendChild(copy);

    metricStrip.innerHTML = `
      <span>Breakeven ${group.breakevens.length > 0 ? group.breakevens.map((value) => formatNumber(value)).join(", ") : "-"}</span>
      <span>Max Profit ${formatBound(group.maxProfit)}</span>
      <span>Max Loss ${formatBound(group.maxLoss)}</span>
      <span>Premium ${formatNumber(group.totalPremium)}</span>
    `;

    table.className = "payoff-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Side</th>
          <th>Instrument</th>
          <th>Type</th>
          <th>Strike</th>
          <th>Qty</th>
          <th>IV</th>
        </tr>
      </thead>
      <tbody>
        ${group.positions.map((position) => `
          <tr>
            <td>${escapeHtml(position.side)}</td>
            <td>${escapeHtml(position.instrument)}</td>
            <td>${escapeHtml(position.optionType)}</td>
            <td>${escapeHtml(position.strike)}</td>
            <td>${position.remainingQty}</td>
            <td>${formatNumber(position.resolvedIv)}</td>
          </tr>
        `).join("")}
      </tbody>
    `;

    chartFrame.appendChild(canvas);
    wrap.appendChild(table);
    groupCard.append(groupHeader, metricStrip, chartFrame, wrap);
    fragment.appendChild(groupCard);

    renderPayoffChart(canvas, group.points);
  });

  return fragment;
}

function renderPayoffChart(canvas, points) {
  if (!window.Chart) {
    return;
  }

  const existingChart = chartInstances.get(canvas);
  if (existingChart) {
    existingChart.destroy();
  }

  const minSpot = Math.min(...points.map((point) => point.spot));
  const maxSpot = Math.max(...points.map((point) => point.spot));
  const chart = new window.Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label: "Projected P&L",
        data: points.map((point) => ({ x: point.spot, y: point.payoff })),
        borderColor: "#ff9d1e",
        backgroundColor: "rgba(255, 157, 30, 0.12)",
        fill: true,
        tension: 0.24,
        pointRadius: 0,
        pointHoverRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title(items) {
              return `Spot ${formatSpotTick(items[0].parsed.x)}`;
            },
            label(item) {
              return `P&L ${formatNumber(item.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: minSpot,
          max: maxSpot,
          ticks: {
            color: "#7f94a8",
            stepSize: PAYOFF_X_AXIS_STEP,
            autoSkip: true,
            maxTicksLimit: 13,
            callback(value) {
              return formatSpotTick(value);
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: "#7f94a8",
            callback(value) {
              return formatShortNumber(value);
            }
          },
          grid: {
            color: "rgba(91, 118, 148, 0.18)"
          }
        }
      }
    },
    plugins: [payoffHoverLinePlugin]
  });

  chartInstances.set(canvas, chart);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatShortNumber(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 100000) {
    return `${(numeric / 100000).toFixed(1)}L`;
  }

  if (Math.abs(numeric) >= 1000) {
    return `${(numeric / 1000).toFixed(0)}k`;
  }

  return `${Math.round(numeric)}`;
}

function formatSpotTick(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatBound(value) {
  return typeof value === "string" ? value : formatNumber(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
