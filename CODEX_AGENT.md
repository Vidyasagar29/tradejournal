# Codex Agent Instructions

You are the engineering agent responsible for maintaining and extending this project.

The project is a web-based Options and Futures Trade Journal with analytics dashboards and risk monitoring.

---

# Step 1 – Understand the System

Before writing code:

1. Read PROJECT_SPEC.md
2. Read TASKS.md
3. Review repository structure

Do not start coding before understanding architecture.

---

# Step 2 – Maintain Architecture

Architecture:

Frontend

* HTML
* CSS
* Vanilla JavaScript

Charts

* Chart.js

Database

* Supabase PostgreSQL

Market Data

* Google Sheets

Hosting

* GitHub Pages

There is no Node.js backend.

All logic runs in the browser.

---

# Step 3 – Modular Code

Keep modules separate.

Modules include:

* UI rendering
* Supabase database operations
* Trade management
* Position tracking
* Greeks calculations
* Payoff charts
* Analytics dashboards
* Market data loader

Do not mix responsibilities across modules.

---

# Step 4 – Protect Existing Code

When adding features:

* Do not break existing functionality
* Extend modules rather than rewriting them
* Maintain code readability

---

# Step 5 – Database Safety

Follow schema defined in PROJECT_SPEC.md.

Tables include:

* strategies
* trades
* positions
* exits
* portfolio
* default_iv

Do not modify schema without updating PROJECT_SPEC.md.

---

# Step 6 – Trade Logic

Trades must support:

* options
* futures
* multiple strategies
* multiple symbols per strategy
* partial exits

Open positions track remaining quantity.

Closed trades move to historical records.

---

# Step 7 – Greeks Engine

Used only for open positions.

Inputs:

Spot
Strike
Expiry
IV
Risk-free rate = 10%

Outputs:

Delta
Theta

---

# Step 8 – UI Layout

UI includes sidebar navigation.

Sections:

* Dashboard
* Trade Entry
* Open Positions
* Closed Positions
* Strategies
* Risk Dashboard
* Trade Analytics
* Drawdown
* Asset Exposure

Tables must support filtering.

---

# Step 9 – Performance

System must remain responsive with thousands of trades.

Avoid unnecessary database queries.

Cache market data where possible.

---

# Step 10 – Development Goal

The goal is a professional-grade personal trading analytics platform.

Maintain clarity, reliability, and modular architecture.
