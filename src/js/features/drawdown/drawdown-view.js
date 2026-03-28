import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { createElement } from "../../core/dom.js";

export function createDrawdownView() {
  const wrapper = createElement("section", "analytics-layout");
  const card = createElement("article", "panel-card analytics-card");
  const header = createHeader("Drawdown");
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading drawdown analytics...");
  const summaryGrid = createElement("section", "analytics-summary-grid");
  const chartGrid = createElement("section", "analytics-chart-grid analytics-chart-grid-single");
  const drawdownCard = createChartCard("Drawdown Curve");
  const tableCard = createElement("section", "analytics-table-card");
  const tableTitle = createElement("h3", "", "Worst Closed Trades");
  const tableWrap = createElement("div", "analytics-table-wrap");
  const table = document.createElement("table");
  const tableBody = document.createElement("tbody");

  table.className = "analytics-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Exit</th>
        <th>Strategy</th>
        <th>Symbol</th>
        <th>Side</th>
        <th>P&L</th>
      </tr>
    </thead>
  `;
  table.appendChild(tableBody);
  tableWrap.appendChild(table);
  tableCard.append(tableTitle, tableWrap);
  chartGrid.appendChild(drawdownCard.card);
  card.append(header, statusBanner, summaryGrid, chartGrid, tableCard);
  wrapper.appendChild(card);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await summarizePortfolio();
      renderSummary(summaryGrid, snapshot.tradeSummary, snapshot.drawdown);
      renderLossTable(tableBody, snapshot.closedTrades);
      renderDrawdownChart(drawdownCard.canvas, snapshot.drawdown);

      statusBanner.textContent = buildDrawdownStatusMessage(snapshot);
      statusBanner.className = `trade-status-banner ${snapshot.tradeSummary.closedCount > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load drawdown analytics.";
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

function renderSummary(container, summary, drawdown) {
  const latest = drawdown.at(-1) || { drawdownPercent: 0 };

  container.innerHTML = `
    <article class="trade-summary-block analytics-stat-card">
      <span>Max Drawdown</span>
      <strong>${summary.maxDrawdownPercent.toFixed(2)}%</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Current Drawdown</span>
      <strong>${latest.drawdownPercent.toFixed(2)}%</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Ending Capital</span>
      <strong>Rs. ${formatNumber(summary.endingCapital)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Realized P&L</span>
      <strong>${formatSigned(summary.totalRealizedPnl)}</strong>
    </article>
  `;
}

function renderLossTable(tableBody, trades) {
  tableBody.innerHTML = "";
  const losingTrades = [...trades]
    .sort((left, right) => left.realizedPnl - right.realizedPnl)
    .slice(0, 10);

  if (losingTrades.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="positions-empty">No losing closed trades yet.</td></tr>`;
    return;
  }

  losingTrades.forEach((trade) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(trade.lastExitDate)}</td>
      <td>${escapeHtml(trade.strategyName)}</td>
      <td>${escapeHtml(trade.symbol)}</td>
      <td>${escapeHtml(trade.action)}</td>
      <td class="analytics-negative">${formatSigned(trade.realizedPnl)}</td>
    `;
    tableBody.appendChild(row);
  });
}

function renderDrawdownChart(canvas, drawdown) {
  if (!window.Chart) {
    return;
  }

  new window.Chart(canvas, {
    type: "line",
    data: {
      labels: drawdown.map((point) => point.date),
      datasets: [{
        label: "Drawdown %",
        data: drawdown.map((point) => point.drawdownPercent),
        borderColor: "#ff6b5b",
        backgroundColor: "rgba(255, 107, 91, 0.16)",
        fill: true,
        tension: 0.28,
        pointRadius: 2
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
            color: "#7f94a8",
            maxRotation: 0,
            autoSkip: true
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: "#7f94a8",
            callback(value) {
              return `${Number(value).toFixed(1)}%`;
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

function formatTrackingSource(source) {
  return source === "portfolio_table" ? "portfolio table" : "derived snapshot";
}

function buildDrawdownStatusMessage(snapshot) {
  const trackingSource = formatTrackingSource(snapshot.portfolioTracking?.source);

  if (snapshot.portfolioTracking?.source === "portfolio_table" && snapshot.portfolioTracking?.mtmStored) {
    return `Drawdown is using stored portfolio snapshots, including saved end-of-day MTM rows. Source: ${trackingSource}.`;
  }

  if (snapshot.tradeSummary.closedCount === 0) {
    return "No closed trades yet. Drawdown will appear once realized P&L exists.";
  }

  if (snapshot.portfolioTracking?.source === "portfolio_table") {
    return `Drawdown is using stored portfolio snapshots. Source: ${trackingSource}.`;
  }

  return `Drawdown is based on realized capital updates from ${snapshot.tradeSummary.closedCount} closed trade(s). Source: ${trackingSource}.`;
}
