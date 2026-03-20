import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Plus, Filter, Users } from 'lucide-react'
import { evApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

function EVBadge({ evPct }: { evPct: number }) {
  const pct = (evPct * 100).toFixed(1)
  if (evPct >= 0.05) return <span className="badge-positive">+{pct}% EV</span>
  if (evPct >= 0.02) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">+{pct}% EV</span>
  return <span className="badge-neutral">{pct}% EV</span>
}

function PublicBadge({ pctBets, pctMoney }: { pctBets: number; pctMoney: number }) {
  const betColor =
    pctBets >= 60 ? 'text-error'
    : pctBets <= 40 ? 'text-secondary'
    : 'text-on-surface-variant'
  const moneyColor =
    pctMoney >= 60 ? 'text-error'
    : pctMoney <= 40 ? 'text-secondary'
    : 'text-on-surface-variant'
  return (
    <div className="text-xs text-right leading-tight">
      <div className={`font-semibold ${betColor}`}>{pctBets.toFixed(0)}% <span className="text-on-surface-variant font-normal">bets</span></div>
      <div className={`font-semibold ${moneyColor}`}>{pctMoney.toFixed(0)}% <span className="text-on-surface-variant font-normal">$</span></div>
    </div>
  )
}

export default function EVFeedPage() {
  const [minEV, setMinEV] = useState(0)
  const [sport, setSport] = useState('nba')
  const [contrarian, setContrarian] = useState(false)
  const qc = useQueryClient()
  const { addItem } = useBetSlipStore()

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

  let evItems: any[] = data?.data ?? []

  // Contrarian filter: public ≤40% bets on this outcome (fading public)
  if (contrarian) {
    evItems = evItems.filter(
      (item: any) => item.publicSplit && item.publicSplit.pctBets <= 40,
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: '28px' }}>bolt</span>
            EV Feed
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Expected value betting opportunities with public money flow</p>
        </div>
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="btn-primary">
          <RefreshCw size={15} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning...' : 'Scan Markets'}
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-4">
        <Filter size={15} className="text-on-surface-variant" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Min EV:</span>
          <select value={minEV} onChange={e => setMinEV(Number(e.target.value))} className="input-field py-1 w-28">
            <option value={0}>Any</option>
            <option value={0.02}>+2%</option>
            <option value={0.05}>+5%</option>
            <option value={0.10}>+10%</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Sport:</span>
          <select value={sport} onChange={e => setSport(e.target.value)} className="input-field py-1 w-24">
            <option value="">All</option>
            <option value="nba">NBA</option>
            <option value="nfl">NFL</option>
          </select>
        </div>
        {/* Contrarian toggle */}
        <button
          onClick={() => setContrarian(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
            contrarian
              ? 'bg-secondary/15 border-secondary/40 text-secondary'
              : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
          }`}
        >
          <Users size={12} />
          Fade Public ({'\u2264'}40% bets)
        </button>
        <span className="text-sm text-on-surface-variant ml-auto">{evItems.length} opportunities</span>
      </div>

      {/* Public % legend */}
      <div className="flex items-center gap-4 text-xs text-on-surface-variant px-1">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-secondary/70" />Public ≤40% = Contrarian (sharp)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-error/70" />Public ≥60% = Heavy public side</span>
      </div>

      {/* EV Table */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
              <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Matchup</th>
              <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Market</th>
              <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Outcome</th>
              <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Odds</th>
              <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">True Prob</th>
              <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">EV</th>
              <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Public %</th>
              <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Kelly</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-outline-variant/5">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><div className="h-4 bg-surface-container-high rounded-lg animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr><td colSpan={9} className="py-12 text-center text-on-surface-variant">Failed to load EV feed — check backend connection</td></tr>
            ) : evItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-on-surface-variant">
                  {contrarian
                    ? 'No contrarian opportunities found (no markets with public ≤40% + positive EV)'
                    : 'No positive EV opportunities found — click "Scan Markets" to update'}
                </td>
              </tr>
            ) : evItems.map((item: any) => (
              <tr key={item.id} className="border-b border-outline-variant/5 hover:bg-surface-container-high/30 transition-colors">
                <td className="py-3 px-4">
                  <p className="font-medium text-on-surface">{item.market?.event?.homeTeam?.abbreviation ?? 'HM'} vs {item.market?.event?.awayTeam?.abbreviation ?? 'AW'}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {item.market?.event?.startTime
                      ? new Date(item.market.event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </p>
                </td>
                <td className="py-3 px-4 text-on-surface-variant">{item.market?.marketType ?? 'ML'}</td>
                <td className="py-3 px-4 text-on-surface font-medium">{item.outcome}</td>
                <td className="py-3 px-4 text-right font-mono text-on-surface">{item.bookOdds > 0 ? '+' : ''}{item.bookOdds}</td>
                <td className="py-3 px-4 text-right text-on-surface-variant">{((item.trueProb ?? 0.5) * 100).toFixed(1)}%</td>
                <td className="py-3 px-4 text-right"><EVBadge evPct={item.evPct ?? 0.05} /></td>
                <td className="py-3 px-4 text-right">
                  {item.publicSplit ? (
                    <PublicBadge
                      pctBets={item.publicSplit.pctBets}
                      pctMoney={item.publicSplit.pctMoney}
                    />
                  ) : (
                    <span className="text-on-surface-variant/40 text-xs">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-on-surface-variant">{((item.kellyFraction ?? 0.02) * 100).toFixed(1)}%</td>
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
                    className="p-1.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
