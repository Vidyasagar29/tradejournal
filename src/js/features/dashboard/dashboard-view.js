import { summarizePortfolio } from "../../analytics/portfolio-analytics.js";
import { createElement } from "../../core/dom.js";
import {
  getConnectionState,
  runConnectionTest
} from "../../data/connection-status-service.js";
import { getOpenPositionsSnapshot } from "../open-positions/open-positions-service.js";
import { getRiskDashboardSnapshot } from "../risk/risk-dashboard-service.js";
import { getStrategySnapshot } from "../strategies/strategies-service.js";

export function createDashboardView() {
  const wrapper = createElement("section", "dashboard-grid");
  const hero = createHeroSection();
  const metricsSection = createMetricsSection();
  const lowerSection = createLowerSection();

  wrapper.append(hero.section, metricsSection.section, lowerSection.section);
  loadSnapshot();
  return wrapper;

  async function loadSnapshot() {
    try {
      const [portfolio, openPositions, strategies, risk] = await Promise.all([
        summarizePortfolio(),
        getOpenPositionsSnapshot(),
        getStrategySnapshot(),
        getRiskDashboardSnapshot()
      ]);

      renderHero(hero.primaryActions, hero.highlights, {
        openCount: openPositions.summary.openCount,
        strategyCount: strategies.summary.strategyCount,
        closedCount: portfolio.tradeSummary.closedCount,
        connectionConfigured: getConnectionState().isConfigured
      });
      renderMetrics(metricsSection.grid, {
        openNotional: openPositions.summary.totalOpenValue,
        endingCapital: portfolio.tradeSummary.endingCapital,
        realizedPnl: portfolio.tradeSummary.totalRealizedPnl,
        portfolioDelta: risk.summary.portfolioDelta,
        portfolioTheta: risk.summary.portfolioTheta,
        winRate: portfolio.tradeSummary.winRate,
        maxDrawdown: portfolio.tradeSummary.maxDrawdownPercent,
        openStrategies: strategies.summary.openStrategies
      });
      renderPriorityList(lowerSection.nextList, openPositions.positions, strategies.strategies);
      renderHealthList(lowerSection.healthList, {
        connectionState: getConnectionState(),
        portfolioTracking: portfolio.portfolioTracking,
        riskSummary: risk.summary,
        recentClosedTrades: portfolio.recentClosedTrades.length
      });
      hero.status.hidden = true;
      hero.status.textContent = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load dashboard snapshot.";
      hero.status.hidden = false;
      hero.status.textContent = message;
      hero.status.className = "trade-status-banner is-error";
    }
  }
}

function createHeroSection() {
  const section = createElement("section", "dashboard-hero");
  const heroCard = createElement("article", "panel-card hero-card");
  const title = createElement("h3", "", "Trading journal overview");
  const copy = createElement("p", "", "Live status across book, capital, strategies, and risk.");
  const status = createElement("div", "trade-status-banner is-info", "Loading dashboard summary...");
  const highlights = createElement("div", "hero-metrics");
  const primaryActions = createElement("div", "connection-actions");
  const tradeEntryButton = createElement("button", "button-primary", "Trade Entry");
  const openBookButton = createElement("button", "button-secondary", "Open Positions");
  const aside = createElement("aside", "hero-aside");

  tradeEntryButton.type = "button";
  tradeEntryButton.addEventListener("click", () => {
    window.location.hash = "trade-entry";
  });

  openBookButton.type = "button";
  openBookButton.addEventListener("click", () => {
    window.location.hash = "open-positions";
  });

  primaryActions.append(tradeEntryButton, openBookButton);
  heroCard.append(title, copy, status, highlights, primaryActions);
  aside.append(createConnectionCard());
  section.append(heroCard, aside);

  return {
    section,
    status,
    highlights,
    primaryActions
  };
}

function createMetricsSection() {
  const section = createElement("section");
  const header = createElement("div", "section-header");
  const copy = createElement("div");
  const title = createElement("h2", "", "Live Metrics");
  const text = createElement("p", "", "Current capital, risk, and execution summaries pulled from the active modules.");
  const grid = createElement("div", "metrics-grid");

  copy.append(title, text);
  header.appendChild(copy);
  section.append(header, grid);

  return { section, grid };
}

function createLowerSection() {
  const section = createElement("section", "dashboard-lower");
  const nextCard = createElement("article", "panel-card");
  const nextTitle = createElement("h3", "", "What Needs Attention");
  const nextList = createElement("ul", "signal-list");
  const healthCard = createElement("article", "panel-card");
  const healthTitle = createElement("h3", "", "System Health");
  const healthList = createElement("ul", "feed-list");

  nextCard.append(nextTitle, nextList);
  healthCard.append(healthTitle, healthList);
  section.append(nextCard, healthCard);

  return { section, nextList, healthList };
}

function renderHero(container, highlights, snapshot) {
  highlights.innerHTML = "";

  [
    ["Open Positions", String(snapshot.openCount)],
    ["Strategies", String(snapshot.strategyCount)],
    ["Closed Trades", String(snapshot.closedCount)],
    ["Supabase", snapshot.connectionConfigured ? "Configured" : "Check Config"]
  ].forEach(([label, value]) => {
    const chip = createElement("div", "hero-chip");
    const chipLabel = createElement("span", "", label);
    const chipValue = createElement("strong", "", value);
    chip.append(chipLabel, chipValue);
    highlights.appendChild(chip);
  });
}

function renderMetrics(container, metrics) {
  container.innerHTML = "";

  [
    ["Ending Capital", `Rs. ${formatNumber(metrics.endingCapital)}`, "Tracked capital after realized P&L."],
    ["Open Notional", `Rs. ${formatNumber(metrics.openNotional)}`, "Entry-value exposure still active in the book."],
    ["Realized P&L", formatSigned(metrics.realizedPnl), "Closed-trade performance recognized so far."],
    ["Portfolio Delta", formatSigned(metrics.portfolioDelta), "Single-unit delta from the active risk book."],
    ["Portfolio Theta", formatSigned(metrics.portfolioTheta), "Single-unit theta from live open positions."],
    ["Win Rate", `${metrics.winRate.toFixed(1)}%`, "Closed-trade hit rate."],
    ["Max Drawdown", `${metrics.maxDrawdown.toFixed(2)}%`, "Worst realized capital drawdown."],
    ["Open Strategies", String(metrics.openStrategies), "Strategies that still have active legs."]
  ].forEach(([title, value, note]) => {
    const card = createElement("article", "metric-card");
    const metricTitle = createElement("h3", "", title);
    const strong = createElement("strong", "", value);
    const paragraph = createElement("p", "", note);
    card.append(metricTitle, strong, paragraph);
    container.appendChild(card);
  });
}

function renderPriorityList(container, openPositions, strategies) {
  container.innerHTML = "";

  const items = [];

  const partials = openPositions.filter((position) => Number(position.exitedQty || 0) > 0 && Number(position.remainingQty || 0) > 0);
  if (partials.length > 0) {
    items.push([
      "Partial exits still open",
      `${partials.length} position(s) are partially squared off and still need monitoring.`
    ]);
  }

  const noTag = openPositions.filter((position) => !position.tag || position.tag === "-");
  if (noTag.length > 0) {
    items.push([
      "Tag cleanup pending",
      `${noTag.length} open position(s) do not have a useful tag.`
    ]);
  }

  const mixedStrategies = strategies.filter((strategy) => strategy.symbols.length > 1);
  if (mixedStrategies.length > 0) {
    items.push([
      "Mixed-symbol strategies active",
      `${mixedStrategies.length} strategy group(s) span more than one symbol.`
    ]);
  }

  if (items.length === 0) {
    items.push([
      "Open book looks clean",
      "No obvious action items were detected from current positions and strategy grouping."
    ]);
  }

  items.slice(0, 4).forEach(([title, note]) => {
    const item = createElement("li", "feed-item");
    const text = createElement("div");
    const strong = createElement("strong", "", title);
    const span = createElement("span", "", note);
    text.append(strong, span);
    item.appendChild(text);
    container.appendChild(item);
  });
}

function renderHealthList(container, snapshot) {
  container.innerHTML = "";

  const connectionMessage = snapshot.connectionState.isConfigured
    ? "Supabase credentials are loaded locally."
    : "Supabase credentials still need attention.";
  const trackingMessage = snapshot.portfolioTracking?.source === "portfolio_table"
    ? "Equity and drawdown are reading from the portfolio table."
    : "Equity and drawdown are using calculated trade data.";
  const ivMessage = snapshot.riskSummary.sheetIvCount > 0
    ? `${snapshot.riskSummary.sheetIvCount} open position(s) are using Google Sheet IV data.`
    : "Open positions are using default or entry IV.";

  [
    ["Connection", connectionMessage],
    ["Portfolio Tracking", trackingMessage],
    ["Risk Inputs", ivMessage],
    ["Closed Trade Base", `${snapshot.recentClosedTrades} recent closed trade(s) are available for analytics.`]
  ].forEach(([title, note]) => {
    const item = createElement("li", "feed-item");
    const text = createElement("div");
    const strong = createElement("strong", "", title);
    const span = createElement("span", "", note);
    text.append(strong, span);
    item.appendChild(text);
    container.appendChild(item);
  });
}

function createConnectionCard() {
  const card = createElement("article", "panel-card connection-card");
  const title = createElement("h3", "", "Supabase Connection");
  const copy = createElement("p", "", "Quick DB health check.");
  const statusBadge = createElement("span", "status-badge pending", "Config required");
  const details = createElement("div", "connection-details");
  const configLine = createElement("p", "connection-line");
  const messageLine = createElement("p", "connection-line");
  const buttonRow = createElement("div", "connection-actions");
  const testButton = createElement("button", "button-primary", "Test Connection");

  const renderState = (state) => {
    statusBadge.textContent = getBadgeLabel(state);
    statusBadge.className = `status-badge ${getBadgeTone(state)}`;
    configLine.textContent = `${state.metadata.connectionTestTable || "portfolio"}`;
    messageLine.textContent = state.message;
    testButton.disabled = state.isLoading || !state.isConfigured;
    testButton.textContent = state.isLoading ? "Testing..." : "Test";
  };

  testButton.type = "button";
  testButton.addEventListener("click", async () => {
    renderState({
      ...getConnectionState(),
      isLoading: true,
      message: "Testing database connection..."
    });
    await runConnectionTest();
    renderState(getConnectionState());
  });

  buttonRow.appendChild(testButton);
  details.append(configLine, messageLine);
  card.append(title, copy, statusBadge, details, buttonRow);
  renderState(getConnectionState());

  return card;
}

function getBadgeTone(state) {
  if (state.isConnected) {
    return "success";
  }

  if (state.isLoading) {
    return "pending";
  }

  if (!state.isConfigured) {
    return "warning";
  }

  return "error";
}

function getBadgeLabel(state) {
  if (state.isConnected) {
    return "Connected";
  }

  if (state.isLoading) {
    return "Checking";
  }

  if (!state.isConfigured) {
    return "Config required";
  }

  return "Connection failed";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSigned(value) {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatNumber(amount)}`;
}
