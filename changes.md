# UI Refresh Change Log

## Goal

Reskin the application into a Bloomberg-terminal-inspired interface without changing data flows, routes, or feature behavior.

## What Changed

### Shared shell and navigation

- Reworked the app shell header into a terminal-style control rail with section status pills and a route identifier.
- Expanded the sidebar with session/interface summary cards and a status footer while preserving the same navigation behavior.
- Swapped typography to `IBM Plex Sans` and `IBM Plex Mono` for a denser market-terminal feel.

### Visual system

- Replaced the warm light palette with a dark terminal palette using amber, teal, blue, green, and red signal colors.
- Updated global spacing, borders, radii, overlays, and backgrounds to use a sharper, screen-like presentation.
- Added a subtle grid-based body background to reinforce the terminal aesthetic.

### Shared components

- Restyled buttons, pills, cards, banners, placeholders, and section chrome for better consistency and readability.
- Standardized input, select, and textarea styling across forms and modal workflows.
- Tightened table headers and metadata styling with monospaced labels for improved scanability.

### Feature views

- Updated dashboard hero, metric cards, and system-health panels to match the new visual language.
- Restyled open positions, closed positions, strategies, risk, analytics, trade entry, and payoff chart sections using the shared terminal theme.
- Updated modal overlays and detail cards to keep the same workflows with improved visual consistency.

### Charts

- Updated hard-coded chart colors in equity, drawdown, risk, trade analytics, and payoff views so charts match the new theme.
- Adjusted chart grid/tick colors for better contrast on the dark background.

## Functionality Safety

- No routing logic was changed.
- No service, repository, analytics, or trade-processing logic was changed.
- Existing actions such as refresh, navigation, edit, delete, square-off, filtering, exports, and chart rendering remain intact.

## Code Quality Improvements

- Concentrated the UI overhaul in shared shell/components and theme variables so the style system is easier to maintain.
- Kept presentation changes mostly class-driven to avoid feature-level behavioral risk.
- Reduced theme drift by replacing remaining hard-coded chart colors from the previous light theme.
