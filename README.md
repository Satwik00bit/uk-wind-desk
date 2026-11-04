# UK Day-Ahead Wind Generation Forecast & Thermal Procurement Portal

A full-stack decision-support application built for UK electricity wholesale traders operating in the Day-Ahead Market. It reconciles actual half-hourly national wind generation (`FUELHH`) against historical point-in-time wind forecasts (`WINDFOR`) from the Elexon BMRS Insights API across **January 2026**, quantifying forecast error distributions (MAE, RMSE, MAPE, Bias, and P90/P95 shortfall risk) to recommend optimal thermal backup power procurement.

## Live Demo
- **Link: https://uk-wind-desk.vercel.app

## Repository Structure
- `/backend` — Python 3.11 FastAPI service with chunked Elexon BMRS stream ingestion, local disk caching (`/data_cache`), point-in-time Day-Ahead (`D-1`) cutoff reconciliation, 30-minute settlement interpolation, and statistical risk calculation.
- `/frontend` — React 18 + Vite + Recharts + Tailwind CSS institutional dark-mode trading dashboard.
- `docker-compose.yml` — Multi-container orchestration for one-command local execution.

## How to Run Locally (Docker - Recommended)
```bash
docker compose up --build
