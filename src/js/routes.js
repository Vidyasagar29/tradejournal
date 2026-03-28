import { createDashboardView } from "./features/dashboard/dashboard-view.js";
import { createClosedPositionsView } from "./features/closed-positions/closed-positions-view.js";
import { createDrawdownView } from "./features/drawdown/drawdown-view.js";
import { createEquityCurveView } from "./features/equity-curve/equity-curve-view.js";
import { createAssetExposureView } from "./features/asset-exposure/asset-exposure-view.js";
import { createOpenPositionsView } from "./features/open-positions/open-positions-view.js";
import { createPayoffChartsView } from "./features/payoff-charts/payoff-charts-view.js";
import { createRiskDashboardView } from "./features/risk/risk-dashboard-view.js";
import { createStrategiesView } from "./features/strategies/strategies-view.js";
import { createTradeAnalyticsView } from "./features/trade-analytics/trade-analytics-view.js";
import { createTradeEntryView } from "./features/trade-entry/trade-entry-view.js";
import { createPlaceholderView } from "./ui/placeholder-view.js";

const buildPlaceholder = (title, description, bullets) => () =>
  createPlaceholderView({
    title,
    description,
    bullets
  });

export const routes = [
  {
    id: "dashboard",
    label: "Dashboard",
    subtitle: "Snapshot",
    heading: "Trading command center",
    description: "Track portfolio health, capital posture, and the next actions that matter.",
    view: createDashboardView
  },
  {
    id: "trade-entry",
    label: "Trade Entry",
    subtitle: "Execution log",
    heading: "Trade capture workspace",
    description: "Structured entry flow for options and futures, including tags, notes, and strategy mapping.",
    view: createTradeEntryView
  },
  {
    id: "open-positions",
    label: "Open Positions",
    subtitle: "Live book",
    heading: "Open position monitor",
    description: "Follow remaining quantity, live Greeks, and risk posture for active trades.",
    view: createOpenPositionsView
  },
  {
    id: "closed-positions",
    label: "Closed Positions",
    subtitle: "History",
    heading: "Closed trade archive",
    description: "Historical trade outcomes, notes, and performance review for completed positions.",
    view: createClosedPositionsView
  },
  {
    id: "strategies",
    label: "Strategies",
    subtitle: "Grouped views",
    heading: "Strategy grouping",
    description: "Combine multi-leg or multi-symbol ideas under a single strategy lens.",
    view: createStrategiesView
  },
  {
    id: "equity-curve",
    label: "Equity Curve",
    subtitle: "Capital path",
    heading: "Capital and drawdown flow",
    description: "Portfolio capital progression from the initial base of Rs. 10,00,000 onward.",
    view: createEquityCurveView
  },
  {
    id: "risk-dashboard",
    label: "Risk Dashboard",
    subtitle: "Greeks",
    heading: "Portfolio risk posture",
    description: "Portfolio delta, theta, IV sourcing, and live exposure monitoring for open positions.",
    view: createRiskDashboardView
  },
  {
    id: "trade-analytics",
    label: "Trade Analytics",
    subtitle: "Performance",
    heading: "Trade outcome analytics",
    description: "Win rate, performance trends, and strategy edge diagnostics for historical trades.",
    view: createTradeAnalyticsView
  },
  {
    id: "drawdown",
    label: "Drawdown",
    subtitle: "Pain map",
    heading: "Drawdown tracking",
    description: "See stress periods quickly and understand recovery behavior across the portfolio.",
    view: createDrawdownView
  },
  {
    id: "asset-exposure",
    label: "Asset Exposure",
    subtitle: "Allocation",
    heading: "Underlying exposure map",
    description: "Review concentration across symbols, instruments, and strategy buckets.",
    view: createAssetExposureView
  },
  {
    id: "payoff-charts",
    label: "Payoff Charts",
    subtitle: "Strategy P/L",
    heading: "Strategy payoff diagrams",
    description: "Visualize open-strategy payoff across spot ranges and review breakevens with compact contract detail.",
    view: createPayoffChartsView
  }
];
