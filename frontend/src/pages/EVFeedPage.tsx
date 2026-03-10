import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, RefreshCw, Plus, Filter } from 'lucide-react'
import { evApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

function EVBadge({ evPct }: { evPct: number }) {
  const pct = (evPct * 100).toFixed(1)
  if (evPct >= 0.05) return <span className="badge-positive">+{pct}% EV</span>
  if (evPct >= 0.02) return <span className="text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full text-xs font-semibold">+{pct}% EV</span>
  return <span className="badge-neutral">{pct}% EV</span>
}


export default function EVFeedPage() {
  const [minEV, setMinEV] = useState(0)
  const [sport, setSport] = useState('nba')
  const qc = useQueryClient()
  const { addItem } = useBetSlipStore()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ev-feed', { minEV, sport }],
    queryFn: () => evApi.getFeed({ minEV, sport }),
    refetchInterval: 30_000, // auto-refresh every 30s to pick up new scan results
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-green-400" /> EV Feed
          </h1>
          <p className="text-slate-400 text-sm">Expected value betting opportunities</p>
        </div>
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="btn-primary flex items-center gap-2">
          <RefreshCw size={15} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning...' : 'Scan Markets'}
        </button>
      </div>

      {/* Filters */}
      <div className="card flex items-center gap-4">
        <Filter size={15} className="text-slate-400" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Min EV:</span>
          <select value={minEV} onChange={e => setMinEV(Number(e.target.value))} className="input-field py-1 w-28">
            <option value={0}>Any</option>
            <option value={0.02}>+2%</option>
            <option value={0.05}>+5%</option>
            <option value={0.10}>+10%</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Sport:</span>
          <select value={sport} onChange={e => setSport(e.target.value)} className="input-field py-1 w-24">
            <option value="">All</option>
            <option value="nba">NBA</option>
            <option value="nfl">NFL</option>
          </select>
        </div>
        <span className="text-sm text-slate-500 ml-auto">{evItems.length} opportunities</span>
      </div>

      {/* EV Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
              <th className="text-left py-3 px-4">Matchup</th>
              <th className="text-left py-3 px-4">Market</th>
              <th className="text-left py-3 px-4">Outcome</th>
              <th className="text-right py-3 px-4">Odds</th>
              <th className="text-right py-3 px-4">True Prob</th>
              <th className="text-right py-3 px-4">EV</th>
              <th className="text-right py-3 px-4">Kelly</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-500">Failed to load EV feed — check backend connection</td></tr>
            ) : evItems.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-slate-500">No positive EV opportunities found — click "Scan Markets" to update</td></tr>
            ) : evItems.map((item: any) => (
              <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                <td className="py-3 px-4">
                  <p className="font-medium text-white">{item.market?.event?.homeTeam?.abbreviation ?? 'HM'} vs {item.market?.event?.awayTeam?.abbreviation ?? 'AW'}</p>
                  <p className="text-xs text-slate-500">{item.market?.event?.startTime ? new Date(item.market.event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                </td>
                <td className="py-3 px-4 text-slate-400">{item.market?.marketType ?? 'ML'}</td>
                <td className="py-3 px-4 text-white font-medium">{item.outcome}</td>
                <td className="py-3 px-4 text-right font-mono">{item.bookOdds > 0 ? '+' : ''}{item.bookOdds}</td>
                <td className="py-3 px-4 text-right text-slate-300">{((item.trueProb ?? 0.5) * 100).toFixed(1)}%</td>
                <td className="py-3 px-4 text-right"><EVBadge evPct={item.evPct ?? 0.05} /></td>
                <td className="py-3 px-4 text-right text-slate-400">{((item.kellyFraction ?? 0.02) * 100).toFixed(1)}%</td>
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
                    className="p-1.5 rounded-lg bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 transition-colors"
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
