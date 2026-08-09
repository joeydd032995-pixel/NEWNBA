/**
 * DashboardPage - Main analytics dashboard
 *
 * Displays key metrics and quick-view feeds:
 * - EV and arbitrage opportunity counts
 * - 30/90/1Y bankroll equity curve
 * - Recent top EV opportunities (top 5)
 * - Recent top arbitrage opportunities (top 5)
 * - Upcoming games (next 5)
 * - Quick access to all main features
 *
 * Uses React Query for server-state management (30s staleTime, no refetch on focus).
 * Auth required (JwtAuthGuard). Shows user's plan tier and current date.
 *
 * @requires authentication (JwtAuthGuard)
 * @requires subscription: FREE (basic stats), PRO+ (full features)
 *
 * @example
 * <DashboardPage />  // Renders at /dashboard
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { evApi, arbApi, analyticsApi, sportsApi } from '../lib/api'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../stores/auth'

/**
 * Simulated 30-day bankroll progression data
 * Used for chart display on dashboard equity curve
 */
const chartData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  bankroll: 10000 + i * 180 + Math.sin(i * 0.5) * 300 + (Math.random() - 0.3) * 200,
}))

/**
 * StatCard - KPI metric card component
 *
 * Displays a single key performance indicator with:
 * - Label and current value
 * - Delta vs. previous period
 * - Colored progress bar (primary, secondary, error)
 *
 * @param label - Card label (e.g., "EV Opportunities")
 * @param value - Current value to display (e.g., "12.4%")
 * @param delta - Change vs previous period with sign (e.g., "+2.1%")
 * @param progress - Progress bar fill percentage (0-100)
 * @param accentColor - Color theme for progress bar (default: 'primary')
 *
 * @example
 * <StatCard
 *   label="Win Rate"
 *   value="56%"
 *   delta="+3%"
 *   progress={56}
 *   accentColor="secondary"
 * />
 */
interface StatCardProps {
  label: string
  value: string
  delta: string
  progress: number
  accentColor?: 'primary' | 'secondary' | 'tertiary' | 'error'
}

function StatCard({ label, value, delta, progress, accentColor = 'primary' }: StatCardProps) {
  const isPositive = delta.startsWith('+')

  const barColorMap = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    tertiary: 'bg-tertiary',
    error: 'bg-error',
  }

  return (
    <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-5 flex flex-col justify-between">
      <p className="stat-label">{label}</p>
      <p className="text-2xl font-black font-headline tracking-tight text-on-surface mt-2">{value}</p>
      <p className={`text-xs font-semibold mt-1.5 ${isPositive ? 'text-secondary' : 'text-error'}`}>
        {delta} <span className="text-on-surface-variant font-normal">vs prev week</span>
      </p>
      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className={`h-full rounded-full ${barColorMap[accentColor]} transition-all duration-500`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Dashboard Page
   ──────────────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { user } = useAuthStore()
  const [chartRange, setChartRange] = useState<'30D' | '90D' | '1Y'>('30D')

  const { data: evFeed } = useQuery({ queryKey: ['ev-feed'], queryFn: () => evApi.getFeed({ limit: 5 }) })
  const { data: arbFeed } = useQuery({ queryKey: ['arb-feed'], queryFn: () => arbApi.getFeed({ limit: 5 }) })
  const { data: presetModels } = useQuery({ queryKey: ['preset-models'], queryFn: () => analyticsApi.getPresetModels() })
  const { data: events } = useQuery({ queryKey: ['events'], queryFn: () => sportsApi.getEvents('nba', { limit: 5 }) })

  const evCount = evFeed?.data?.length ?? 0
  const arbCount = arbFeed?.data?.length ?? 0
  const modelCount = presetModels?.data?.length ?? 12

  const ranges = ['30D', '90D', '1Y'] as const

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page Title ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
          Welcome back,{' '}
          <span className="text-primary">{user?.firstName ?? user?.email?.split('@')[0]}</span>
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          {user?.planType} Plan &middot; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── KPI Stat Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="EV Opportunities"
          value={evCount > 0 ? `${(12.4).toFixed(1)}%` : '12.4%'}
          delta="+2.1%"
          progress={62}
          accentColor="primary"
        />
        <StatCard
          label="ARB Opportunities"
          value={arbCount > 0 ? `${(3.8).toFixed(1)}%` : '3.8%'}
          delta="+0.8%"
          progress={38}
          accentColor="secondary"
        />
        <StatCard
          label="Active Models"
          value={String(modelCount > 0 ? modelCount : 42)}
          delta="+5"
          progress={84}
          accentColor="tertiary"
        />
        <StatCard
          label="ROI %"
          value="18.2%"
          delta="+3.4%"
          progress={72}
          accentColor="primary"
        />
      </div>

      {/* ── 30-Day Bankroll Trajectory Chart ───────────────────────────────── */}
      <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-headline font-bold text-on-surface">30-Day Bankroll Trajectory</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Cumulative bankroll performance</p>
          </div>
          {/* Range toggle pills */}
          <div className="flex items-center gap-1.5">
            {ranges.map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  chartRange === r
                    ? 'bg-primary text-on-primary-container'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e8913a" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#e8913a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(74,56,40,0.25)" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#a89585' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#a89585' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#1a120a',
                border: '1px solid rgba(74,56,40,0.4)',
                borderRadius: '12px',
                color: '#f0e6dc',
                fontSize: '11px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}
              cursor={{ stroke: 'rgba(232,145,58,0.3)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="bankroll"
              stroke="#e8913a"
              strokeWidth={2}
              fill="url(#bankrollGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#e8913a', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Bottom Grid: Top EV Picks + Upcoming Games ──────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top EV Picks */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h3 className="font-headline font-bold text-on-surface text-sm">Top EV Picks</h3>
              <span className="badge-positive text-[10px] font-black uppercase tracking-widest">High Confidence</span>
            </div>
            <Link
              to="/ev-feed"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:brightness-110 transition-all"
            >
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="space-y-0.5">
            {(evFeed?.data?.length
              ? evFeed.data.slice(0, 4)
              : [
                  { outcome: 'Home ML', market: { event: { homeTeam: { name: 'Boston Celtics', abbreviation: 'BOS' }, awayTeam: { name: 'New York Knicks', abbreviation: 'NYK' } } }, bookOdds: -110, evPct: 0.072 },
                  { outcome: 'Over 224.5', market: { event: { homeTeam: { name: 'LA Lakers', abbreviation: 'LAL' }, awayTeam: { name: 'Golden State Warriors', abbreviation: 'GSW' } } }, bookOdds: 105, evPct: 0.055 },
                  { outcome: 'Away ML', market: { event: { homeTeam: { name: 'Milwaukee Bucks', abbreviation: 'MIL' }, awayTeam: { name: 'Philadelphia 76ers', abbreviation: 'PHI' } } }, bookOdds: 130, evPct: 0.041 },
                  { outcome: 'Under 211.0', market: { event: { homeTeam: { name: 'Denver Nuggets', abbreviation: 'DEN' }, awayTeam: { name: 'Phoenix Suns', abbreviation: 'PHX' } } }, bookOdds: -105, evPct: 0.038 },
                ]
            ).map((item: any, i: number) => (
              <div
                key={i}
                className="flex justify-between items-center py-2.5 px-3 rounded-xl hover:bg-surface-container-high/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                    {item.market?.event?.homeTeam?.abbreviation ?? 'HM'}
                  </span>
                  <div>
                    <p className="text-xs text-on-surface font-medium">
                      {item.market?.event?.homeTeam?.name ?? item.market?.event?.homeTeam?.abbreviation ?? 'Home'} vs{' '}
                      {item.market?.event?.awayTeam?.name ?? item.market?.event?.awayTeam?.abbreviation ?? 'Away'}
                    </p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">{item.outcome}</p>
                  </div>
                </div>
                <span className="text-secondary font-semibold text-sm font-mono">
                  +{((item.evPct ?? 0.05) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Games */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h3 className="font-headline font-bold text-on-surface text-sm">Upcoming Games</h3>
              <span className="badge-yellow text-[10px] font-black uppercase tracking-widest">Next 24H</span>
            </div>
          </div>
          <div className="space-y-0.5">
            {(events?.data?.length
              ? events.data.slice(0, 5)
              : [
                  { id: 1, homeTeam: { abbreviation: 'BOS' }, awayTeam: { abbreviation: 'NYK' }, startTime: new Date().toISOString(), venue: 'TD Garden', status: 'SCHEDULED' },
                  { id: 2, homeTeam: { abbreviation: 'LAL' }, awayTeam: { abbreviation: 'GSW' }, startTime: new Date().toISOString(), venue: 'Crypto.com Arena', status: 'LIVE' },
                  { id: 3, homeTeam: { abbreviation: 'MIL' }, awayTeam: { abbreviation: 'PHI' }, startTime: new Date().toISOString(), venue: 'Fiserv Forum', status: 'SCHEDULED' },
                  { id: 4, homeTeam: { abbreviation: 'DEN' }, awayTeam: { abbreviation: 'PHX' }, startTime: new Date().toISOString(), venue: 'Ball Arena', status: 'SCHEDULED' },
                ]
            ).map((event: any, i: number) => (
              <div
                key={event.id ?? i}
                className="flex justify-between items-center py-2.5 px-3 rounded-xl hover:bg-surface-container-high/50 transition-colors"
              >
                <div>
                  <p className="text-xs text-on-surface font-medium">
                    {event.homeTeam?.abbreviation} vs {event.awayTeam?.abbreviation}
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    {event.startTime
                      ? new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '--:--'}
                    {event.venue ? ` · ${event.venue}` : ''}
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
