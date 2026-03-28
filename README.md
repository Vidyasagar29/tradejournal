# Trade Journal

A web-based options and futures trading journal with analytics dashboards.

Features include:

* trade tracking
* strategy analytics
* portfolio risk monitoring
* Greeks calculations
* payoff diagrams

Technology:

* HTML
* CSS
* JavaScript
* Supabase
* Chart.js
* Google Sheets

Development is guided by Codex Agent instructions.

## Automation

The repository includes a GitHub Actions workflow at `.github/workflows/daily-portfolio-snapshot.yml`.

It runs on weekday schedule and can also be triggered manually to save an end-of-day open-position MTM snapshot into Supabase.
