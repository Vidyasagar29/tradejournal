import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { loadNiftyBenchmarkSnapshot } from "../../analytics/benchmark-service.js";
import { createElement } from "../../core/dom.js";

export function createEquityCurveView() {
  const wrapper = createElement("section", "analytics-layout");
  const card = createElement("article", "panel-card analytics-card");
  const header = createHeader("Equity Curve");
  const statusBanner = createElement("div", "trade-status-banner is-info", "Loading equity curve...");
  const summaryGrid = createElement("section", "analytics-summary-grid");
  const chartGrid = createElement("section", "analytics-chart-grid");
  const capitalCard = createChartCard("Capital Curve");
  const benchmarkCard = createChartCard("Portfolio vs NIFTY (Indexed)");
  const pnlCard = createChartCard("Realized Daily P&L");
  const tableCard = createElement("section", "analytics-table-card");
  const tableTitle = createElement("h3", "", "Latest Closed Trades");
  const tableWrap = createElement("div", "analytics-table-wrap");
  const table = document.createElement("table");
  const tableBody = document.createElement("tbody");
  const benchmarkNote = createElement("p", "analytics-benchmark-note");

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
  benchmarkCard.card.appendChild(benchmarkNote);
  chartGrid.append(capitalCard.card, benchmarkCard.card, pnlCard.card);
  card.append(header, statusBanner, summaryGrid, chartGrid, tableCard);
  wrapper.appendChild(card);

  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const snapshot = await summarizePortfolio();
      const benchmarkSnapshot = await loadNiftyBenchmarkSnapshot(snapshot.equityCurve);
      renderSummary(summaryGrid, snapshot.tradeSummary, benchmarkSnapshot.summary);
      renderClosedTable(tableBody, snapshot.recentClosedTrades);
      renderCapitalChart(capitalCard.canvas, snapshot.equityCurve);
      renderBenchmarkChart(benchmarkCard.canvas, benchmarkSnapshot.comparison);
      renderDailyPnlChart(pnlCard.canvas, snapshot.equityCurve);
      benchmarkNote.textContent = benchmarkSnapshot.comparison.length > 0
        ? `Aligned ${benchmarkSnapshot.summary.alignedCount} date(s) against NIFTY benchmark history.`
        : "Populate the Google Sheets benchmark CSV with date and close columns to compare against NIFTY.";

      statusBanner.textContent = buildEquityStatusMessage(snapshot);
      statusBanner.className = `trade-status-banner ${snapshot.tradeSummary.closedCount > 0 ? "is-success" : "is-info"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load equity curve analytics.";
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

function renderSummary(container, summary, benchmarkSummary) {
  container.innerHTML = `
    <article class="trade-summary-block analytics-stat-card">
      <span>Ending Capital</span>
      <strong>Rs. ${formatNumber(summary.endingCapital)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Realized P&L</span>
      <strong>${formatSigned(summary.totalRealizedPnl)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Closed Trades</span>
      <strong>${summary.closedCount}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Max Drawdown</span>
      <strong>${summary.maxDrawdownPercent.toFixed(2)}%</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Portfolio Return</span>
      <strong>${formatPercent(benchmarkSummary.portfolioReturnPercent)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>NIFTY Return</span>
      <strong>${formatPercent(benchmarkSummary.benchmarkReturnPercent)}</strong>
    </article>
    <article class="trade-summary-block analytics-stat-card">
      <span>Vs NIFTY</span>
      <strong>${formatPercent(benchmarkSummary.relativePerformancePercent)}</strong>
    </article>
  `;
}

function renderClosedTable(tableBody, trades) {
  tableBody.innerHTML = "";

  if (trades.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="positions-empty">No closed trades yet.</td></tr>`;
    return;
  }

  trades.slice(0, 8).forEach((trade) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(trade.lastExitDate)}</td>
      <td>${escapeHtml(trade.strategyName)}</td>
      <td>${escapeHtml(trade.symbol)}</td>
      <td>${escapeHtml(trade.action)}</td>
      <td class="${trade.realizedPnl >= 0 ? "analytics-positive" : "analytics-negative"}">${formatSigned(trade.realizedPnl)}</td>
    `;
    tableBody.appendChild(row);
  });
}

function renderCapitalChart(canvas, points) {
  if (!window.Chart) {
    return;
  }

  new window.Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((point) => point.date),
      datasets: [{
        label: "Capital",
        data: points.map((point) => point.capital),
        borderColor: "#ff9d1e",
        backgroundColor: "rgba(255, 157, 30, 0.14)",
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }]
    },
    options: getBaseChartOptions("Rs.")
  });
}

function renderBenchmarkChart(canvas, points) {
  if (!window.Chart) {
    return;
  }

  if (points.length === 0) {
    new window.Chart(canvas, {
      type: "line",
      data: {
        labels: [],
        datasets: []
      },
      options: getBaseChartOptions()
    });
    return;
  }

  new window.Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          label: "Portfolio",
          data: points.map((point) => point.portfolioIndexed),
          borderColor: "#27c1b8",
          backgroundColor: "rgba(39, 193, 184, 0.12)",
          fill: false,
          tension: 0.28,
          pointRadius: 2
        },
        {
          label: "NIFTY",
          data: points.map((point) => point.benchmarkIndexed),
          borderColor: "#ff9d1e",
          backgroundColor: "rgba(255, 157, 30, 0.12)",
          fill: false,
          tension: 0.28,
          pointRadius: 2
        }
      ]
    },
    options: {
      ...getBaseChartOptions(),
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        }
      }
    }
  });
}

function renderDailyPnlChart(canvas, points) {
  if (!window.Chart) {
    return;
  }

  const realizedPnlValues = points.map((point) => point.realizedDailyPnl ?? point.dailyPnl ?? 0);

  new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: points.map((point) => point.date),
      datasets: [{
        label: "Realized Daily P&L",
        data: realizedPnlValues,
        backgroundColor: realizedPnlValues.map((value) => value >= 0 ? "rgba(71, 209, 140, 0.72)" : "rgba(255, 107, 91, 0.72)"),
        borderRadius: 6
      }]
    },
    options: getBaseChartOptions()
  });
}

function getBaseChartOptions(prefix = "") {
  return {
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
            return `${prefix}${formatAxisNumber(value)}`;
          }
        },
        grid: {
          color: "rgba(91, 118, 148, 0.18)"
        }
      }
    }
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatAxisNumber(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 100000) {
    return `${(numeric / 100000).toFixed(1)}L`;
  }

  if (Math.abs(numeric) >= 1000) {
    return `${(numeric / 1000).toFixed(0)}k`;
  }

  return `${numeric}`;
}

function formatSigned(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatNumber(amount)}`;
}

function formatPercent(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)}%`;
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

function buildEquityStatusMessage(snapshot) {
  const trackingSource = formatTrackingSource(snapshot.portfolioTracking?.source);

  if (snapshot.portfolioTracking?.source === "portfolio_table" && snapshot.portfolioTracking?.mtmStored) {
    return `Equity curve is using stored portfolio snapshots, including saved end-of-day MTM rows. Source: ${trackingSource}.`;
  }

  if (snapshot.tradeSummary.closedCount === 0) {
    return "No closed trades yet. Equity curve will appear once positions are fully exited.";
  }

  if (snapshot.portfolioTracking?.source === "portfolio_table") {
    return `Equity curve is using stored portfolio snapshots. Source: ${trackingSource}.`;
  }

  return `Built equity curve from ${snapshot.tradeSummary.closedCount} closed trade(s). Source: ${trackingSource}.`;
}
