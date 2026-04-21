const routeLoaders = {
  dashboard: () => import("./features/dashboard/dashboard-view.js").then((module) => module.createDashboardView),
  "trade-entry": () => import("./features/trade-entry/trade-entry-view.js").then((module) => module.createTradeEntryView),
  "open-positions": () => import("./features/open-positions/open-positions-view.js").then((module) => module.createOpenPositionsView),
  "closed-positions": () => import("./features/closed-positions/closed-positions-view.js").then((module) => module.createClosedPositionsView),
  strategies: () => import("./features/strategies/strategies-view.js").then((module) => module.createStrategiesView),
  "equity-curve": () => import("./features/equity-curve/equity-curve-view.js").then((module) => module.createEquityCurveView),
  "risk-dashboard": () => import("./features/risk/risk-dashboard-view.js").then((module) => module.createRiskDashboardView),
  "trade-analytics": () => import("./features/trade-analytics/trade-analytics-view.js").then((module) => module.createTradeAnalyticsView),
  drawdown: () => import("./features/drawdown/drawdown-view.js").then((module) => module.createDrawdownView),
  "asset-exposure": () => import("./features/asset-exposure/asset-exposure-view.js").then((module) => module.createAssetExposureView),
  "payoff-charts": () => import("./features/payoff-charts/payoff-charts-view.js").then((module) => module.createPayoffChartsView)
};

function createLazyRoute(definition) {
  let cachedViewFactory = null;
  let pendingLoad = null;

  return {
    ...definition,
    async loadView() {
      if (cachedViewFactory) {
        return cachedViewFactory;
      }

      if (!pendingLoad) {
        pendingLoad = routeLoaders[definition.id]().then((viewFactory) => {
          cachedViewFactory = viewFactory;
          return viewFactory;
        });
      }

      return pendingLoad;
    }
  };
}

export const routes = [
  createLazyRoute({
    id: "dashboard",
    label: "Dashboard",
    subtitle: "Snapshot",
    heading: "Trading command center",
    description: "Track portfolio health, capital posture, and the next actions that matter."
  }),
  createLazyRoute({
    id: "trade-entry",
    label: "Trade Entry",
    subtitle: "Execution log",
    heading: "Trade capture workspace",
    description: "Structured entry flow for options and futures, including tags, notes, and strategy mapping."
  }),
  createLazyRoute({
    id: "open-positions",
    label: "Open Positions",
    subtitle: "Live book",
    heading: "Open position monitor",
    description: "Follow remaining quantity, live Greeks, and risk posture for active trades."
  }),
  createLazyRoute({
    id: "closed-positions",
    label: "Closed Positions",
    subtitle: "History",
    heading: "Closed trade archive",
    description: "Historical trade outcomes, notes, and performance review for completed positions."
  }),
  createLazyRoute({
    id: "strategies",
    label: "Strategies",
    subtitle: "Grouped views",
    heading: "Strategy grouping",
    description: "Combine multi-leg or multi-symbol ideas under a single strategy lens."
  }),
  createLazyRoute({
    id: "equity-curve",
    label: "Equity Curve",
    subtitle: "Capital path",
    heading: "Capital and drawdown flow",
    description: "Portfolio capital progression from the initial base of Rs. 10,00,000 onward."
  }),
  createLazyRoute({
    id: "risk-dashboard",
    label: "Risk Dashboard",
    subtitle: "Greeks",
    heading: "Portfolio risk posture",
    description: "Portfolio delta, theta, IV sourcing, and live exposure monitoring for open positions."
  }),
  createLazyRoute({
    id: "trade-analytics",
    label: "Trade Analytics",
    subtitle: "Performance",
    heading: "Trade outcome analytics",
    description: "Win rate, performance trends, and strategy edge diagnostics for historical trades."
  }),
  createLazyRoute({
    id: "drawdown",
    label: "Drawdown",
    subtitle: "Pain map",
    heading: "Drawdown tracking",
    description: "See stress periods quickly and understand recovery behavior across the portfolio."
  }),
  createLazyRoute({
    id: "asset-exposure",
    label: "Asset Exposure",
    subtitle: "Allocation",
    heading: "Underlying exposure map",
    description: "Review concentration across symbols, instruments, and strategy buckets."
  }),
  createLazyRoute({
    id: "payoff-charts",
    label: "Payoff Charts",
    subtitle: "Strategy P/L",
    heading: "Strategy payoff diagrams",
    description: "Visualize open-strategy payoff across spot ranges and review breakevens with compact contract detail."
  })
];

export function preloadRemainingRouteViews(activeRouteId) {
  routes
    .filter((route) => route.id !== activeRouteId)
    .forEach((route) => {
      window.setTimeout(() => {
        route.loadView().catch(() => {});
      }, 0);
    });
}
