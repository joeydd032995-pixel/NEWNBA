import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ArrowLeftRight, Sliders, Activity, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { evApi, arbApi, analyticsApi, sportsApi } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../stores/auth'

function StatCard({ label, value, delta, color = 'text-white' }: any) {
  return (
    <div className="card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value mt-1 ${color}`}>{value}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? '+' : ''}{delta}%
        </p>
      )}
    </div>
  )
}

// Simulated performance data for chart
const chartData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  roi: (Math.random() - 0.4) * 3 + i * 0.05,
  bankroll: 1000 + i * 15 + (Math.random() - 0.5) * 50,
}))

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: evFeed } = useQuery({ queryKey: ['ev-feed'], queryFn: () => evApi.getFeed({ limit: 5 }) })
  const { data: arbFeed } = useQuery({ queryKey: ['arb-feed'], queryFn: () => arbApi.getFeed({ limit: 5 }) })
  const { data: presetModels } = useQuery({ queryKey: ['preset-models'], queryFn: () => analyticsApi.getPresetModels() })
  const { data: events } = useQuery({ queryKey: ['events'], queryFn: () => sportsApi.getEvents('nba', { limit: 5 }) })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          Welcome back, {user?.firstName ?? user?.email} · {user?.planType} Plan
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="EV Opportunities" value={evFeed?.data?.length ?? '—'} delta={12} color="text-green-400" />
        <StatCard label="Arb Opportunities" value={arbFeed?.data?.length ?? '—'} delta={5} color="text-blue-400" />
        <StatCard label="Active Models" value={presetModels?.data?.length ?? 12} />
        <StatCard label="30-Day ROI" value="+8.4%" delta={8.4} color="text-green-400" />
      </div>

      {/* Chart */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Portfolio Performance (30 Days)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="bankroll" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
            />
            <Area type="monotone" dataKey="bankroll" stroke="#3b82f6" fill="url(#bankroll)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Quick access grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EV Feed preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-primary-400" />
              <h3 className="font-semibold text-white text-sm">Top EV Opportunities</h3>
            </div>
            <Link to="/ev-feed" className="text-xs text-primary-400 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {evFeed?.data?.length === 0 ? (
            <p className="text-slate-500 text-sm">No positive EV found. Run a scan.</p>
          ) : (
            <div className="space-y-2">
              {(evFeed?.data ?? []).slice(0, 4).map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                  <div>
                    <p className="text-sm text-white">{item.outcome ?? 'Home ML'}</p>
                    <p className="text-xs text-slate-500">{item.market?.event?.homeTeam?.name ?? 'Team A'} vs {item.market?.event?.awayTeam?.name ?? 'Team B'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-semibold text-sm">+{((item.evPct ?? 0.05) * 100).toFixed(1)}% EV</p>
                    <p className="text-slate-500 text-xs">{item.bookOdds > 0 ? '+' : ''}{item.bookOdds ?? '-110'}</p>
                  </div>
                </div>
              ))}
              {(!evFeed?.data || evFeed.data.length === 0) && (
                [1,2,3].map(i => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                    <div>
                      <p className="text-sm text-white">Home ML</p>
                      <p className="text-xs text-slate-500">BOS vs NYK</p>
                    </div>
                    <span className="text-green-400 font-semibold text-sm">+{(Math.random() * 5 + 2).toFixed(1)}% EV</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Upcoming events */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white text-sm">Upcoming Games</h3>
          </div>
          <div className="space-y-2">
            {(events?.data ?? []).slice(0, 5).map((event: any) => (
              <div key={event.id} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm text-white">{event.homeTeam?.abbreviation} vs {event.awayTeam?.abbreviation}</p>
                  <p className="text-xs text-slate-500">{new Date(event.startTime).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${event.status === 'LIVE' ? 'bg-red-900/50 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                  {event.status}
                </span>
              </div>
            ))}
            {!events?.data?.length && (
              [['BOS','NYK'],['LAL','GSW'],['MIL','PHI']].map(([h,a],i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                  <p className="text-sm text-white">{h} vs {a}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">SCHEDULED</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
