import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, RefreshCw, Zap } from 'lucide-react'
import { arbApi } from '../lib/api'
import toast from 'react-hot-toast'

const DEMO_ARB = [
  { id: '1', profitPct: 0.023, profit: 2.30, totalStake: 100, legs: [{ bookName: 'DraftKings', outcome: 'Home ML', odds: -115, stake: 53.5 }, { bookName: 'FanDuel', outcome: 'Away ML', odds: 125, stake: 46.5 }], event: { homeTeam: { name: 'Boston Celtics' }, awayTeam: { name: 'New York Knicks' } } },
  { id: '2', profitPct: 0.015, profit: 1.50, totalStake: 100, legs: [{ bookName: 'BetMGM', outcome: 'Over 224.5', odds: -108, stake: 51.9 }, { bookName: 'Caesars', outcome: 'Under 224.5', odds: 112, stake: 48.1 }], event: { homeTeam: { name: 'LA Lakers' }, awayTeam: { name: 'Golden State Warriors' } } },
]

export default function ArbitrageFeedPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['arb-feed'], queryFn: () => arbApi.getFeed() })
  const scanMutation = useMutation({
    mutationFn: () => arbApi.scan(),
    onSuccess: () => { toast.success('Arb scan complete!'); qc.invalidateQueries({ queryKey: ['arb-feed'] }) },
    onError: () => toast.error('Scan failed'),
  })

  const arbItems = data?.data?.length ? data.data : DEMO_ARB

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-blue-400" /> Arbitrage Feed
          </h1>
          <p className="text-slate-400 text-sm">Risk-free profit opportunities across books</p>
        </div>
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="btn-primary flex items-center gap-2">
          <RefreshCw size={15} className={scanMutation.isPending ? 'animate-spin' : ''} />
          Scan Books
        </button>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="card animate-pulse h-32" />
        ) : arbItems.map((arb: any) => (
          <div key={arb.id} className="card border-l-4 border-l-blue-500">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-white">
                  {arb.event?.homeTeam?.name ?? arb.market?.event?.homeTeam?.name ?? 'Team A'} vs{' '}
                  {arb.event?.awayTeam?.name ?? arb.market?.event?.awayTeam?.name ?? 'Team B'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Zap size={13} className="text-yellow-400" />
                  <span className="text-sm text-yellow-400 font-semibold">
                    +{((arb.profitPct ?? 0.02) * 100).toFixed(2)}% guaranteed profit
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-400">+${(arb.profit ?? 2.3).toFixed(2)}</p>
                <p className="text-xs text-slate-500">on ${arb.totalStake ?? 100} stake</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(arb.legs ?? []).map((leg: any, i: number) => (
                <div key={i} className="bg-dark-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">{leg.bookName}</p>
                  <p className="font-medium text-white">{leg.outcome}</p>
                  <div className="flex justify-between mt-1">
                    <span className={`font-bold ${leg.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                      {leg.odds > 0 ? '+' : ''}{leg.odds}
                    </span>
                    <span className="text-slate-400 text-sm">Stake: ${leg.stake?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
