import os
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="UK Day-Ahead Wind Forecast & Procurement Analytics API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "data_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

FUELHH_CACHE = os.path.join(CACHE_DIR, "fuelhh_wind_jan2026.json")
WINDFOR_CACHE = os.path.join(CACHE_DIR, "windfor_jan2026.json")

ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# In-memory DataFrames once loaded
_df_actuals: Optional[pd.DataFrame] = None
_df_forecasts: Optional[pd.DataFrame] = None


def fetch_elexon_chunks(endpoint: str, start_dt: datetime, end_dt: datetime, chunk_days: int = 7) -> list:
    """Fetches Elexon stream data in 7-day chunks using publishDateTimeFrom/To."""
    records = []
    curr = start_dt
    headers = {"Accept": "application/json", "User-Agent": "UKGridAnalytics/1.0"}

    with httpx.Client(timeout=45.0, headers=headers, follow_redirects=True) as client:
        while curr < end_dt:
            nxt = min(curr + timedelta(days=chunk_days), end_dt)
            params = {
                "publishDateTimeFrom": curr.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": nxt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            url = f"{ELEXON_BASE}/{endpoint}/stream"
            resp = client.get(url, params=params)
            if resp.status_code != 200:
                raise RuntimeError(f"Elexon API error {resp.status_code} on {url}: {resp.text[:300]}")
            payload = resp.json()
            if isinstance(payload, dict) and "data" in payload:
                payload = payload["data"]
            if isinstance(payload, list):
                records.extend(payload)
            curr = nxt
    return records


def load_or_fetch_datasets() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Loads cached Elexon January 2026 datasets or fetches them from live BMRS API."""
    global _df_actuals, _df_forecasts
    if _df_actuals is not None and _df_forecasts is not None:
        return _df_actuals, _df_forecasts

    # 1. Load or fetch FUELHH (Actuals)
    # Fetch publish window from Dec 31, 2025 to Feb 2, 2026 to capture all Jan 2026 startTimes
    if os.path.exists(FUELHH_CACHE):
        with open(FUELHH_CACHE, "r", encoding="utf-8") as f:
            wind_actual_rows = json.load(f)
    else:
        raw_fuelhh = fetch_elexon_chunks(
            "FUELHH",
            datetime(2025, 12, 31, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 2, 2, 0, 0, tzinfo=timezone.utc),
            chunk_days=7,
        )
        wind_actual_rows = [
            {
                "startTime": r["startTime"],
                "publishTime": r.get("publishTime", r["startTime"]),
                "generation": float(r["generation"]),
            }
            for r in raw_fuelhh
            if r.get("fuelType") == "WIND" and r.get("startTime") and r.get("generation") is not None
        ]
        with open(FUELHH_CACHE, "w", encoding="utf-8") as f:
            json.dump(wind_actual_rows, f)

    df_act = pd.DataFrame(wind_actual_rows)
    if df_act.empty:
        raise HTTPException(status_code=500, detail="No WIND records found in FUELHH dataset.")
    df_act["startTime"] = pd.to_datetime(df_act["startTime"], utc=True)
    df_act["publishTime"] = pd.to_datetime(df_act["publishTime"], utc=True)
    # Filter strictly to January 2026 delivery periods
    jan_start = pd.Timestamp("2026-01-01T00:00:00Z")
    jan_end = pd.Timestamp("2026-01-31T23:30:00Z")
    df_act = df_act[(df_act["startTime"] >= jan_start) & (df_act["startTime"] <= jan_end)]
    df_act = df_act.sort_values("publishTime").drop_duplicates(subset=["startTime"], keep="last")
    df_act = df_act.sort_values("startTime").reset_index(drop=True)
    df_act = df_act.rename(columns={"generation": "actual_mw", "publishTime": "actual_publishTime"})

    # 2. Load or fetch WINDFOR (Forecasts)
    # Forecasts for Jan 1, 2026 are published in late Dec 2025, so start Dec 27, 2025
    if os.path.exists(WINDFOR_CACHE):
        with open(WINDFOR_CACHE, "r", encoding="utf-8") as f:
            wind_for_rows = json.load(f)
    else:
        raw_windfor = fetch_elexon_chunks(
            "WINDFOR",
            datetime(2025, 12, 27, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc),
            chunk_days=7,
        )
        wind_for_rows = [
            {
                "startTime": r["startTime"],
                "publishTime": r["publishTime"],
                "generation": float(r["generation"]),
            }
            for r in raw_windfor
            if r.get("startTime") and r.get("publishTime") and r.get("generation") is not None
        ]
        with open(WINDFOR_CACHE, "w", encoding="utf-8") as f:
            json.dump(wind_for_rows, f)

    df_for = pd.DataFrame(wind_for_rows)
    if df_for.empty:
        raise HTTPException(status_code=500, detail="No records found in WINDFOR dataset.")
    df_for["startTime"] = pd.to_datetime(df_for["startTime"], utc=True)
    df_for["publishTime"] = pd.to_datetime(df_for["publishTime"], utc=True)
    df_for = df_for[(df_for["startTime"] >= jan_start) & (df_for["startTime"] <= pd.Timestamp("2026-02-01T00:00:00Z"))]
    df_for = df_for.sort_values(["startTime", "publishTime"]).reset_index(drop=True)
    df_for = df_for.rename(columns={"generation": "forecast_mw"})

    _df_actuals = df_act
    _df_forecasts = df_for
    return _df_actuals, _df_forecasts


def reconcile_day_ahead(
    df_act: pd.DataFrame,
    df_for: pd.DataFrame,
    cutoff_hour: int = 11,
    interpolate_30m: bool = True,
) -> pd.DataFrame:
    """
    For each delivery Day D in January 2026, only considers forecasts published on or before
    Day (D - 1) at {cutoff_hour}:00:00 UTC (UK Day-Ahead auction gate closure).
    """
    f = df_for.copy()
    # Delivery date (UTC midnight of startTime)
    delivery_midnight = f["startTime"].dt.floor("D")
    # Gate closure deadline on D-1 at cutoff_hour:00 UTC
    f["cutoff_deadline"] = delivery_midnight - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour)

    # Strictly filter out any forecast published after the Day-Ahead decision deadline (prevents look-ahead bias)
    eligible = f[f["publishTime"] <= f["cutoff_deadline"]].copy()

    # For each target startTime, take the single most recent forecast available before the deadline
    latest_for = (
        eligible.sort_values("publishTime")
        .groupby("startTime", as_index=False)
        .last()[["startTime", "publishTime", "forecast_mw", "cutoff_deadline"]]
    )

    merged = pd.merge(df_act[["startTime", "actual_mw"]], latest_for, on="startTime", how="left")

    # Because WINDFOR is frequently published on hourly boundaries (:00) while FUELHH is half-hourly (:00, :30),
    # optionally interpolate the :30 settlement periods from surrounding valid D-1 forecasts.
    if interpolate_30m:
        merged["forecast_mw"] = merged["forecast_mw"].interpolate(method="linear", limit=1)
        merged["publishTime"] = merged["publishTime"].ffill(limit=1)
        merged["cutoff_deadline"] = merged["cutoff_deadline"].ffill(limit=1)

    merged = merged.dropna(subset=["actual_mw", "forecast_mw"]).reset_index(drop=True)
    # Error = Forecast - Actual
    # Positive Error => Over-forecasted wind (Actual < Forecast) => Shortfall requiring emergency thermal power
    merged["error_mw"] = merged["forecast_mw"] - merged["actual_mw"]
    merged["abs_error_mw"] = merged["error_mw"].abs()
    merged["pct_error"] = (merged["abs_error_mw"] / merged["actual_mw"].clip(lower=1.0)) * 100.0
    merged["shortfall_mw"] = merged["error_mw"].clip(lower=0.0)
    return merged


@app.get("/api/health")
def health_check():
    df_act, df_for = load_or_fetch_datasets()
    return {
        "status": "ok",
        "dataset_scope": "January 2026 (Elexon BMRS FUELHH & WINDFOR)",
        "actual_wind_half_hourly_records": int(len(df_act)),
        "forecast_wind_raw_records": int(len(df_for)),
        "actual_start_min": df_act["startTime"].min().isoformat(),
        "actual_start_max": df_act["startTime"].max().isoformat(),
    }


@app.get("/api/analytics")
def get_analytics(
    start_date: str = Query("2026-01-01", description="Start date YYYY-MM-DD in Jan 2026"),
    end_date: str = Query("2026-01-31", description="End date YYYY-MM-DD in Jan 2026"),
    cutoff_hour: int = Query(11, ge=0, le=23, description="Day-Ahead D-1 decision gate closure hour (UTC)"),
    interpolate_30m: bool = Query(True, description="Interpolate hourly WINDFOR to 30m settlement periods"),
    demand_mw: float = Query(32000.0, ge=5000.0, le=60000.0, description="Target consumer demand (MW)"),
    hedge_level: str = Query("P95", pattern="^(P50|P90|P95)$", description="Shortfall confidence hedge level"),
):
    df_act, df_for = load_or_fetch_datasets()
    reconciled = reconcile_day_ahead(df_act, df_for, cutoff_hour=cutoff_hour, interpolate_30m=interpolate_30m)

    start_ts = pd.Timestamp(f"{start_date}T00:00:00Z")
    end_ts = pd.Timestamp(f"{end_date}T23:59:59Z")
    sub = reconciled[(reconciled["startTime"] >= start_ts) & (reconciled["startTime"] <= end_ts)].copy()

    if sub.empty:
        raise HTTPException(status_code=400, detail="No matching data for selected January 2026 date range.")

    # Core Quantitative Accuracy Metrics
    mae_mw = float(sub["abs_error_mw"].mean())
    rmse_mw = float(np.sqrt((sub["error_mw"] ** 2).mean()))
    mape_pct = float(sub["pct_error"].mean())
    bias_mw = float(sub["error_mw"].mean())
    mean_actual_mw = float(sub["actual_mw"].mean())
    mean_forecast_mw = float(sub["forecast_mw"].mean())

    # Quantified Shortfall Percentiles (when Forecast > Actual, i.e., error_mw > 0)
    # Using positive shortfall distribution across all periods so traders know exact MW reserve needed
    p50_shortfall = float(np.percentile(sub["shortfall_mw"], 50))
    p90_shortfall = float(np.percentile(sub["shortfall_mw"], 90))
    p95_shortfall = float(np.percentile(sub["shortfall_mw"], 95))
    max_shortfall = float(sub["shortfall_mw"].max())

    overforecast_rate_pct = float((sub["error_mw"] > 0).mean() * 100.0)

    hedge_map = {"P50": p50_shortfall, "P90": p90_shortfall, "P95": p95_shortfall}
    selected_buffer_mw = hedge_map[hedge_level]

    # Calculate per-interval recommended thermal procurement
    sub["hedged_wind_mw"] = (sub["forecast_mw"] - selected_buffer_mw).clip(lower=0.0)
    sub["baseline_thermal_mw"] = (demand_mw - sub["forecast_mw"]).clip(lower=0.0)
    sub["recommended_thermal_mw"] = (demand_mw - sub["hedged_wind_mw"]).clip(lower=0.0)

    # 1. Daily Summary Aggregation
    sub["date"] = sub["startTime"].dt.strftime("%Y-%m-%d")
    daily_df = (
        sub.groupby("date", as_index=False)
        .agg(
            actual_mean_mw=("actual_mw", "mean"),
            forecast_mean_mw=("forecast_mw", "mean"),
            mae_mw=("abs_error_mw", "mean"),
            rmse_mw=("error_mw", lambda s: float(np.sqrt((s ** 2).mean()))),
            max_shortfall_mw=("shortfall_mw", "max"),
            recommended_thermal_mw=("recommended_thermal_mw", "mean"),
        )
        .round(1)
    )

    # 2. Hour-of-Day Error Profile (00:00 to 23:00 UTC)
    sub["hour"] = sub["startTime"].dt.hour
    hourly_df = (
        sub.groupby("hour", as_index=False)
        .agg(
            mae_mw=("abs_error_mw", "mean"),
            bias_mw=("error_mw", "mean"),
            p95_shortfall_mw=("shortfall_mw", lambda s: float(np.percentile(s, 95))),
        )
        .round(1)
    )

    # 3. Error Histogram Bins (Forecast - Actual in MW)
    counts, bin_edges = np.histogram(sub["error_mw"], bins=16)
    error_distribution = []
    for i in range(len(counts)):
        low = float(bin_edges[i])
        high = float(bin_edges[i + 1])
        mid = (low + high) / 2.0
        error_distribution.append(
            {
                "bin_label": f"{int(low)} to {int(high)} MW",
                "bin_mid": round(mid, 0),
                "count": int(counts[i]),
                "zone": "Shortfall (Over-Forecast)" if mid > 0 else "Surplus (Under-Forecast)",
            }
        )

    # 4. Time-series records
    timeseries = []
    for _, row in sub.iterrows():
        timeseries.append(
            {
                "startTime": row["startTime"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishTime": row["publishTime"].strftime("%Y-%m-%dT%H:%M:%SZ") if pd.notnull(row["publishTime"]) else None,
                "cutoffDeadline": row["cutoff_deadline"].strftime("%Y-%m-%dT%H:%M:%SZ") if pd.notnull(row["cutoff_deadline"]) else None,
                "actual_mw": round(float(row["actual_mw"]), 1),
                "forecast_mw": round(float(row["forecast_mw"]), 1),
                "error_mw": round(float(row["error_mw"]), 1),
                "abs_error_mw": round(float(row["abs_error_mw"]), 1),
                "pct_error": round(float(row["pct_error"]), 2),
                "shortfall_mw": round(float(row["shortfall_mw"]), 1),
                "hedged_wind_mw": round(float(row["hedged_wind_mw"]), 1),
                "recommended_thermal_mw": round(float(row["recommended_thermal_mw"]), 1),
            }
        )

    return {
        "parameters": {
            "start_date": start_date,
            "end_date": end_date,
            "cutoff_hour": cutoff_hour,
            "interpolate_30m": interpolate_30m,
            "demand_mw": demand_mw,
            "hedge_level": hedge_level,
        },
        "kpis": {
            "total_intervals": int(len(sub)),
            "mean_actual_mw": round(mean_actual_mw, 1),
            "mean_forecast_mw": round(mean_forecast_mw, 1),
            "mae_mw": round(mae_mw, 1),
            "rmse_mw": round(rmse_mw, 1),
            "mape_pct": round(mape_pct, 2),
            "bias_mw": round(bias_mw, 1),
            "overforecast_rate_pct": round(overforecast_rate_pct, 1),
            "p50_shortfall_mw": round(p50_shortfall, 1),
            "p90_shortfall_mw": round(p90_shortfall, 1),
            "p95_shortfall_mw": round(p95_shortfall, 1),
            "max_shortfall_mw": round(max_shortfall, 1),
            "selected_buffer_mw": round(selected_buffer_mw, 1),
            "mean_baseline_thermal_mw": round(float(sub["baseline_thermal_mw"].mean()), 1),
            "mean_recommended_thermal_mw": round(float(sub["recommended_thermal_mw"].mean()), 1),
        },
        "daily_summary": daily_df.to_dict(orient="records"),
        "hourly_profile": hourly_df.to_dict(orient="records"),
        "error_distribution": error_distribution,
        "timeseries": timeseries,
    }