import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio, RefreshCw, TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react'
import { liveApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtOdds(odds: number) {
  return `${odds > 0 ? '+' : ''}${odds}`
}

function evColor(evPct: number) {
  if (evPct > 0.05) return 'text-green-400'
  if (evPct > 0.02) return 'text-yellow-400'
  if (evPct > 0)    return 'text-neon-blue-400'
  return 'text-slate-500'
}

function moveDir(dir: string) {
  return dir === 'steam' ? (
    <span className="flex items-center gap-0.5 text-green-400"><TrendingUp size={11} /> Steam</span>
  ) : (
    <span className="flex items-center gap-0.5 text-red-400"><TrendingDown size={11} /> Fade</span>
  )
}

// ─── Momentum Bar ────────────────────────────────────────────────────────────

function MomentumBar({
  awayAbbr, homeAbbr, homePct, awayScore, homeScore,
}: {
  awayAbbr: string; homeAbbr: string; homePct: number; awayScore: number; homeScore: number
}) {
  // homePct: share of total points scored by home team (50 = tied)
  const awayPct = 100 - homePct

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{awayAbbr} <span className="text-white font-bold">{awayScore}</span></span>
        <span className="text-slate-500 text-[10px]">
          {homePct === 50 ? 'Tied' : homePct > 50 ? `${homeAbbr} +${homeScore - awayScore}` : `${awayAbbr} +${awayScore - homeScore}`}
        </span>
        <span><span className="text-white font-bold">{homeScore}</span> {homeAbbr}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
        {/* Away side */}
        <div
          className="bg-gradient-to-r from-red-600 to-red-500 transition-all duration-700"
          style={{ width: `${awayPct}%` }}
        />
        {/* Home side */}
        <div
          className="transition-all duration-700"
          style={{ background: 'linear-gradient(to right, #000370, #00d4ff)', width: `${homePct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
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
    <div className={`card border ${isLive ? 'border-red-700/50' : 'border-slate-700'}`}>
      {/* Status + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-xs text-slate-500 bg-slate-800 rounded px-2 py-0.5">Upcoming</span>
          )}
          {isLive && event.period && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} />
              {event.period}{event.timeRemaining ? ` · ${event.timeRemaining}` : ''}
            </span>
          )}
        </div>
        {!isLive && (
          <span className="text-xs text-slate-500">
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
          <span className="text-white font-medium">{event.awayTeam.abbr}</span>
          <span className="text-slate-500">@</span>
          <span className="text-white font-medium">{event.homeTeam.abbr}</span>
        </div>
      )}

      {/* Markets */}
      {markets.length > 0 && (
        <div className="mt-3 space-y-2">
          {markets.map((market: any) => (
            <div key={market.id} className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
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
                      className={`text-left p-2 rounded border transition-colors ${
                        (o.evPct ?? 0) > 0
                          ? 'border-green-700/50 bg-green-900/20 hover:bg-green-900/30'
                          : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-300 capitalize font-medium">{o.outcome}</span>
                        <span className={`text-xs font-mono font-bold ${o.odds > 0 ? 'text-green-400' : 'text-slate-200'}`}>
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
      <div className="card text-center text-slate-500 text-sm py-8">
        No significant line movements in the last hour — movements appear when odds shift ≥3% implied probability.
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider">
            <th className="text-left py-2.5 px-4">Game</th>
            <th className="text-left py-2.5 px-4">Market</th>
            <th className="text-left py-2.5 px-4">Outcome</th>
            <th className="text-right py-2.5 px-4">Was</th>
            <th className="text-right py-2.5 px-4">Now</th>
            <th className="text-right py-2.5 px-4">Move</th>
            <th className="text-left py-2.5 px-4">Signal</th>
            <th className="text-left py-2.5 px-4">Book</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {moves.map((m: any, i: number) => (
            <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${
              m.event?.status === 'LIVE' ? 'bg-red-900/5' : ''
            }`}>
              <td className="py-2.5 px-4">
                <div className="font-medium text-white">
                  {m.event?.away} @ {m.event?.home}
                </div>
                {m.event?.status === 'LIVE' && m.event?.period && (
                  <div className="text-red-400 text-[10px]">
                    LIVE · {m.event.period}
                    {m.event.homeScore != null && ` · ${m.event.awayScore}–${m.event.homeScore}`}
                  </div>
                )}
                {m.player && <div className="text-primary-400 text-[10px]">{m.player}</div>}
              </td>
              <td className="py-2.5 px-4 text-slate-400">{m.marketType}</td>
              <td className="py-2.5 px-4">
                <span className={`capitalize font-medium ${
                  ['over', 'home'].includes(m.outcome) ? 'text-green-400' : 'text-slate-300'
                }`}>
                  {m.outcome}
                </span>
              </td>
              <td className="py-2.5 px-4 text-right font-mono text-slate-400">{fmtOdds(m.oldOdds)}</td>
              <td className="py-2.5 px-4 text-right font-mono text-white font-medium">{fmtOdds(m.newOdds)}</td>
              <td className="py-2.5 px-4 text-right">
                <span className={`font-semibold ${m.movePct >= 5 ? 'text-yellow-300' : 'text-slate-300'}`}>
                  {m.movePct}%
                </span>
              </td>
              <td className="py-2.5 px-4">{moveDir(m.direction)}</td>
              <td className="py-2.5 px-4 text-slate-500 capitalize">{m.bookName}</td>
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio size={20} className="text-red-400" />
            Live Betting
            {liveGames.length > 0 && (
              <span className="flex items-center gap-1 text-sm font-normal text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {liveGames.length} Live
              </span>
            )}
          </h1>
          <p className="text-slate-400 text-sm">
            Live scoreboards · momentum · real-time line movements · auto-refreshes every 15s
          </p>
        </div>
        <button
          onClick={() => { gamesQuery.refetch(); movesQuery.refetch() }}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={14} className={gamesQuery.isFetching || movesQuery.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { key: 'games',     label: `Games (${games.length})` },
          { key: 'movements', label: `Line Movements (${moves.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === key
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
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
                <div key={i} className="card animate-pulse h-48 bg-slate-800" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <Radio size={36} className="mx-auto mb-3 opacity-20" />
              No NBA games right now. Check back on game day.
            </div>
          ) : (
            <>
              {liveGames.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> In Progress
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
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
            <span className="text-sm text-slate-400">Min move:</span>
            {[2, 3, 5, 8].map(t => (
              <button
                key={t}
                onClick={() => setThreshold(t)}
                className={`px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${
                  threshold === t
                    ? 'bg-primary-600/30 border-primary-500/50 text-primary-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {t}%
              </button>
            ))}
            <span className="text-xs text-slate-500 ml-2">implied probability shift · last 60 min</span>
          </div>

          {movesQuery.isLoading ? (
            <div className="card animate-pulse h-48" />
          ) : (
            <LineMovementFeed moves={moves} />
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
            <span className="flex items-center gap-1"><TrendingUp size={11} className="text-green-400" /> Steam = sharp money moving odds shorter (more likely)</span>
            <span className="flex items-center gap-1"><TrendingDown size={11} className="text-red-400" /> Fade = odds drifting out (less likely)</span>
          </div>
        </>
      )}
    </div>
  )
}
