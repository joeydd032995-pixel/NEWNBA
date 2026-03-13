import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, RefreshCw, Zap, TrendingUp } from 'lucide-react'
import { arbApi } from '../lib/api'
import toast from 'react-hot-toast'

const DEMO_ARB = [
  {
    id: '1', profitPct: 0.023, profit: 2.30, totalStake: 100,
    legs: [
      { bookName: 'DraftKings', outcome: 'Home ML', odds: -115, stake: 53.5 },
      { bookName: 'FanDuel',    outcome: 'Away ML', odds: 125,  stake: 46.5 },
    ],
    event: { homeTeam: { name: 'Boston Celtics' }, awayTeam: { name: 'New York Knicks' } },
  },
  {
    id: '2', profitPct: 0.015, profit: 1.50, totalStake: 100,
    legs: [
      { bookName: 'BetMGM',   outcome: 'Over 224.5',  odds: -108, stake: 51.9 },
      { bookName: 'Caesars',  outcome: 'Under 224.5', odds: 112,  stake: 48.1 },
    ],
    event: { homeTeam: { name: 'LA Lakers' }, awayTeam: { name: 'Golden State Warriors' } },
  },
]

export default function ArbitrageFeedPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['arb-feed'], queryFn: () => arbApi.getFeed() })

  const scanMutation = useMutation({
    mutationFn: () => arbApi.scan(),
    onSuccess: () => {
      toast.success('Arb scan complete!')
      qc.invalidateQueries({ queryKey: ['arb-feed'] })
    },
    onError: () => toast.error('Scan failed'),
  })

  const arbItems: any[] = data?.data?.length ? data.data : DEMO_ARB

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <ArrowLeftRight size={18} className="text-cyan-400" />
            Arbitrage Feed
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Risk-free profit opportunities across books</p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="btn-primary"
        >
          <RefreshCw size={13} className={scanMutation.isPending ? 'animate-spin' : ''} />
          Scan Books
        </button>
      </div>

      {/* ── Arb cards ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="card h-36 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {arbItems.map((arb: any) => (
            <div
              key={arb.id}
              className="card-cyan relative overflow-hidden transition-all duration-200"
            >
              {/* Subtle background gradient */}
              <div className="absolute inset-0 pointer-events-none opacity-30"
                   style={{ background: 'radial-gradient(ellipse at top right, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />

              <div className="relative">
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {arb.event?.homeTeam?.name ?? arb.market?.event?.homeTeam?.name ?? 'Team A'} vs{' '}
                      {arb.event?.awayTeam?.name ?? arb.market?.event?.awayTeam?.name ?? 'Team B'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Zap size={11} className="text-gold-400" />
                      <span className="text-xs font-semibold text-gold-300">
                        +{((arb.profitPct ?? 0.02) * 100).toFixed(2)}% guaranteed profit
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className="text-2xl font-bold tracking-tight"
                      style={{ color: '#4ade80' }}
                    >
                      +${(arb.profit ?? 2.3).toFixed(2)}
                    </p>
                    <p className="text-2xs text-slate-600 mt-0.5">on ${arb.totalStake ?? 100} stake</p>
                  </div>
                </div>

                {/* Legs */}
                <div className="grid grid-cols-2 gap-2.5">
                  {(arb.legs ?? []).map((leg: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-xl p-3"
                      style={{
                        background: 'rgba(4,8,18,0.5)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp size={10} className="text-slate-600" />
                        <p className="text-2xs text-slate-500 font-medium uppercase tracking-wide">{leg.bookName}</p>
                      </div>
                      <p className="font-semibold text-white text-xs">{leg.outcome}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`font-bold text-sm font-mono ${leg.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                          {leg.odds > 0 ? '+' : ''}{leg.odds}
                        </span>
                        <span className="text-2xs text-slate-500">
                          Stake: <span className="text-slate-300 font-medium">${leg.stake?.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
