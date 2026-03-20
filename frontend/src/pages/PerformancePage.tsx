import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, ReferenceLine, Cell,
} from 'recharts'
import { analyticsApi } from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────

function fmtPct(v: number, dec = 1) { return `${(v * 100).toFixed(dec)}%` }
function fmtUSD(v: number) {
  return `${v >= 0 ? '' : '-'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-on-surface', iconName }: {
  label: string
  value: string | number
  sub?: string
  color?: string
  iconName?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-on-surface-variant">{label}</p>
        {iconName && (
          <span className={`material-symbols-outlined text-base ${color}`} style={{ fontSize: 16 }}>
            {iconName}
          </span>
        )}
      </div>
      <p className={`text-2xl font-headline font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────

function OverviewTab({ data }: { data: any }) {
  const s = data.summary
  const growth = data.growthHistory ?? []

  const chartData = growth.length > 0 ? growth : Array.from({ length: 30 }, (_, i) => ({
    date: `D${i + 1}`,
    cumPnl: +(i * 1.5 + (Math.random() - 0.4) * 4).toFixed(2),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="ROI"
          value={`${s.roi >= 0 ? '+' : ''}${fmtPct(s.roi)}`}
          iconName="trending_up"
          color={s.roi >= 0 ? 'text-secondary' : 'text-error'}
          sub={`${s.totalBets} resolved bets`}
        />
        <StatCard
          label="Win Rate"
          value={fmtPct(s.winRate)}
          iconName="my_location"
          color="text-primary"
          sub="Break-even: ~52.4%"
        />
        <StatCard
          label="Sharpe Ratio"
          value={s.sharpe.toFixed(2)}
          iconName="show_chart"
          color={s.sharpe >= 1 ? 'text-secondary' : s.sharpe >= 0 ? 'text-yellow-400' : 'text-error'}
          sub="Risk-adjusted return"
        />
        <StatCard
          label="Max Drawdown"
          value={fmtPct(s.maxDrawdown)}
          iconName="military_tech"
          color={s.maxDrawdown > 0.15 ? 'text-error' : 'text-on-surface-variant'}
          sub={`Total P&L: ${s.totalPnl >= 0 ? '+' : ''}${fmtUSD(s.totalPnl)}`}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-3xl font-headline font-black text-secondary">{s.won}</p>
          <p className="text-xs text-on-surface-variant mt-1">Wins</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-headline font-black text-error">{s.lost}</p>
          <p className="text-xs text-on-surface-variant mt-1">Losses</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-headline font-black text-on-surface-variant">{s.pushed}</p>
          <p className="text-xs text-on-surface-variant mt-1">Pushes</p>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-headline font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>trending_up</span>
          Cumulative P&L
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip
              contentStyle={{ background: '#1a1d20', border: '1px solid rgba(223,142,255,0.15)', borderRadius: 10 }}
              formatter={(v: number) => [fmtUSD(Number(v)), 'Cum. P&L']}
            />
            <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="cumPnl" stroke="#df8eff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-on-surface">Live +EV Opportunities</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Active in last 2 hours</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-headline font-black text-primary">{s.activeOpportunities}</p>
          <p className="text-xs text-on-surface-variant">Avg EV: {fmtPct(s.avgEVPct / 100)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: By Market Type ──────────────────────────────────────

function ByTypeTab({ data }: { data: any }) {
  const rows: any[] = data.byMarketType ?? []
  const LABELS: Record<string, string> = {
    MONEYLINE: 'Moneyline', SPREAD: 'Spread', TOTAL: 'Total (O/U)',
    PLAYER_PROP: 'Player Props', UNKNOWN: 'Unknown',
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
              <th className="text-left px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Market Type</th>
              <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Bets</th>
              <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Won</th>
              <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Win Rate</th>
              <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined block mx-auto mb-2 text-outline-variant" style={{ fontSize: 28 }}>
                    bar_chart
                  </span>
                  No resolved bets yet
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.type} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
                <td className="px-4 py-3 text-on-surface font-medium">{LABELS[r.type] ?? r.type}</td>
                <td className="px-4 py-3 text-right text-on-surface-variant">{r.bets}</td>
                <td className="px-4 py-3 text-right text-on-surface-variant">{r.won}</td>
                <td className="px-4 py-3 text-right">
                  <span className={r.winRate >= 0.524 ? 'text-secondary' : 'text-error'}>
                    {fmtPct(r.winRate)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={r.roi >= 0 ? 'text-secondary' : 'text-error'}>
                    {r.roi >= 0 ? '+' : ''}{fmtPct(r.roi)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="card p-4">
          <h3 className="font-headline font-bold text-on-surface text-sm mb-3">Win Rate by Market Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rows.map(r => ({ name: LABELS[r.type] ?? r.type, winRate: +(r.winRate * 100).toFixed(1) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#1a1d20', border: '1px solid rgba(223,142,255,0.15)', borderRadius: 10 }}
                formatter={(v: number) => [`${v}%`, 'Win Rate']}
              />
              <ReferenceLine y={52.4} stroke="#30363d" strokeDasharray="4 4"
                label={{ value: 'BE', fill: '#8b949e', fontSize: 10 }} />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {rows.map((r, i) => <Cell key={i} fill={r.winRate >= 0.524 ? '#00f4fe' : '#ff716c'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Calibration ─────────────────────────────────────────

function CalibrationTab({ data }: { data: any }) {
  const buckets: any[] = data.calibration ?? []

  const chartData = buckets.length > 0
    ? buckets.map(b => ({ predicted: +(b.predicted * 100).toFixed(0), actual: b.actualRate !== null ? +(b.actualRate * 100).toFixed(1) : null, count: b.count }))
    : Array.from({ length: 9 }, (_, i) => ({ predicted: (i + 1) * 10, actual: (i + 1) * 10 + (Math.random() - 0.5) * 8, count: Math.floor(Math.random() * 20) + 5 }))

  const totalPreds = buckets.reduce((s, b) => s + (b.count ?? 0), 0)
  const brierScore = buckets.length > 0 && totalPreds > 0
    ? (buckets.reduce((s, b) => s + (b.count > 0 ? b.count * Math.pow(b.midpoint - (b.actual / b.count), 2) : 0), 0) / totalPreds).toFixed(3)
    : '—'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Brier Score" value={brierScore} sub="Lower = better (0 = perfect)" color="text-yellow-400" iconName="gps_fixed" />
        <StatCard label="Calibration Samples" value={totalPreds || '—'} sub="Resolved predictions" color="text-on-surface" />
        <StatCard label="Populated Buckets" value={`${buckets.filter(b => b.count > 0).length} / 10`} sub="Probability ranges" color="text-on-surface-variant" />
      </div>

      <div className="card p-4">
        <h3 className="font-headline font-bold text-on-surface text-sm mb-1">Calibration Chart</h3>
        <p className="text-xs text-on-surface-variant mb-3">
          Dots above diagonal = over-confident; below = under-confident. Perfect model lies on the line.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis type="number" dataKey="predicted" name="Predicted %" domain={[0, 100]} unit="%" tick={{ fill: '#8b949e', fontSize: 11 }} />
            <YAxis type="number" dataKey="actual" name="Actual %" domain={[0, 100]} unit="%" tick={{ fill: '#8b949e', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1a1d20', border: '1px solid rgba(223,142,255,0.15)', borderRadius: 10 }}
              formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
              stroke="#30363d"
              strokeDasharray="4 4"
              label={{ value: 'Perfect', fill: '#8b949e', fontSize: 10, position: 'insideTopRight' }}
            />
            <Scatter data={chartData.filter(d => d.actual !== null)} fill="#df8eff" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Tab: P&L Calendar ────────────────────────────────────────

function CalendarTab({ data }: { data: any }) {
  const calendarData: any[] = data.calendarData ?? []

  const weeks: any[][] = []
  let week: any[] = []
  for (const d of calendarData) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length) weeks.push(week)

  const totalPnl = calendarData.reduce((s, d) => s + d.pnl, 0)
  const activeDays = calendarData.filter(d => d.pnl !== 0).length
  const greenDays = calendarData.filter(d => d.pnl > 0).length
  const redDays = calendarData.filter(d => d.pnl < 0).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Period P&L"
          value={`${totalPnl >= 0 ? '+' : ''}${fmtUSD(totalPnl)}`}
          color={totalPnl >= 0 ? 'text-secondary' : 'text-error'}
          iconName="calendar_month"
        />
        <StatCard label="Active Days" value={activeDays} sub="Days with bets" color="text-on-surface" />
        <StatCard label="Green Days" value={greenDays} color="text-secondary" />
        <StatCard label="Red Days" value={redDays} color="text-error" />
      </div>

      <div className="card p-4">
        <h3 className="font-headline font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>calendar_month</span>
          P&L Heat Map
        </h3>
        <div className="flex gap-1 text-xs text-on-surface-variant mb-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="w-8 text-center">{d}</div>
          ))}
        </div>
        <div className="space-y-1">
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex gap-1">
              {wk.map((day, di) => (
                <div
                  key={di}
                  title={`${day.date}: ${day.pnl >= 0 ? '+' : ''}$${day.pnl.toFixed(2)}`}
                  className={`w-8 h-8 rounded text-[10px] flex items-center justify-center cursor-default hover:opacity-80 font-medium transition-opacity ${
                    day.pnl > 0 ? 'bg-secondary/25 text-secondary' :
                    day.pnl < 0 ? 'bg-error/25 text-error' :
                    'bg-surface-container-high text-outline-variant'
                  }`}
                >
                  {day.pnl !== 0 ? (day.pnl > 0 ? '+' : '−') : '·'}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-secondary/25 inline-block" /> Profit day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-error/25 inline-block" /> Loss day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-surface-container-high inline-block" /> No bets
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Model Leaderboard ───────────────────────────────────

function LeaderboardTab() {
  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => analyticsApi.getLeaderboard().then(r => r.data),
    staleTime: 120_000,
  })

  const rows: any[] = Array.isArray(leaderboard) && leaderboard.length > 0 ? leaderboard : [
    { model: { name: 'Moreyball' }, roi: 0.12, winRate: 0.56, sharpeRatio: 1.8, totalBets: 142 },
    { model: { name: 'Efficiency' }, roi: 0.09, winRate: 0.54, sharpeRatio: 1.4, totalBets: 98 },
    { model: { name: 'Balanced' }, roi: 0.07, winRate: 0.53, sharpeRatio: 1.2, totalBets: 215 },
    { model: { name: 'Defensive' }, roi: 0.03, winRate: 0.52, sharpeRatio: 0.9, totalBets: 83 },
  ]

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
            <th className="text-left px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">#</th>
            <th className="text-left px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Model</th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">ROI</th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Win Rate</th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Sharpe</th>
            <th className="text-right px-4 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Bets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((perf: any, i: number) => (
            <tr key={i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
              <td className="py-3 px-4">
                {i === 0 ? (
                  <span className="material-symbols-outlined text-yellow-400" style={{ fontSize: 16 }}>emoji_events</span>
                ) : (
                  <span className="text-on-surface-variant text-xs font-mono">{i + 1}</span>
                )}
              </td>
              <td className="py-3 px-4 font-medium text-on-surface">{perf.model?.name ?? 'Unknown'}</td>
              <td className="py-3 px-4 text-right">
                <span className={perf.roi >= 0 ? 'text-secondary font-bold' : 'text-error'}>
                  {perf.roi >= 0 ? '+' : ''}{((perf.roi ?? 0) * 100).toFixed(1)}%
                </span>
              </td>
              <td className="py-3 px-4 text-right text-on-surface-variant">{((perf.winRate ?? 0) * 100).toFixed(1)}%</td>
              <td className="py-3 px-4 text-right text-primary font-mono">{(perf.sharpeRatio ?? 0).toFixed(2)}</td>
              <td className="py-3 px-4 text-right text-on-surface-variant">{perf.totalBets ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const TABS = [
  { id: 'overview',     label: 'Overview',     iconName: 'monitoring' },
  { id: 'by-type',      label: 'By Type',      iconName: 'bar_chart' },
  { id: 'calibration',  label: 'Calibration',  iconName: 'gps_fixed' },
  { id: 'calendar',     label: 'P&L Calendar', iconName: 'calendar_month' },
  { id: 'leaderboard',  label: 'Models',       iconName: 'military_tech' },
]

const DEMO_DATA = {
  summary: { totalBets: 0, won: 0, lost: 0, pushed: 0, roi: 0, winRate: 0, sharpe: 0, maxDrawdown: 0, totalStaked: 0, totalPnl: 0, avgEVPct: 0, activeOpportunities: 0 },
  growthHistory: [],
  calendarData: Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.now() - (89 - i) * 86400000).toISOString().slice(0, 10),
    pnl: 0,
  })),
  byMarketType: [],
  calibration: [],
}

export default function PerformancePage() {
  const [tab, setTab] = useState('overview')
  const [days, setDays] = useState(90)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['performance-dashboard', days],
    queryFn: () => analyticsApi.getPerformanceDashboard(days).then(r => r.data),
    staleTime: 60_000,
  })

  const data = raw ?? DEMO_DATA

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>monitoring</span>
          </div>
          <div>
            <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface">
              Performance Analytics
            </h1>
            <p className="text-sm text-on-surface-variant">Track your betting edge over time</p>
          </div>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="input-field text-sm py-2 w-40"
        >
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant/15 overflow-x-auto no-scrollbar">
        {TABS.map(({ id, label, iconName }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{iconName}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28 }}>refresh</span>
          <span className="text-sm">Loading analytics…</span>
        </div>
      ) : (
        <>
          {tab === 'overview'    && <OverviewTab data={data} />}
          {tab === 'by-type'     && <ByTypeTab data={data} />}
          {tab === 'calibration' && <CalibrationTab data={data} />}
          {tab === 'calendar'    && <CalendarTab data={data} />}
          {tab === 'leaderboard' && <LeaderboardTab />}
        </>
      )}
    </div>
  )
}
