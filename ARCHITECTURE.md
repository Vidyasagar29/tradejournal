# System Architecture

Frontend

HTML
CSS
JavaScript

Hosting

GitHub Pages

Database

Supabase PostgreSQL

Market Data

Google Sheets

---

# Data Flow

Google Sheets
↓
Market Data Loader
↓
Greeks Engine
↓
Risk Dashboard

Supabase
↓
Trade Data
↓
Portfolio Analytics

---

# Application Structure

UI Layer
Handles layout and interaction.

Data Layer
Handles Supabase communication.

Analytics Layer
Calculates metrics and Greeks.

Chart Layer
Renders dashboards using Chart.js.
