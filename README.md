# UK Day-Ahead Wind Generation Forecast & Thermal Procurement Portal

A full-stack decision-support application built for UK electricity wholesale traders operating in the Day-Ahead Market. It reconciles actual half-hourly national wind generation (`FUELHH`) against historical point-in-time wind forecasts (`WINDFOR`) from the Elexon BMRS Insights API across **January 2026**, quantifying forecast error distributions (MAE, RMSE, MAPE, Bias, and P90/P95 shortfall risk) to recommend optimal thermal backup power procurement.

## Live Demo
- **Live Application:** [https://uk-wind-desk.vercel.app](https://uk-wind-desk.vercel.app)

## Core Trading & Engineering Logic
- **Zero Look-Ahead Bias (`D-1` Cutoff Rule):** For every half-hourly settlement period on delivery day `D`, the reconciliation engine strictly filters `WINDFOR` records where `publishTime <= D-1` at the selected gate-closure cutoff hour (default `11:00 UTC`), selecting the most recent valid publication prior to cutoff.
- **30-Minute Settlement Alignment:** Aligns forecast publications onto the 48 daily UK half-hourly settlement periods (1,488 intervals across January 2026).
- **Thermal Procurement Sizing:** Computes residual wind shortfalls (`Forecast - Actual`) and derives empirical P90 and P95 MW backup buffers to protect the desk against imbalance settlement exposure.

## Repository Structure
- `/backend` — Python 3.11 FastAPI service with chunked Elexon BMRS stream ingestion, local/serverless caching (`data_cache`), point-in-time `D-1` cutoff reconciliation, 30-minute settlement interpolation, and statistical risk calculation.
- `/frontend` — React 18 + Vite + Recharts + Tailwind CSS institutional dark-mode trading dashboard.
- `docker-compose.yml` — Multi-container orchestration for one-command local execution.
- `vercel.json` — Unified full-stack serverless deployment configuration.

## How to Run Locally (Docker - Recommended)

```bash
docker compose up --build
```

Once the containers boot:
- **Frontend Dashboard:** `http://localhost:5173`
- **Backend API & Health Check:** `http://localhost:8000/api/health`
