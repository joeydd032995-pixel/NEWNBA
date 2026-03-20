import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, ReferenceLine, Cell,
} from 'recharts'
import { Activity, TrendingUp, Target, Award, BarChart2, Calendar, Crosshair } from 'lucide-react'
import { analyticsApi } from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────

function fmtPct(v: number, dec = 1) { return `${(v * 100).toFixed(dec)}%` }
function fmtUSD(v: number) {
  return `${v >= 0 ? '' : '-'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white', icon: Icon }: any) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-400">{label}</p>
        {Icon && <Icon size={14} className={color} />}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
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
        <StatCard label="ROI" value={`${s.roi >= 0 ? '+' : ''}${fmtPct(s.roi)}`} icon={TrendingUp}
          color={s.roi >= 0 ? 'text-green-400' : 'text-red-400'}
          sub={`${s.totalBets} resolved bets`} />
        <StatCard label="Win Rate" value={fmtPct(s.winRate)} icon={Target}
          color="text-neon-blue-400" sub="Break-even: ~52.4%" />
        <StatCard label="Sharpe Ratio" value={s.sharpe.toFixed(2)} icon={Activity}
          color={s.sharpe >= 1 ? 'text-green-400' : s.sharpe >= 0 ? 'text-yellow-400' : 'text-red-400'}
          sub="Risk-adjusted return" />
        <StatCard label="Max Drawdown" value={fmtPct(s.maxDrawdown)} icon={Award}
          color={s.maxDrawdown > 0.15 ? 'text-red-400' : 'text-slate-300'}
          sub={`Total P&L: ${s.totalPnl >= 0 ? '+' : ''}${fmtUSD(s.totalPnl)}`} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{s.won}</p>
          <p className="text-xs text-slate-400 mt-1">Wins</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{s.lost}</p>
          <p className="text-xs text-slate-400 mt-1">Losses</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-slate-400">{s.pushed}</p>
          <p className="text-xs text-slate-400 mt-1">Pushes</p>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-primary-400" /> Cumulative P&L
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(76,65,158,0.08)" />
            <XAxis dataKey="date" tick={{ fill: '#444444', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#444444', fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <Tooltip
              contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(76,65,158,0.2)', borderRadius: 8 }}
              formatter={(v: number) => [fmtUSD(Number(v)), 'Cum. P&L']}
            />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="cumPnl" stroke="#4c419e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Live +EV Opportunities</p>
          <p className="text-xs text-slate-400 mt-0.5">Active in last 2 hours</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary-400">{s.activeOpportunities}</p>
          <p className="text-xs text-slate-400">Avg EV: {fmtPct(s.avgEVPct / 100)}</p>
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
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-dark-600">
              <th className="text-left p-3">Market Type</th>
              <th className="text-right p-3">Bets</th>
              <th className="text-right p-3">Won</th>
              <th className="text-right p-3">Win Rate</th>
              <th className="text-right p-3">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500 text-sm">No resolved bets yet</td></tr>
            ) : rows.map(r => (
              <tr key={r.type} className="border-b border-dark-600/50 hover:bg-dark-700/30">
                <td className="p-3 text-white font-medium">{LABELS[r.type] ?? r.type}</td>
                <td className="p-3 text-right text-slate-300">{r.bets}</td>
                <td className="p-3 text-right text-slate-300">{r.won}</td>
                <td className="p-3 text-right">
                  <span className={r.winRate >= 0.524 ? 'text-green-400' : 'text-red-400'}>
                    {fmtPct(r.winRate)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className={r.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
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
          <h3 className="font-semibold text-white text-sm mb-3">Win Rate by Market Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rows.map(r => ({ name: LABELS[r.type] ?? r.type, winRate: +(r.winRate * 100).toFixed(1) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(76,65,158,0.08)" />
              <XAxis dataKey="name" tick={{ fill: '#444444', fontSize: 11 }} />
              <YAxis tick={{ fill: '#444444', fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(76,65,158,0.2)', borderRadius: 8 }}
                formatter={(v: number) => [`${v}%`, 'Win Rate']} />
              <ReferenceLine y={52.4} stroke="#475569" strokeDasharray="4 4"
                label={{ value: 'BE', fill: '#444444', fontSize: 10 }} />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {rows.map((r, i) => <Cell key={i} fill={r.winRate >= 0.524 ? '#22c55e' : '#ef4444'} />)}
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
        <StatCard label="Brier Score" value={brierScore} sub="Lower = better (0 = perfect)" color="text-yellow-400" icon={Crosshair} />
        <StatCard label="Calibration Samples" value={totalPreds || '—'} sub="Resolved predictions" color="text-white" />
        <StatCard label="Populated Buckets" value={`${buckets.filter(b => b.count > 0).length} / 10`} sub="Probability ranges" color="text-slate-300" />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-white text-sm mb-1">Calibration Chart</h3>
        <p className="text-xs text-slate-500 mb-3">Dots above diagonal = over-confident; below = under-confident. Perfect model lies on the line.</p>
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(76,65,158,0.08)" />
            <XAxis type="number" dataKey="predicted" name="Predicted %" domain={[0, 100]} unit="%" tick={{ fill: '#444444', fontSize: 11 }} />
            <YAxis type="number" dataKey="actual" name="Actual %" domain={[0, 100]} unit="%" tick={{ fill: '#444444', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(76,65,158,0.2)', borderRadius: 8 }}
              formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#475569" strokeDasharray="4 4" label={{ value: 'Perfect', fill: '#444444', fontSize: 10, position: 'insideTopRight' }} />
            <Scatter data={chartData.filter(d => d.actual !== null)} fill="#4c419e" />
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
        <StatCard label="Period P&L" value={`${totalPnl >= 0 ? '+' : ''}${fmtUSD(totalPnl)}`}
          color={totalPnl >= 0 ? 'text-green-400' : 'text-red-400'} icon={Calendar} />
        <StatCard label="Active Days" value={activeDays} sub="Days with bets" color="text-white" />
        <StatCard label="Green Days" value={greenDays} color="text-green-400" />
        <StatCard label="Red Days" value={redDays} color="text-red-400" />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-primary-400" /> P&L Heat Map
        </h3>
        <div className="flex gap-1 text-xs text-slate-500 mb-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="w-8 text-center">{d}</div>
          ))}
        </div>
        <div className="space-y-1">
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex gap-1">
              {wk.map((day, di) => (
                <div key={di}
                  title={`${day.date}: ${day.pnl >= 0 ? '+' : ''}$${day.pnl.toFixed(2)}`}
                  className={`w-8 h-8 rounded text-[10px] flex items-center justify-center cursor-default hover:opacity-80 font-medium ${
                    day.pnl > 0 ? 'bg-green-500/60 text-green-100' :
                    day.pnl < 0 ? 'bg-red-500/60 text-red-100' :
                    'bg-slate-800 text-slate-600'
                  }`}
                >
                  {day.pnl !== 0 ? (day.pnl > 0 ? '+' : '−') : '·'}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/60 inline-block" /> Profit day</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/60 inline-block" /> Loss day</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-800 inline-block" /> No bets</span>
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
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b border-dark-600">
            <th className="text-left p-3">#</th>
            <th className="text-left p-3">Model</th>
            <th className="text-right p-3">ROI</th>
            <th className="text-right p-3">Win Rate</th>
            <th className="text-right p-3">Sharpe</th>
            <th className="text-right p-3">Bets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((perf: any, i: number) => (
            <tr key={i} className="border-b border-dark-600 hover:bg-dark-700/50">
              <td className="py-2.5 px-3 text-slate-500">{i + 1}</td>
              <td className="py-2.5 px-3 font-medium text-white">{perf.model?.name ?? 'Unknown'}</td>
              <td className="py-2.5 px-3 text-right">
                <span className={perf.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {perf.roi >= 0 ? '+' : ''}{((perf.roi ?? 0) * 100).toFixed(1)}%
                </span>
              </td>
              <td className="py-2.5 px-3 text-right text-slate-300">{((perf.winRate ?? 0) * 100).toFixed(1)}%</td>
              <td className="py-2.5 px-3 text-right text-purple-400">{(perf.sharpeRatio ?? 0).toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right text-slate-400">{perf.totalBets ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const TABS = [
  { id: 'overview',     label: 'Overview',    icon: Activity },
  { id: 'by-type',      label: 'By Type',     icon: BarChart2 },
  { id: 'calibration',  label: 'Calibration', icon: Crosshair },
  { id: 'calendar',     label: 'P&L Calendar', icon: Calendar },
  { id: 'leaderboard',  label: 'Models',      icon: Award },
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
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-primary-400" />
          <h1 className="text-xl font-bold text-white">Performance Analytics</h1>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="input-field text-sm py-1.5">
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-600">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t transition-colors ${
              tab === id
                ? 'bg-primary-600/20 text-primary-400 border-b-2 border-primary-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Loading analytics…</div>
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
