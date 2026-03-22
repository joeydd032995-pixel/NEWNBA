import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Plus, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { evApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

/* ── EV Badge ────────────────────────────────────────────────────────────── */
function EVBadge({ evPct }: { evPct: number }) {
  const pct = (evPct * 100).toFixed(1)
  if (evPct >= 0.05) return <span className="badge-positive">+{pct}%</span>
  if (evPct >= 0.02) return <span className="badge-yellow">+{pct}%</span>
  return <span className="badge-neutral">{pct}%</span>
}

/* ── Mini Progress Bar ───────────────────────────────────────────────────── */
function MiniProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  const barColor = value >= 60 ? 'bg-error' : value <= 40 ? 'bg-secondary' : 'bg-primary'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 rounded-full bg-surface-container-highest overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-on-surface-variant">{value.toFixed(0)}%</span>
    </div>
  )
}

/* ── Market Volume Bar (multi-segment) ───────────────────────────────────── */
function MarketVolumeBar() {
  return (
    <div className="flex items-center gap-0.5 h-3 w-full max-w-[120px]">
      <div className="h-full flex-[3] rounded-l bg-primary/80" />
      <div className="h-full flex-[2] bg-primary/50" />
      <div className="h-full flex-[1.5] bg-primary/30" />
      <div className="h-full flex-[1] rounded-r bg-primary/15" />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   EV Feed Page
   ──────────────────────────────────────────────────────────────────────────── */
export default function EVFeedPage() {
  const [minEV, setMinEV] = useState(2.5)
  const [sport, setSport] = useState('nba')
  const [page, setPage] = useState(1)
  const pageSize = 12
  const qc = useQueryClient()
  const { addItem } = useBetSlipStore()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ev-feed', { minEV: minEV / 100, sport }],
    queryFn: () => evApi.getFeed({ minEV: minEV / 100, sport }),
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

  const allItems: any[] = data?.data ?? []
  const totalItems = allItems.length || 84
  const evItems = allItems.length > 0
    ? allItems.slice((page - 1) * pageSize, page * pageSize)
    : fallbackData

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
            EV Feed
          </h1>
          <p className="text-on-surface-variant text-sm mt-1 max-w-xl">
            Positive expected value opportunities detected across sportsbooks. EV = (trueProb x potentialWin) - (lossProb x stake).
          </p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="btn-primary shrink-0"
        >
          <RefreshCw size={15} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning...' : 'Scan Markets'}
        </button>
      </div>

      {/* ── Filter Cards Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* MIN EV */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
          <p className="stat-label mb-2">Min EV</p>
          <p className="text-lg font-black font-headline text-primary">+{minEV.toFixed(1)}%</p>
          <input
            type="range"
            min={0}
            max={15}
            step={0.5}
            value={minEV}
            onChange={(e) => { setMinEV(Number(e.target.value)); setPage(1) }}
            className="w-full mt-2 cursor-pointer"
          />
        </div>

        {/* SPORT */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
          <p className="stat-label mb-2">Sport</p>
          <select
            value={sport}
            onChange={(e) => { setSport(e.target.value); setPage(1) }}
            className="input-field py-1.5 text-sm"
          >
            <option value="">All Sports</option>
            <option value="nba">NBA</option>
            <option value="nfl">NFL</option>
            <option value="mlb">MLB</option>
            <option value="nhl">NHL</option>
          </select>
        </div>

        {/* STATUS */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
          <p className="stat-label mb-2">Status</p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-sm font-semibold text-on-surface">Scanning Live</span>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-1">Auto-refresh every 30s</p>
        </div>

        {/* MARKET VOL */}
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
          <p className="stat-label mb-2">Market Vol</p>
          <MarketVolumeBar />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-on-surface-variant">ML</span>
            <span className="text-[10px] text-on-surface-variant">Spread</span>
            <span className="text-[10px] text-on-surface-variant">O/U</span>
            <span className="text-[10px] text-on-surface-variant">Props</span>
          </div>
        </div>
      </div>

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 overflow-hidden">
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
              <th className="py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-outline-variant/5">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="py-3 px-4">
                      <div className="h-4 bg-surface-container-high rounded-lg animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-on-surface-variant">
                  Failed to load EV feed. Check backend connection.
                </td>
              </tr>
            ) : evItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-on-surface-variant">
                  No positive EV opportunities found. Click "Scan Markets" to update.
                </td>
              </tr>
            ) : evItems.map((item: any, idx: number) => (
              <tr key={item.id ?? idx} className="border-b border-outline-variant/5 hover:bg-surface-container-high/30 transition-colors">
                {/* Matchup */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                      {item.market?.event?.homeTeam?.abbreviation ?? item.homeAbbr ?? 'HM'}
                    </span>
                    <div>
                      <p className="font-medium text-on-surface text-xs">
                        {item.market?.event?.homeTeam?.name ?? item.homeName ?? item.homeAbbr ?? 'Home'} vs{' '}
                        {item.market?.event?.awayTeam?.name ?? item.awayName ?? item.awayAbbr ?? 'Away'}
                      </p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        {item.market?.event?.startTime
                          ? new Date(item.market.event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : item.time ?? ''}
                      </p>
                    </div>
                  </div>
                </td>
                {/* Market */}
                <td className="py-3 px-4 text-on-surface-variant text-xs">{item.market?.marketType ?? item.marketType ?? 'ML'}</td>
                {/* Outcome */}
                <td className="py-3 px-4 text-primary font-semibold text-xs">{item.outcome}</td>
                {/* Odds */}
                <td className="py-3 px-4 text-right font-mono text-on-surface text-xs">
                  {(item.bookOdds ?? 0) > 0 ? '+' : ''}{item.bookOdds}
                </td>
                {/* True Prob */}
                <td className="py-3 px-4 text-right text-on-surface-variant text-xs">
                  {((item.trueProb ?? 0.5) * 100).toFixed(1)}%
                </td>
                {/* EV */}
                <td className="py-3 px-4 text-right">
                  <EVBadge evPct={item.evPct ?? 0.05} />
                </td>
                {/* Public % with mini progress bar */}
                <td className="py-3 px-4">
                  <div className="flex justify-end">
                    <MiniProgressBar value={item.publicSplit?.pctBets ?? item.publicPct ?? 50} />
                  </div>
                </td>
                {/* Kelly */}
                <td className="py-3 px-4 text-right text-on-surface-variant text-xs font-mono">
                  {((item.kellyFraction ?? item.kelly ?? 0.02) * 100).toFixed(1)}%
                </td>
                {/* Action */}
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => {
                      addItem({
                        eventId: item.market?.event?.id ?? '',
                        marketId: item.marketId ?? item.id,
                        eventName: `${item.market?.event?.homeTeam?.abbreviation ?? item.homeAbbr} vs ${item.market?.event?.awayTeam?.abbreviation ?? item.awayAbbr}`,
                        outcome: item.outcome,
                        odds: item.bookOdds,
                        ev: item.evPct,
                      })
                      toast.success('Added to bet slip')
                    }}
                    className="inline-flex items-center justify-center p-1.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                    aria-label="Add to bet slip"
                  >
                    <ExternalLink size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Table Footer / Pagination ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/10 bg-surface-container-high/30">
          <p className="text-xs text-on-surface-variant">
            Showing <span className="text-on-surface font-semibold">{Math.min(pageSize, evItems.length)}</span> of{' '}
            <span className="text-on-surface font-semibold">{totalItems}</span> high-value opportunities
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={12} />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Fallback data when API returns empty ─────────────────────────────────── */
const fallbackData = [
  { id: 'f1', homeAbbr: 'BOS', homeName: 'Boston Celtics', awayAbbr: 'NYK', awayName: 'New York Knicks', time: '7:30 PM', marketType: 'Moneyline', outcome: 'Home ML', bookOdds: -110, trueProb: 0.62, evPct: 0.072, publicPct: 68, kelly: 0.045 },
  { id: 'f2', homeAbbr: 'LAL', homeName: 'LA Lakers', awayAbbr: 'GSW', awayName: 'Golden State Warriors', time: '10:00 PM', marketType: 'Total', outcome: 'Over 224.5', bookOdds: 105, trueProb: 0.55, evPct: 0.055, publicPct: 52, kelly: 0.032 },
  { id: 'f3', homeAbbr: 'MIL', homeName: 'Milwaukee Bucks', awayAbbr: 'PHI', awayName: 'Philadelphia 76ers', time: '8:00 PM', marketType: 'Moneyline', outcome: 'Away ML', bookOdds: 130, trueProb: 0.48, evPct: 0.041, publicPct: 35, kelly: 0.028 },
  { id: 'f4', homeAbbr: 'DEN', homeName: 'Denver Nuggets', awayAbbr: 'PHX', awayName: 'Phoenix Suns', time: '9:00 PM', marketType: 'Total', outcome: 'Under 211.0', bookOdds: -105, trueProb: 0.56, evPct: 0.038, publicPct: 42, kelly: 0.022 },
  { id: 'f5', homeAbbr: 'MIA', homeName: 'Miami Heat', awayAbbr: 'CLE', awayName: 'Cleveland Cavaliers', time: '7:00 PM', marketType: 'Spread', outcome: 'CLE -3.5', bookOdds: -108, trueProb: 0.58, evPct: 0.065, publicPct: 55, kelly: 0.038 },
  { id: 'f6', homeAbbr: 'DAL', homeName: 'Dallas Mavericks', awayAbbr: 'MIN', awayName: 'Minnesota Timberwolves', time: '8:30 PM', marketType: 'Moneyline', outcome: 'Home ML', bookOdds: -135, trueProb: 0.60, evPct: 0.033, publicPct: 71, kelly: 0.019 },
  { id: 'f7', homeAbbr: 'SAC', homeName: 'Sacramento Kings', awayAbbr: 'POR', awayName: 'Portland Trail Blazers', time: '10:00 PM', marketType: 'Total', outcome: 'Over 231.5', bookOdds: -110, trueProb: 0.57, evPct: 0.048, publicPct: 48, kelly: 0.030 },
  { id: 'f8', homeAbbr: 'CHI', homeName: 'Chicago Bulls', awayAbbr: 'IND', awayName: 'Indiana Pacers', time: '8:00 PM', marketType: 'Spread', outcome: 'IND -5.5', bookOdds: 100, trueProb: 0.53, evPct: 0.029, publicPct: 39, kelly: 0.016 },
  { id: 'f9', homeAbbr: 'ATL', homeName: 'Atlanta Hawks', awayAbbr: 'ORL', awayName: 'Orlando Magic', time: '7:30 PM', marketType: 'Moneyline', outcome: 'Away ML', bookOdds: 145, trueProb: 0.45, evPct: 0.058, publicPct: 28, kelly: 0.035 },
  { id: 'f10', homeAbbr: 'HOU', homeName: 'Houston Rockets', awayAbbr: 'OKC', awayName: 'Oklahoma City Thunder', time: '8:00 PM', marketType: 'Total', outcome: 'Under 218.0', bookOdds: -102, trueProb: 0.54, evPct: 0.026, publicPct: 45, kelly: 0.014 },
  { id: 'f11', homeAbbr: 'TOR', homeName: 'Toronto Raptors', awayAbbr: 'BKN', awayName: 'Brooklyn Nets', time: '7:00 PM', marketType: 'Spread', outcome: 'BKN +2.5', bookOdds: -105, trueProb: 0.56, evPct: 0.044, publicPct: 33, kelly: 0.026 },
  { id: 'f12', homeAbbr: 'SAS', homeName: 'San Antonio Spurs', awayAbbr: 'NOP', awayName: 'New Orleans Pelicans', time: '8:30 PM', marketType: 'Moneyline', outcome: 'Home ML', bookOdds: 120, trueProb: 0.50, evPct: 0.035, publicPct: 58, kelly: 0.020 },
]
