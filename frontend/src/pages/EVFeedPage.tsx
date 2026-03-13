import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, RefreshCw, Plus, Filter, Zap } from 'lucide-react'
import { evApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

function EVBadge({ evPct }: { evPct: number }) {
  const pct = (evPct * 100).toFixed(1)
  if (evPct >= 0.05) return <span className="badge-positive">+{pct}%</span>
  if (evPct >= 0.02) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
      +{pct}%
    </span>
  )
  return <span className="badge-neutral">{pct}%</span>
}

export default function EVFeedPage() {
  const [minEV, setMinEV] = useState(0)
  const [sport, setSport]  = useState('nba')
  const qc                 = useQueryClient()
  const { addItem }        = useBetSlipStore()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ev-feed', { minEV, sport }],
    queryFn: () => evApi.getFeed({ minEV, sport }),
    refetchInterval: 30_000,
  })

  const scanMutation = useMutation({
    mutationFn: () => evApi.scan(),
    onSuccess: () => {
      toast.success('EV scan complete!')
      qc.invalidateQueries({ queryKey: ['ev-feed'] })
    },
    onError: () => toast.error('Scan failed'),
  })

  const evItems: any[] = data?.data ?? []

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <TrendingUp size={18} className="text-gold-400" />
            EV Feed
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Expected value opportunities · auto-refreshes every 30s</p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="btn-primary"
        >
          <RefreshCw size={13} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning…' : 'Scan Markets'}
        </button>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Filter size={13} />
          <span className="text-xs font-medium">Filters</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="min-ev">Min EV</label>
          <select
            id="min-ev"
            value={minEV}
            onChange={e => setMinEV(Number(e.target.value))}
            className="input-field py-1.5 w-28 text-xs"
          >
            <option value={0}>Any</option>
            <option value={0.02}>+2%</option>
            <option value={0.05}>+5%</option>
            <option value={0.10}>+10%</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="sport">Sport</label>
          <select
            id="sport"
            value={sport}
            onChange={e => setSport(e.target.value)}
            className="input-field py-1.5 w-24 text-xs"
          >
            <option value="">All</option>
            <option value="nba">NBA</option>
            <option value="nfl">NFL</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Zap size={11} className="text-gold-500" />
          <span className="text-xs text-slate-500">{evItems.length} opportunities</span>
        </div>
      </div>

      {/* ── EV Table ────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="px-4 py-3.5">Matchup</th>
                <th className="px-4 py-3.5">Market</th>
                <th className="px-4 py-3.5">Outcome</th>
                <th className="px-4 py-3.5 text-right">Odds</th>
                <th className="px-4 py-3.5 text-right">True Prob</th>
                <th className="px-4 py-3.5 text-right">EV</th>
                <th className="px-4 py-3.5 text-right">Kelly</th>
                <th className="px-4 py-3.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="skeleton h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center"
                           style={{ background: 'rgba(239,68,68,0.1)' }}>
                        <TrendingUp size={20} className="text-red-500 opacity-50" />
                      </div>
                      <p className="text-slate-500 text-sm">Failed to load EV feed</p>
                      <p className="text-slate-700 text-xs">Check backend connection</p>
                    </div>
                  </td>
                </tr>
              ) : evItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <TrendingUp size={28} className="text-slate-700" />
                      <p className="text-slate-500 text-sm">No positive EV opportunities</p>
                      <p className="text-slate-700 text-xs">Click "Scan Markets" to update</p>
                    </div>
                  </td>
                </tr>
              ) : evItems.map((item: any) => (
                <tr key={item.id}>
                  <td className="py-3 px-4">
                    <p className="font-medium text-white text-xs">
                      {item.market?.event?.homeTeam?.abbreviation ?? 'HM'} vs {item.market?.event?.awayTeam?.abbreviation ?? 'AW'}
                    </p>
                    <p className="text-2xs text-slate-600 mt-0.5">
                      {item.market?.event?.startTime
                        ? new Date(item.market.event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">{item.market?.marketType ?? 'ML'}</td>
                  <td className="py-3 px-4 text-xs font-medium text-white">{item.outcome}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-mono text-xs text-slate-300">
                      {(item.bookOdds ?? 0) > 0 ? '+' : ''}{item.bookOdds}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-400">
                    {((item.trueProb ?? 0.5) * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right">
                    <EVBadge evPct={item.evPct ?? 0.05} />
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-500 font-mono">
                    {((item.kellyFraction ?? 0.02) * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => {
                        addItem({
                          eventId: item.market?.event?.id ?? '',
                          marketId: item.marketId ?? item.id,
                          eventName: `${item.market?.event?.homeTeam?.abbreviation} vs ${item.market?.event?.awayTeam?.abbreviation}`,
                          outcome: item.outcome,
                          odds: item.bookOdds,
                          ev: item.evPct,
                        })
                        toast.success('Added to bet slip')
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.2)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.4)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.1)'
                        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.2)'
                      }}
                      aria-label="Add to bet slip"
                    >
                      <Plus size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
