import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Wind,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ShieldAlert,
  Database,
  RefreshCw,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');
  const [cutoffHour, setCutoffHour] = useState(11);
  const [demandMw, setDemandMw] = useState(32000);
  const [hedgeLevel, setHedgeLevel] = useState('P95');
  const [interpolate30m, setInterpolate30m] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDay, setSelectedDay] = useState('2026-01-15');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        cutoff_hour: cutoffHour,
        interpolate_30m: interpolate30m,
        demand_mw: demandMw,
        hedge_level: hedgeLevel,
      });
      const res = await fetch(`${API_BASE}/api/analytics?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server responded with ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [startDate, endDate, cutoffHour, demandMw, hedgeLevel, interpolate30m]);

  // Filter time series for single-day deep-dive in the Procurement Calculator
  const singleDaySeries = useMemo(() => {
    if (!data?.timeseries) return [];
    return data.timeseries.filter((r) => r.startTime.startsWith(selectedDay));
  }, [data, selectedDay]);

  const singleDayStats = useMemo(() => {
    if (!singleDaySeries.length || !data?.kpis) return null;
    const meanWindForecast =
      singleDaySeries.reduce((a, b) => a + b.forecast_mw, 0) / singleDaySeries.length;
    const meanWindActual =
      singleDaySeries.reduce((a, b) => a + b.actual_mw, 0) / singleDaySeries.length;
    const maxShortfall = Math.max(...singleDaySeries.map((r) => r.shortfall_mw));
    const bufferMw = data.kpis.selected_buffer_mw;
    const hedgedWindMw = Math.max(0, meanWindForecast - bufferMw);
    const unhedgedThermalMw = Math.max(0, demandMw - meanWindForecast);
    const recommendedThermalMw = Math.max(0, demandMw - hedgedWindMw);
    const dailyThermalMwh = recommendedThermalMw * 24;

    return {
      meanWindForecast: Math.round(meanWindForecast),
      meanWindActual: Math.round(meanWindActual),
      maxShortfall: Math.round(maxShortfall),
      bufferMw: Math.round(bufferMw),
      hedgedWindMw: Math.round(hedgedWindMw),
      unhedgedThermalMw: Math.round(unhedgedThermalMw),
      recommendedThermalMw: Math.round(recommendedThermalMw),
      dailyThermalMwh: Math.round(dailyThermalMwh),
    };
  }, [singleDaySeries, data, demandMw]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Institutional Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Wind className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                GridPulse UK
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Elexon BMRS • Jan 2026
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Day-Ahead Wholesale Wind Forecast Accuracy & Thermal Procurement Desk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {['overview', 'procurement', 'accuracy', 'audit'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === tab
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab === 'overview' && '1. Forecast vs Actuals'}
                {tab === 'procurement' && '2. Day-Ahead Thermal Desk'}
                {tab === 'accuracy' && '3. Error Quant & Risk'}
                {tab === 'audit' && '4. D-1 Cutoff Audit'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Interactive Trading Control Bar */}
      <section className="bg-slate-900/50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              Start Date (Jan 2026)
            </label>
            <input
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              End Date (Jan 2026)
            </label>
            <input
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1 flex justify-between">
              <span>D-1 Gate Cutoff (UTC)</span>
              <span className="text-emerald-400 font-bold">{String(cutoffHour).padStart(2, '0')}:00</span>
            </label>
            <input
              type="range"
              min="6"
              max="23"
              value={cutoffHour}
              onChange={(e) => setCutoffHour(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              Utility Demand (MW)
            </label>
            <input
              type="number"
              step="500"
              min="10000"
              max="55000"
              value={demandMw}
              onChange={(e) => setDemandMw(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              Shortfall Hedge Confidence
            </label>
            <select
              value={hedgeLevel}
              onChange={(e) => setHedgeLevel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            >
              <option value="P50">P50 (Median Buffer)</option>
              <option value="P90">P90 (90% Confidence)</option>
              <option value="P95">P95 (95% Institutional Hedge)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={interpolate30m}
                onChange={(e) => setInterpolate30m(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              <span>30m Settlement Sync</span>
            </label>
            <button
              onClick={fetchAnalytics}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {error && (
          <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-700 text-rose-200 flex items-center gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <strong>API Error:</strong> {error}
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="p-12 text-center bg-slate-900/50 rounded-xl border border-slate-800 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
            <p className="text-sm font-medium text-slate-200">
              Ingesting & Reconciling January 2026 Elexon BMRS Streams (FUELHH & WINDFOR)...
            </p>
            <p className="text-xs text-slate-400">
              First cold load fetches 31 days of half-hourly settlement records from Elexon (~15 seconds) and caches locally.
            </p>
          </div>
        ) : (
          data && (
            <>
              {/* Executive KPI Ribbon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase tracking-wider text-slate-400">
                      Mean Wind (Forecast vs Actual)
                    </span>
                    <Wind className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">
                      {data.kpis.mean_forecast_mw.toLocaleString()} MW
                    </span>
                    <span className="text-xs text-slate-400">
                      vs {data.kpis.mean_actual_mw.toLocaleString()} MW actual
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Mean Bias:{' '}
                    <span className={data.kpis.bias_mw > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                      {data.kpis.bias_mw > 0 ? '+' : ''}
                      {data.kpis.bias_mw} MW
                    </span>{' '}
                    ({data.kpis.total_intervals} intervals)
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase tracking-wider text-slate-400">
                      Forecast Error (MAE & MAPE)
                    </span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">
                      {data.kpis.mae_mw.toLocaleString()} MW
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      {data.kpis.mape_pct}% MAPE
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Evaluated at D-1 {String(cutoffHour).padStart(2, '0')}:00 UTC gate cutoff
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase tracking-wider text-slate-400">
                      Root Mean Square Error (RMSE)
                    </span>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">
                      {data.kpis.rmse_mw.toLocaleString()} MW
                    </span>
                    <span className="text-xs text-amber-300">
                      {data.kpis.overforecast_rate_pct}% Over-forecast rate
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Max single-period shortfall: {data.kpis.max_shortfall_mw.toLocaleString()} MW
                  </p>
                </div>

                <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase tracking-wider text-rose-300">
                      {hedgeLevel} Thermal Reserve Buffer
                    </span>
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-rose-400">
                      +{data.kpis.selected_buffer_mw.toLocaleString()} MW
                    </span>
                    <span className="text-xs text-slate-400">extra thermal hedge</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Avg Thermal Buy: {data.kpis.mean_recommended_thermal_mw.toLocaleString()} MW
                  </p>
                </div>
              </div>

              {/* TAB 1: OVERVIEW & TIME SERIES */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h2 className="text-base font-semibold text-white">
                          January 2026 Half-Hourly Wind Generation: Day-Ahead Forecast vs. Actual Outturn
                        </h2>
                        <p className="text-xs text-slate-400">
                          Comparing Elexon FUELHH (Actuals) against latest WINDFOR published on or before Day D-1 at{' '}
                          {String(cutoffHour).padStart(2, '0')}:00 UTC. Rose shading shows wind shortfall risk.
                        </p>
                      </div>
                    </div>

                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.timeseries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="startTime"
                            tickFormatter={(v) => v.slice(5, 16).replace('T', ' ')}
                            stroke="#64748b"
                            fontSize={11}
                            minTickGap={45}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={11}
                            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="shortfall_mw"
                            name="Wind Shortfall Risk (Forecast > Actual MW)"
                            fill="#f43f5e"
                            fillOpacity={0.22}
                            stroke="#f43f5e"
                          />
                          <Line
                            type="monotone"
                            dataKey="forecast_mw"
                            name="Day-Ahead Forecast (WINDFOR MW)"
                            stroke="#38bdf8"
                            strokeWidth={1.8}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual_mw"
                            name="Actual Generation (FUELHH MW)"
                            stroke="#10b981"
                            strokeWidth={1.8}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Daily MAE & Max Shortfall Bar Chart */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Daily Forecast Error (MAE) vs. Maximum Daily Wind Shortfall (MW)
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Click any day in the Day-Ahead Thermal Desk tab to inspect half-hourly procurement orders.
                    </p>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.daily_summary}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                          <YAxis stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          <Bar dataKey="mae_mw" name="Daily MAE (MW)" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                          <Bar
                            dataKey="max_shortfall_mw"
                            name="Max Daily Shortfall (MW)"
                            fill="#f43f5e"
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DAY-AHEAD THERMAL PROCUREMENT DESK */}
              {activeTab === 'procurement' && (
                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-base font-semibold text-white flex items-center gap-2">
                          <Flame className="w-5 h-5 text-amber-400" />
                          Day-Ahead Thermal & Non-Wind Procurement Decision Calculator
                        </h2>
                        <p className="text-xs text-slate-400">
                          Calculates exact thermal power to purchase on Day D-1 at {String(cutoffHour).padStart(2, '0')}
                          :00 UTC after applying the {hedgeLevel} wind forecast error buffer (+
                          {data.kpis.selected_buffer_mw.toLocaleString()} MW).
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300 font-medium">Delivery Day (D):</span>
                        <input
                          type="date"
                          min="2026-01-01"
                          max="2026-01-31"
                          value={selectedDay}
                          onChange={(e) => setSelectedDay(e.target.value)}
                          className="bg-slate-800 border border-emerald-500/50 rounded px-3 py-1.5 text-xs text-white font-semibold"
                        />
                      </div>
                    </div>

                    {singleDayStats && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-xs text-slate-400">1. Consumer Demand Target</span>
                          <div className="text-xl font-bold text-white mt-1">
                            {demandMw.toLocaleString()} MW
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {(demandMw * 24).toLocaleString()} MWh daily volume
                          </span>
                        </div>

                        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-xs text-slate-400">2. Raw D-1 Wind Forecast</span>
                          <div className="text-xl font-bold text-sky-400 mt-1">
                            {singleDayStats.meanWindForecast.toLocaleString()} MW
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Actual outturn: {singleDayStats.meanWindActual.toLocaleString()} MW
                          </span>
                        </div>

                        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-xs text-slate-400">
                            3. Risk-Adjusted Wind ({hedgeLevel} Haircut)
                          </span>
                          <div className="text-xl font-bold text-emerald-400 mt-1">
                            {singleDayStats.hedgedWindMw.toLocaleString()} MW
                          </div>
                          <span className="text-[11px] text-rose-400">
                            -{singleDayStats.bufferMw.toLocaleString()} MW error safety margin
                          </span>
                        </div>

                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/40">
                          <span className="text-xs text-amber-300 font-semibold">
                            4. Recommended Thermal Purchase
                          </span>
                          <div className="text-2xl font-bold text-amber-400 mt-1">
                            {singleDayStats.recommendedThermalMw.toLocaleString()} MW
                          </div>
                          <span className="text-[11px] text-amber-200/80">
                            Total Order: {singleDayStats.dailyThermalMwh.toLocaleString()} MWh (vs{' '}
                            {singleDayStats.unhedgedThermalMw.toLocaleString()} MW unhedged)
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={singleDaySeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="startTime"
                            tickFormatter={(v) => v.slice(11, 16)}
                            stroke="#64748b"
                            fontSize={11}
                          />
                          <YAxis stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="recommended_thermal_mw"
                            name={`Recommended Thermal Purchase (${hedgeLevel} Hedged MW)`}
                            fill="#f59e0b"
                            fillOpacity={0.2}
                            stroke="#f59e0b"
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="forecast_mw"
                            name="Raw D-1 Wind Forecast (MW)"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="hedged_wind_mw"
                            name={`Safe Wind Credit (Forecast - ${hedgeLevel} MW)`}
                            stroke="#10b981"
                            strokeDasharray="5 5"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: QUANTITATIVE ACCURACY & ERROR DISTRIBUTION */}
              {activeTab === 'accuracy' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Forecast Error Distribution (Forecast − Actual MW)
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Positive values (rose) indicate Over-Forecasting where actual wind under-delivered, creating a grid
                      deficit that must be covered by thermal backup.
                    </p>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.error_distribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="bin_mid" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
                          <Bar dataKey="count" name="Settlement Periods">
                            {data.error_distribution.map((entry, idx) => (
                              <Cell key={idx} fill={entry.bin_mid > 0 ? '#f43f5e' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Diurnal Error Profile by Hour of Day (UTC)
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Identifies which settlement hours exhibit the highest MAE and P95 shortfall risk for evening peak
                      hedging.
                    </p>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.hourly_profile}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="hour"
                            tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                            stroke="#64748b"
                            fontSize={11}
                          />
                          <YAxis stroke="#64748b" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          <Bar dataKey="mae_mw" name="Hourly Mean Absolute Error (MW)" fill="#38bdf8" />
                          <Line
                            type="monotone"
                            dataKey="p95_shortfall_mw"
                            name="P95 Shortfall Buffer (MW)"
                            stroke="#f43f5e"
                            strokeWidth={2}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: POINT-IN-TIME D-1 AUDIT TABLE */}
              {activeTab === 'audit' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        Point-in-Time Reconciliation Audit Log (Zero Look-Ahead Bias Verification)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Verifies that every matched WINDFOR record has a <code>publishTime</code> strictly on or before
                        the Day D-1 {String(cutoffHour).padStart(2, '0')}:00 UTC gate deadline.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-96 border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Target StartTime (D)</th>
                          <th className="py-2.5 px-3">D-1 Gate Cutoff</th>
                          <th className="py-2.5 px-3">Forecast PublishTime</th>
                          <th className="py-2.5 px-3 text-right">Forecast (MW)</th>
                          <th className="py-2.5 px-3 text-right">Actual (MW)</th>
                          <th className="py-2.5 px-3 text-right">Error (MW)</th>
                          <th className="py-2.5 px-3 text-right">Rec. Thermal (MW)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {data.timeseries.slice(0, 200).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-800/50">
                            <td className="py-2 px-3 font-mono text-white">{row.startTime}</td>
                            <td className="py-2 px-3 font-mono text-slate-400">{row.cutoffDeadline}</td>
                            <td className="py-2 px-3 font-mono text-emerald-400">{row.publishTime}</td>
                            <td className="py-2 px-3 text-right font-mono">{row.forecast_mw.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{row.actual_mw.toLocaleString()}</td>
                            <td
                              className={`py-2 px-3 text-right font-mono font-semibold ${
                                row.error_mw > 0 ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              {row.error_mw > 0 ? '+' : ''}
                              {row.error_mw.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-amber-300">
                              {row.recommended_thermal_mw.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}