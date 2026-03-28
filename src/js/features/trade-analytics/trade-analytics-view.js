import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { createElement } from "../../core/dom.js";

export function createTradeAnalyticsView() {
  const wrapper = createElement("section", "analytics-layout");
  const card = createElement("article", "panel-card analytics-card");
  const header = createHeader("Trade Analytics");
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading trade analytics...");
  const summaryGrid = createElement("section", "analytics-summary-grid");
  const chartGrid = createElement("section", "analytics-chart-grid");
  const outcomeCard = createChartCard("Win / Loss Mix");
  const strategyCard = createChartCard("Strategy Performance");
  const tableCard = createElement("section", "analytics-table-card");
  const tableTitle = createElement("h3", "", "Strategy Performance");
  const tableWrap = createElement("div", "analytics-table-wrap");
  const table = document.createElement("table");
  const tableBody = document.createElement("tbody");

  table.className = "analytics-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Strategy</th>
        <th>Trades</th>
        <th>Wins</th>
        <th>Win Rate</th>
        <th>P&L</th>
      </tr>
    </thead>
  `;
  table.appendChild(tableBody);
  tableWrap.appendChild(table);
  tableCard.append(tableTitle, tableWrap);
  chartGrid.append(outcomeCard.card, strategyCard.card);
  card.append(header, statusBanner, summaryGrid, chartGrid, tableCard);
  wrapper.appendChild(card);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await summarizePortfolio();
      renderSummary(summaryGrid, snapshot.tradeSummary);
      renderStrategyTable(tableBody, snapshot.strategyPerformance);
      renderOutcomeChart(outcomeCard.canvas, snapshot.tradeSummary);
      renderStrategyChart(strategyCard.canvas, snapshot.strategyPerformance);

      statusBanner.textContent = snapshot.tradeSummary.closedCount > 0
        ? `Calculated win/loss metrics from ${snapshot.tradeSummary.closedCount} closed trade(s).`
        : "No closed trades yet. Analytics will appear after completed exits.";
      statusBanner.className = `trade-status-banner ${snapshot.tradeSummary.closedCount > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load trade analytics.";
      statusBanner.textContent = message;
      statusBanner.className = "trade-status-banner is-error";
      tableBody.innerHTML = `<tr><td colspan="5" class="positions-empty">${escapeHtml(message)}</td></tr>`;
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

function createChartCard(titleText) {
  const card = createElement("article", "panel-card analytics-chart-card");
  const title = createElement("h3", "", titleText);
  const frame = createElement("div", "analytics-chart-frame");
  const canvas = document.createElement("canvas");
  frame.appendChild(canvas);
  card.append(title, frame);
  return { card, canvas };
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <article class="trade-summary-block analytics-stat-card">
      <span>Win Rate</span>
      <strong>${summary.winRate.toFixed(1)}%</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Average P&L</span>
      <strong>${formatSigned(summary.averagePnl)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Best Trade</span>
      <strong>${summary.bestTrade ? formatSigned(summary.bestTrade.realizedPnl) : "-"}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Worst Trade</span>
      <strong>${summary.worstTrade ? formatSigned(summary.worstTrade.realizedPnl) : "-"}</strong>
    </article>
  `;
}

function renderStrategyTable(tableBody, strategies) {
  tableBody.innerHTML = "";

  if (strategies.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="positions-empty">No strategy analytics available yet.</td></tr>`;
    return;
  }

  strategies.forEach((strategy) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(strategy.name)}</td>
      <td>${strategy.tradeCount}</td>
      <td>${strategy.winCount}</td>
      <td>${strategy.winRate.toFixed(1)}%</td>
      <td class="${strategy.pnl >= 0 ? "analytics-positive" : "analytics-negative"}">${formatSigned(strategy.pnl)}</td>
    `;
    tableBody.appendChild(row);
  });
}

function renderOutcomeChart(canvas, summary) {
  if (!window.Chart) {
    return;
  }

  new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Wins", "Losses", "Flat"],
      datasets: [{
        data: [summary.winCount, summary.lossCount, summary.flatCount],
        backgroundColor: [
          "rgba(71, 209, 140, 0.8)",
          "rgba(255, 107, 91, 0.8)",
          "rgba(127, 148, 168, 0.55)"
        ],
        borderWidth: 0
      }]
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
      }
    }
  });
}

function renderStrategyChart(canvas, strategies) {
  if (!window.Chart) {
    return;
  }

  const topStrategies = strategies.slice(0, 8);

  new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: topStrategies.map((strategy) => strategy.name),
      datasets: [{
        label: "Strategy P&L",
        data: topStrategies.map((strategy) => strategy.pnl),
        backgroundColor: topStrategies.map((strategy) => strategy.pnl >= 0 ? "rgba(71, 209, 140, 0.72)" : "rgba(255, 107, 91, 0.72)"),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
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
            color: "#7f94a8",
            callback(value) {
              return formatAxisNumber(value);
            }
          },
          grid: {
            color: "rgba(91, 118, 148, 0.18)"
          }
        }
      }
    }
  });
}

function formatAxisNumber(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1000) {
    return `${(numeric / 1000).toFixed(1)}k`;
  }

  return `${numeric}`;
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
