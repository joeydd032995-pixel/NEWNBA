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
  accent?: 'primary' | 'secondary' | 'positive' | 'default'
  icon?: React.ElementType
  subtitle?: string
}

function StatCard({ label, value, delta, accent = 'default', icon: Icon, subtitle }: StatCardProps) {
  const accentStyles: Record<string, { iconColor: string; borderClass: string; valueColor: string }> = {
    primary:   { iconColor: 'text-primary',   borderClass: 'card border-primary/20',   valueColor: 'text-primary' },
    secondary: { iconColor: 'text-secondary', borderClass: 'card border-secondary/20', valueColor: 'text-secondary' },
    positive:  { iconColor: 'text-secondary', borderClass: 'card',                     valueColor: 'text-secondary' },
    default:   { iconColor: 'text-on-surface-variant', borderClass: 'card',            valueColor: 'text-on-surface' },
  }
  const s = accentStyles[accent]

  return (
    <div className={s.borderClass}>
      <div className="flex items-start justify-between mb-3">
        <p className="stat-label">{label}</p>
        {Icon && <Icon size={15} className={s.iconColor} />}
      </div>
      <p className={`stat-value ${s.valueColor}`}>{value}</p>
      {subtitle && <p className="text-on-surface-variant text-xs mt-1">{subtitle}</p>}
      {delta !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${delta >= 0 ? 'text-secondary' : 'text-error'}`}>
          <span>{delta >= 0 ? '+' : ''}{delta}%</span>
          <span className="text-on-surface-variant font-normal">vs last week</span>
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
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(223,142,255,0.08) 0%, rgba(0,244,254,0.04) 100%)',
          border: '1px solid rgba(223,142,255,0.15)',
        }}
      >
        {/* Background glow blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-30 pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(223,142,255,0.25) 0%, transparent 70%)', filter: 'blur(30px)' }} />
        <div className="absolute -bottom-10 left-20 w-40 h-40 rounded-full opacity-20 pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(0,244,254,0.25) 0%, transparent 70%)', filter: 'blur(30px)' }} />

        <div className="relative">
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface">
            Welcome back,{' '}
            <span className="text-primary">{user?.firstName ?? user?.email?.split('@')[0]}</span>
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {user?.planType} Plan &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── KPI stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="EV Opportunities"
          value={evFeed?.data?.length ?? '—'}
          delta={12}
          accent="primary"
          icon={TrendingUp}
          subtitle="active right now"
        />
        <StatCard
          label="Arb Opportunities"
          value={arbFeed?.data?.length ?? '—'}
          delta={5}
          accent="secondary"
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
          accent="positive"
          icon={Activity}
          subtitle="beating market by 11.6%"
        />
      </div>

      {/* ── Performance chart ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-headline font-bold text-on-surface">Portfolio Performance</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">30-day bankroll trajectory</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold badge-positive">
            <Target size={10} />
            <span>+8.4% ROI</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#df8eff" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#df8eff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(70,72,74,0.3)" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#aaabad' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#aaabad' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#1d2022',
                border: '1px solid rgba(70,72,74,0.3)',
                borderRadius: '12px',
                color: '#eeeef0',
                fontSize: '11px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
              cursor={{ stroke: 'rgba(223,142,255,0.3)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="bankroll"
              stroke="#df8eff"
              strokeWidth={2}
              fill="url(#bankrollGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#df8eff', strokeWidth: 0 }}
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
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/15 border border-primary/20">
                <TrendingUp size={13} className="text-primary" />
              </div>
              <h3 className="font-headline font-bold text-on-surface text-sm">Top EV Opportunities</h3>
            </div>
            <Link
              to="/ev-feed"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:brightness-110 transition-all"
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
                className="flex justify-between items-center py-2.5 px-3 rounded-xl hover:bg-surface-container-high/50 transition-colors"
                style={{ borderBottom: i < 2 ? '1px solid rgba(70,72,74,0.15)' : 'none' }}
              >
                <div>
                  <p className="text-xs text-on-surface font-medium">{item.outcome ?? 'Home ML'}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {item.market?.event?.homeTeam?.name ?? 'Team A'} vs {item.market?.event?.awayTeam?.name ?? 'Team B'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="badge-positive">+{((item.evPct ?? 0.05) * 100).toFixed(1)}% EV</span>
                  <p className="text-xs text-on-surface-variant mt-1 font-mono">{(item.bookOdds ?? 0) > 0 ? '+' : ''}{item.bookOdds ?? '-110'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming games */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-secondary/15 border border-secondary/20">
                <Zap size={13} className="text-secondary" />
              </div>
              <h3 className="font-headline font-bold text-on-surface text-sm">Upcoming Games</h3>
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
                className="flex justify-between items-center py-2.5 px-3 rounded-xl hover:bg-surface-container-high/50 transition-colors"
                style={{ borderBottom: i < 4 ? '1px solid rgba(70,72,74,0.15)' : 'none' }}
              >
                <div>
                  <p className="text-xs text-on-surface font-medium">
                    {event.homeTeam?.abbreviation} vs {event.awayTeam?.abbreviation}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {event.startTime ? new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
                {event.status === 'LIVE' ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-error/12 text-error border border-error/25">
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
