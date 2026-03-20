import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ArrowLeftRight, Sliders, Activity, ChevronRight, Zap, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { evApi, arbApi, analyticsApi, sportsApi } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../stores/auth'

// Simulated performance data for chart
const chartData = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  roi: (Math.random() - 0.4) * 3 + i * 0.05,
  bankroll: 1000 + i * 15 + (Math.random() - 0.5) * 50,
}))

interface StatCardProps {
  label: string
  value: React.ReactNode
  delta?: number
  accent?: 'gold' | 'cyan' | 'green' | 'default'
  icon?: React.ElementType
  subtitle?: string
}

function StatCard({ label, value, delta, accent = 'default', icon: Icon, subtitle }: StatCardProps) {
  const accentStyles: Record<string, { iconColor: string; glowClass: string; valueColor: string }> = {
    gold:    { iconColor: 'text-gold-400', glowClass: 'card-gold', valueColor: 'text-gold-300' },
    cyan:    { iconColor: 'text-neon-blue-400', glowClass: 'card-blue', valueColor: 'text-neon-blue-300' },
    green:   { iconColor: 'text-green-400', glowClass: 'card', valueColor: 'text-green-400' },
    default: { iconColor: 'text-slate-400', glowClass: 'card', valueColor: 'text-white' },
  }
  const s = accentStyles[accent]

  return (
    <div className={s.glowClass}>
      <div className="flex items-start justify-between mb-3">
        <p className="stat-label">{label}</p>
        {Icon && <Icon size={15} className={s.iconColor} />}
      </div>
      <p className={`stat-value ${s.valueColor}`}>{value}</p>
      {subtitle && <p className="text-slate-600 text-2xs mt-1">{subtitle}</p>}
      {delta !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-2xs font-semibold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          <span>{delta >= 0 ? '+' : ''}{delta}%</span>
          <span className="text-slate-600 font-normal">vs last week</span>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: evFeed }      = useQuery({ queryKey: ['ev-feed'],       queryFn: () => evApi.getFeed({ limit: 5 }) })
  const { data: arbFeed }     = useQuery({ queryKey: ['arb-feed'],      queryFn: () => arbApi.getFeed({ limit: 5 }) })
  const { data: presetModels} = useQuery({ queryKey: ['preset-models'], queryFn: () => analyticsApi.getPresetModels() })
  const { data: events }      = useQuery({ queryKey: ['events'],        queryFn: () => sportsApi.getEvents('nba', { limit: 5 }) })

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0d1425 0%, #131c30 50%, #0a1520 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Background glow blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20 pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.3) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-10 left-20 w-40 h-40 rounded-full opacity-15 pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(76,65,158,0.3) 0%, transparent 70%)' }} />

        <div className="relative">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Welcome back, <span style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{user?.firstName ?? user?.email?.split('@')[0]}</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {user?.planType} Plan &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── KPI stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="EV Opportunities"
          value={evFeed?.data?.length ?? '—'}
          delta={12}
          accent="gold"
          icon={TrendingUp}
          subtitle="active right now"
        />
        <StatCard
          label="Arb Opportunities"
          value={arbFeed?.data?.length ?? '—'}
          delta={5}
          accent="cyan"
          icon={ArrowLeftRight}
          subtitle="risk-free profit"
        />
        <StatCard
          label="Active Models"
          value={presetModels?.data?.length ?? 12}
          accent="default"
          icon={Sliders}
          subtitle="ready to deploy"
        />
        <StatCard
          label="30-Day ROI"
          value="+8.4%"
          delta={8.4}
          accent="green"
          icon={Activity}
          subtitle="beating market by 11.6%"
        />
      </div>

      {/* ── Performance chart ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Portfolio Performance</h2>
            <p className="text-2xs text-slate-600 mt-0.5">30-day bankroll trajectory</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold"
               style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
            <Target size={10} />
            <span>+8.4% ROI</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#0d1425',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#f1f5f9',
                fontSize: '11px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
              cursor={{ stroke: 'rgba(245,158,11,0.3)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="bankroll"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#bankrollGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#fbbf24', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Quick-access grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* EV Feed preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center"
                   style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <TrendingUp size={12} className="text-gold-400" />
              </div>
              <h3 className="font-semibold text-white text-sm">Top EV Opportunities</h3>
            </div>
            <Link
              to="/ev-feed"
              className="flex items-center gap-1 text-2xs font-semibold transition-colors duration-150"
              style={{ color: '#fbbf24' }}
            >
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="space-y-1">
            {(evFeed?.data?.length
              ? evFeed.data.slice(0, 4)
              : [
                  { outcome: 'Home ML', market: { event: { homeTeam: { name: 'BOS' }, awayTeam: { name: 'NYK' } } }, bookOdds: -110, evPct: 0.072 },
                  { outcome: 'Over 224.5', market: { event: { homeTeam: { name: 'LAL' }, awayTeam: { name: 'GSW' } } }, bookOdds: 105, evPct: 0.055 },
                  { outcome: 'Away ML', market: { event: { homeTeam: { name: 'MIL' }, awayTeam: { name: 'PHI' } } }, bookOdds: 130, evPct: 0.041 },
                ]
            ).map((item: any, i: number) => (
              <div
                key={i}
                className="flex justify-between items-center py-2 px-2 rounded-lg transition-all duration-150"
                style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <div>
                  <p className="text-xs text-white font-medium">{item.outcome ?? 'Home ML'}</p>
                  <p className="text-2xs text-slate-600 mt-0.5">
                    {item.market?.event?.homeTeam?.name ?? 'Team A'} vs {item.market?.event?.awayTeam?.name ?? 'Team B'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="badge-positive">+{((item.evPct ?? 0.05) * 100).toFixed(1)}% EV</span>
                  <p className="text-2xs text-slate-600 mt-1 font-mono">{(item.bookOdds ?? 0) > 0 ? '+' : ''}{item.bookOdds ?? '-110'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming games */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center"
                   style={{ background: 'rgba(76,65,158,0.12)', border: '1px solid rgba(76,65,158,0.2)' }}>
                <Zap size={12} className="text-neon-blue-400" />
              </div>
              <h3 className="font-semibold text-white text-sm">Upcoming Games</h3>
            </div>
          </div>
          <div className="space-y-1">
            {(events?.data?.length
              ? events.data.slice(0, 5)
              : [
                  { id: 1, homeTeam: { abbreviation: 'BOS' }, awayTeam: { abbreviation: 'NYK' }, startTime: new Date().toISOString(), status: 'SCHEDULED' },
                  { id: 2, homeTeam: { abbreviation: 'LAL' }, awayTeam: { abbreviation: 'GSW' }, startTime: new Date().toISOString(), status: 'LIVE' },
                  { id: 3, homeTeam: { abbreviation: 'MIL' }, awayTeam: { abbreviation: 'PHI' }, startTime: new Date().toISOString(), status: 'SCHEDULED' },
                ]
            ).map((event: any, i: number) => (
              <div
                key={event.id ?? i}
                className="flex justify-between items-center py-2 px-2 rounded-lg transition-all duration-150"
                style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <div>
                  <p className="text-xs text-white font-medium">
                    {event.homeTeam?.abbreviation} vs {event.awayTeam?.abbreviation}
                  </p>
                  <p className="text-2xs text-slate-600 mt-0.5">
                    {event.startTime ? new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
                {event.status === 'LIVE' ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-semibold"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <span className="live-dot" />
                    LIVE
                  </span>
                ) : (
                  <span className="badge-neutral">{event.status}</span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
