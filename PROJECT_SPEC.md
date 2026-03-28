# Trade Journal System Specification

## Purpose

A web-based Options and Futures Trade Journal with analytics dashboards, strategy grouping, payoff diagrams, and risk monitoring using Greeks.

The system allows manual trade entry and tracks portfolio performance.

---

# Technology Stack

Frontend

* HTML
* CSS
* Vanilla JavaScript

Charts

* Chart.js

Database

* Supabase (PostgreSQL)

Market Data

* Google Sheets
* Used only for open position IV and spot price

Hosting

* GitHub Pages (later)

Development

* Local browser testing

---

# Core Modules

1. Trade Entry
2. Open Positions
3. Closed Positions
4. Strategy Analytics
5. Risk Dashboard
6. Trade Analytics
7. Drawdown Dashboard
8. Asset Exposure
9. Strategy Payoff Charts

---

# UI Layout

Left sidebar navigation.

Main content panel updates dynamically.

Sections:

* Dashboard
* Trade Entry
* Open Positions
* Closed Positions
* Strategies
* Equity Curve
* Risk Dashboard
* Trade Analytics
* Drawdown
* Asset Exposure

---

# Trade Entry Fields

Trade ID (auto)

Strategy Name

Action
Long / Short

Trade Date

Symbol
Default: NIFTY

Instrument Type
Option / Future

Expiry
Calendar selector

Strike

Option Type
CE / PE

Quantity

Entry Price

Entry IV

Tag

Notes

---

# Position Handling

Trades create positions.

Square-off supports partial exits.

Exit fields:

* Exit Date
* Exit Quantity
* Exit Price

When remaining quantity becomes zero → move to Closed Positions.

---

# Greeks Calculation

Used only for open positions.

Inputs:

* Spot price (Google Sheets)
* Strike
* Expiry
* IV (Google Sheets)
* Risk-free rate = 10%

Fallback IV priority:

1. Strike IV from sheet
2. Default IV
3. Entry IV

Outputs:

* Delta
* Theta

Portfolio Greeks calculated by summing position Greeks.

---

# Google Sheets Data

Structure:

symbol | expiry | strike | type | IV

Example:

NIFTY | 27MAR2026 | 22000 | CE | 15.8

Used only for open position Greeks.

---

# Strategy Grouping

Trades grouped by Strategy Name.

Strategies may contain multiple symbols.

Example:

Strategy: Hedge

Long NIFTY Put
Short BANKNIFTY Call

---

# Portfolio

Initial capital = ₹10,00,000

Portfolio capital updates when trades close.

Used for:

* equity curve
* drawdown

---

# Charts

Use Chart.js.

Charts required:

* Equity Curve
* Strategy Performance
* Risk Dashboard
* Win/Loss
* Drawdown
* Asset Exposure
* Strategy Payoff Diagram

---

# Database Tables

strategies
trades
positions
exits
portfolio
default_iv
market_data

---

# Filters

All tables support filtering by:

* Symbol
* Strategy
* Date Range
* Tag

---

# Tags

Trades support tags such as:

* volatility
* directional
* hedge
* event
