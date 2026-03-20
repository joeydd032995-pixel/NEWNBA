import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react'
import { liveApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtOdds(odds: number) {
  return `${odds > 0 ? '+' : ''}${odds}`
}

function evColor(evPct: number) {
  if (evPct > 0.05) return 'text-secondary'
  if (evPct > 0.02) return 'text-yellow-400'
  if (evPct > 0)    return 'text-primary'
  return 'text-on-surface-variant'
}

function moveDir(dir: string) {
  return dir === 'steam' ? (
    <span className="flex items-center gap-0.5 text-secondary"><TrendingUp size={11} /> Steam</span>
  ) : (
    <span className="flex items-center gap-0.5 text-error"><TrendingDown size={11} /> Fade</span>
  )
}

// ─── Momentum Bar ────────────────────────────────────────────────────────────

function MomentumBar({
  awayAbbr, homeAbbr, homePct, awayScore, homeScore,
}: {
  awayAbbr: string; homeAbbr: string; homePct: number; awayScore: number; homeScore: number
}) {
  const awayPct = 100 - homePct

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-on-surface-variant mb-1">
        <span>{awayAbbr} <span className="text-on-surface font-headline font-bold">{awayScore}</span></span>
        <span className="text-on-surface-variant/60 text-[10px]">
          {homePct === 50 ? 'Tied' : homePct > 50 ? `${homeAbbr} +${homeScore - awayScore}` : `${awayAbbr} +${awayScore - homeScore}`}
        </span>
        <span><span className="text-on-surface font-headline font-bold">{homeScore}</span> {homeAbbr}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-container-highest">
        {/* Away side */}
        <div
          className="bg-gradient-to-r from-error/80 to-error/60 transition-all duration-700"
          style={{ width: `${awayPct}%` }}
        />
        {/* Home side */}
        <div
          className="transition-all duration-700"
          style={{ background: 'linear-gradient(to right, rgba(223,142,255,0.7), rgba(0,244,254,0.7))', width: `${homePct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-on-surface-variant/50 mt-0.5">
        <span>{awayPct}% scoring</span>
        <span>{homePct}% scoring</span>
      </div>
    </div>
  )
}

// ─── Live Game Card ──────────────────────────────────────────────────────────

function LiveGameCard({ game, onAddBet }: { game: any; onAddBet: (item: any) => void }) {
  const { event, momentum, markets } = game
  const isLive = event.status === 'LIVE'

  return (
    <div className={`bg-surface-container-low rounded-xl border p-5 transition-all ${isLive ? 'border-error/30' : 'border-outline-variant/10'}`}>
      {/* Status + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-error bg-error/12 border border-error/25 rounded-lg px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-xs text-on-surface-variant bg-surface-container-high rounded-lg px-2 py-0.5">Upcoming</span>
          )}
          {isLive && event.period && (
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <Clock size={10} />
              {event.period}{event.timeRemaining ? ` · ${event.timeRemaining}` : ''}
            </span>
          )}
        </div>
        {!isLive && (
          <span className="text-xs text-on-surface-variant">
            {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Scoreboard */}
      {isLive ? (
        <MomentumBar
          awayAbbr={event.awayTeam.abbr}
          homeAbbr={event.homeTeam.abbr}
          homePct={momentum.homePct}
          awayScore={event.awayScore}
          homeScore={event.homeScore}
        />
      ) : (
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-on-surface font-headline font-bold">{event.awayTeam.abbr}</span>
          <span className="text-on-surface-variant">@</span>
          <span className="text-on-surface font-headline font-bold">{event.homeTeam.abbr}</span>
        </div>
      )}

      {/* Markets */}
      {markets.length > 0 && (
        <div className="mt-4 space-y-2">
          {markets.map((market: any) => (
            <div key={market.id} className="bg-surface-container-high/60 rounded-xl p-3 border border-outline-variant/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {market.marketType}
                </span>
                {market.lineMovements.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                    <Zap size={9} /> Movement
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {market.outcomes.map((o: any) => {
                  const move = market.lineMovements.find((m: any) => m.outcome === o.outcome)
                  return (
                    <button
                      key={o.outcome}
                      onClick={() => onAddBet({
                        id: `${market.id}-${o.outcome}`,
                        outcome: `${event.awayTeam.abbr} @ ${event.homeTeam.abbr} — ${market.marketType} ${o.outcome}`,
                        eventName: `${event.awayTeam.abbr} @ ${event.homeTeam.abbr}`,
                        odds: o.odds,
                        stake: 10,
                      })}
                      className={`text-left p-2.5 rounded-xl border transition-colors ${
                        (o.evPct ?? 0) > 0
                          ? 'border-secondary/25 bg-secondary/8 hover:bg-secondary/15'
                          : 'border-outline-variant/10 bg-surface-container-highest hover:bg-surface-bright'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-on-surface-variant capitalize font-medium">{o.outcome}</span>
                        <span className={`text-xs font-mono font-bold ${o.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>
                          {fmtOdds(o.odds)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className={`text-[10px] ${evColor(o.evPct ?? 0)}`}>
                          {(o.evPct ?? 0) > 0 ? `+${((o.evPct ?? 0) * 100).toFixed(1)}%` : `${((o.evPct ?? 0) * 100).toFixed(1)}%`} EV
                        </span>
                        {move && (
                          <span className="text-[10px]">{moveDir(move.direction)}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Line Movement Ticker ────────────────────────────────────────────────────

function LineMovementFeed({ moves }: { moves: any[] }) {
  if (moves.length === 0) {
    return (
      <div className="card text-center text-on-surface-variant text-sm py-10">
        No significant line movements in the last hour — movements appear when odds shift ≥3% implied probability.
      </div>
    )
  }

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
            <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Game</th>
            <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Market</th>
            <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Outcome</th>
            <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Was</th>
            <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Now</th>
            <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Move</th>
            <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Signal</th>
            <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Book</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/5">
          {moves.map((m: any, i: number) => (
            <tr key={i} className={`hover:bg-surface-container-high/30 transition-colors ${
              m.event?.status === 'LIVE' ? 'bg-error/4' : ''
            }`}>
              <td className="py-2.5 px-4">
                <div className="font-medium text-on-surface">
                  {m.event?.away} @ {m.event?.home}
                </div>
                {m.event?.status === 'LIVE' && m.event?.period && (
                  <div className="text-error text-[10px]">
                    LIVE · {m.event.period}
                    {m.event.homeScore != null && ` · ${m.event.awayScore}–${m.event.homeScore}`}
                  </div>
                )}
                {m.player && <div className="text-primary text-[10px]">{m.player}</div>}
              </td>
              <td className="py-2.5 px-4 text-on-surface-variant">{m.marketType}</td>
              <td className="py-2.5 px-4">
                <span className={`capitalize font-medium ${
                  ['over', 'home'].includes(m.outcome) ? 'text-secondary' : 'text-on-surface'
                }`}>
                  {m.outcome}
                </span>
              </td>
              <td className="py-2.5 px-4 text-right font-mono text-on-surface-variant">{fmtOdds(m.oldOdds)}</td>
              <td className="py-2.5 px-4 text-right font-mono text-on-surface font-medium">{fmtOdds(m.newOdds)}</td>
              <td className="py-2.5 px-4 text-right">
                <span className={`font-bold ${m.movePct >= 5 ? 'text-yellow-300' : 'text-on-surface-variant'}`}>
                  {m.movePct}%
                </span>
              </td>
              <td className="py-2.5 px-4">{moveDir(m.direction)}</td>
              <td className="py-2.5 px-4 text-on-surface-variant capitalize">{m.bookName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LiveBettingPage() {
  const [tab, setTab] = useState<'games' | 'movements'>('games')
  const [threshold, setThreshold] = useState(3)
  const { addItem } = useBetSlipStore()

  const gamesQuery = useQuery({
    queryKey: ['live-games'],
    queryFn: () => liveApi.getGames(),
    refetchInterval: 15_000,
    select: (r) => r.data as any[],
  })

  const movesQuery = useQuery({
    queryKey: ['line-movements', threshold],
    queryFn: () => liveApi.getLineMovements(threshold),
    refetchInterval: 20_000,
    select: (r) => r.data as any[],
  })

  const games = gamesQuery.data ?? []
  const moves = movesQuery.data ?? []
  const liveGames = games.filter((g: any) => g.event.status === 'LIVE')
  const scheduled  = games.filter((g: any) => g.event.status !== 'LIVE')

  const handleAddBet = (item: any) => {
    addItem(item)
    toast.success('Added to bet slip')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-error" style={{ fontSize: '28px' }}>sensors</span>
            Live Betting
            {liveGames.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-normal text-error bg-error/12 border border-error/25 rounded-lg px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                {liveGames.length} Live
              </span>
            )}
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Live scoreboards · momentum · real-time line movements · auto-refreshes every 15s
          </p>
        </div>
        <button
          onClick={() => { gamesQuery.refetch(); movesQuery.refetch() }}
          className="btn-secondary"
        >
          <RefreshCw size={14} className={gamesQuery.isFetching || movesQuery.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant/10">
        {([
          { key: 'games',     label: `Games (${games.length})` },
          { key: 'movements', label: `Line Movements (${moves.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-headline font-bold transition-colors border-b-2 ${
              tab === key
                ? 'border-error text-error'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'games' ? (
        <>
          {gamesQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card animate-pulse h-48 bg-surface-container-high" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="card text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined opacity-20 mb-3" style={{ fontSize: '40px', display: 'block' }}>sensors</span>
              No NBA games right now. Check back on game day.
            </div>
          ) : (
            <>
              {liveGames.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-error uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse inline-block" /> In Progress
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {liveGames.map((g: any) => (
                      <LiveGameCard key={g.event.id} game={g} onAddBet={handleAddBet} />
                    ))}
                  </div>
                </div>
              )}
              {scheduled.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">
                    Upcoming
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {scheduled.map((g: any) => (
                      <LiveGameCard key={g.event.id} game={g} onAddBet={handleAddBet} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Threshold control */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-on-surface-variant">Min move:</span>
            {[2, 3, 5, 8].map(t => (
              <button
                key={t}
                onClick={() => setThreshold(t)}
                className={`px-3 py-1.5 text-xs rounded-xl border font-bold transition-colors ${
                  threshold === t
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
                }`}
              >
                {t}%
              </button>
            ))}
            <span className="text-xs text-on-surface-variant ml-2">implied probability shift · last 60 min</span>
          </div>

          {movesQuery.isLoading ? (
            <div className="card animate-pulse h-48" />
          ) : (
            <LineMovementFeed moves={moves} />
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant px-1">
            <span className="flex items-center gap-1.5"><TrendingUp size={11} className="text-secondary" /> Steam = sharp money moving odds shorter (more likely)</span>
            <span className="flex items-center gap-1.5"><TrendingDown size={11} className="text-error" /> Fade = odds drifting out (less likely)</span>
          </div>
        </>
      )}
    </div>
  )
}
