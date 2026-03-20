import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import { playerPropsApi, sportsApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'
import { PlayerCheatSheetDrawer } from '../components/PlayerCheatSheetDrawer'

const STAT_TYPES = [
  { value: '', label: 'ALL' },
  { value: 'POINTS', label: 'PTS' },
  { value: 'REBOUNDS', label: 'REB' },
  { value: 'ASSISTS', label: 'AST' },
  { value: 'THREES', label: '3PT' },
  { value: 'PRA', label: 'PRA' },
  { value: 'PR', label: 'P+R' },
  { value: 'PA', label: 'P+A' },
  { value: 'RA', label: 'R+A' },
  { value: 'STEALS', label: 'STLS' },
  { value: 'BLOCKS', label: 'BLKS' },
  { value: 'MINUTES', label: 'MIN' },
]

const LAST_N_OPTIONS = [5, 10, 15, 20]

function hitRateColor(pct: number) {
  if (pct >= 70) return 'text-secondary'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-error'
}

function evColor(evPct: number) {
  if (evPct > 0.05) return 'bg-secondary/15 text-secondary border-secondary/30'
  if (evPct > 0.02) return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
  if (evPct > 0)    return 'bg-primary/15 text-primary border-primary/30'
  return 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20'
}

function statBlockColors(pct: number) {
  if (pct >= 70) return 'bg-secondary/20 border-secondary/40 text-secondary'
  if (pct >= 56) return 'bg-secondary/10 border-secondary/20 text-secondary'
  if (pct >= 45) return 'bg-surface-container-highest border-outline-variant/20 text-on-surface-variant'
  if (pct >= 30) return 'bg-error/10 border-error/20 text-error'
  return 'bg-error/20 border-error/40 text-error'
}

function defRankColors(rank: number, total: number) {
  const pct = rank / (total || 30)
  if (pct <= 0.17) return 'bg-error/25 border-error/50 text-error'
  if (pct <= 0.33) return 'bg-error/15 border-error/30 text-error'
  if (pct <= 0.50) return 'bg-error/8 border-error/15 text-error'
  if (pct <= 0.67) return 'bg-secondary/8 border-secondary/15 text-secondary'
  if (pct <= 0.83) return 'bg-secondary/15 border-secondary/30 text-secondary'
  return 'bg-secondary/25 border-secondary/50 text-secondary'
}

function AnalyzerBlock({ label, value, sublabel, colorClass }: {
  label: string
  value: string
  sublabel?: string
  colorClass: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2 min-w-[90px] ${colorClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-lg font-headline font-black leading-tight">{value}</p>
      {sublabel && <p className="text-[10px] opacity-60 mt-0.5">{sublabel}</p>}
    </div>
  )
}

function AnalyzerRow({ marketId, row }: { marketId: string; row: any }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    playerPropsApi.getAnalyzerData(marketId)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [marketId])

  if (loading) return (
    <tr>
      <td colSpan={11} className="px-4 py-3 bg-surface-container/50 border-b border-outline-variant/5">
        <div className="text-xs text-on-surface-variant animate-pulse">Loading analyzer…</div>
      </td>
    </tr>
  )

  if (!data) return (
    <tr>
      <td colSpan={11} className="px-4 py-3 bg-surface-container/50 border-b border-outline-variant/5">
        <div className="text-xs text-on-surface-variant">No analyzer data available.</div>
      </td>
    </tr>
  )

  const direction = row.bestEV.outcome as 'over' | 'under'
  const l5Rate  = direction === 'over' ? row.hitRate.l5  : row.hitRate.l5Under
  const l15Rate = direction === 'over' ? row.hitRate.l15 : row.hitRate.l15Under

  return (
    <tr>
      <td colSpan={11} className="px-4 py-3 bg-surface-container/50 border-b border-outline-variant/5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-wide font-black mr-1">Analyzer</span>

          <AnalyzerBlock
            label="Opp Defense"
            value={`#${data.defRank}`}
            sublabel={`${data.defAvgAllowed} avg · Lg ${data.leagueAvg}`}
            colorClass={defRankColors(data.defRank, data.defRankTotal)}
          />

          <AnalyzerBlock
            label={`${direction.toUpperCase()} L5`}
            value={`${l5Rate}%`}
            colorClass={statBlockColors(l5Rate)}
          />

          <AnalyzerBlock
            label={`${direction.toUpperCase()} L15`}
            value={`${l15Rate}%`}
            colorClass={statBlockColors(l15Rate)}
          />

          <AnalyzerBlock
            label="Season"
            value={data.seasonHitRate !== null ? `${data.seasonHitRate}%` : 'N/A'}
            sublabel={data.seasonGames > 0 ? `${data.seasonGames}g` : undefined}
            colorClass={
              data.seasonHitRate !== null
                ? statBlockColors(data.seasonHitRate)
                : 'bg-surface-container-highest border-outline-variant/20 text-on-surface-variant'
            }
          />

          <AnalyzerBlock
            label="H2H"
            value={data.h2hHitRate !== null ? `${data.h2hHitRate}%` : 'N/A'}
            sublabel={data.h2hGames > 0 ? `${data.h2hGames}g` : undefined}
            colorClass={
              data.h2hHitRate !== null
                ? statBlockColors(data.h2hHitRate)
                : 'bg-surface-container-highest border-outline-variant/20 text-on-surface-variant'
            }
          />
        </div>
      </td>
    </tr>
  )
}

export default function PlayerPropsPage() {
  const { addItem } = useBetSlipStore()

  // Filters
  const [statType, setStatType]       = useState('')
  const [overUnder, setOverUnder]     = useState<'over' | 'under' | 'both'>('both')
  const [lastN, setLastN]             = useState(10)
  const [minOdds, setMinOdds]         = useState(-1000)
  const [maxOdds, setMaxOdds]         = useState(1000)
  const [minHitRate, setMinHitRate]   = useState(0)
  const [maxHitRate, setMaxHitRate]   = useState(100)
  const [gameId, setGameId]           = useState('')

  // Data
  const [props, setProps]       = useState<any[]>([])
  const [games, setGames]       = useState<any[]>([])
  const [loading, setLoading]   = useState(false)

  // Analyzer expand state
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Cheat sheet drawer
  const [cheatSheet, setCheatSheet] = useState<{
    playerId: string; playerName: string; statType: string; line: number
  } | null>(null)

  const fetchGames = useCallback(async () => {
    try {
      const { data } = await sportsApi.getEvents('nba', { status: 'SCHEDULED' })
      setGames(data?.events ?? data ?? [])
    } catch {}
  }, [])

  const fetchProps = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { lastN, minOdds, maxOdds, minHitRate, maxHitRate, overUnder, limit: 200 }
      if (statType) params.statType = statType
      if (gameId)   params.gameId   = gameId
      const { data } = await playerPropsApi.getFeed(params)
      setProps(Array.isArray(data) ? data : [])
      setExpandedRow(null)
    } catch (e: any) {
      toast.error('Failed to load player props')
      setProps([])
    } finally {
      setLoading(false)
    }
  }, [statType, overUnder, lastN, minOdds, maxOdds, minHitRate, maxHitRate, gameId])

  useEffect(() => { fetchGames() }, [fetchGames])
  useEffect(() => { fetchProps() }, [fetchProps])

  const handleAddToSlip = (e: React.MouseEvent, row: any, outcome: any) => {
    e.stopPropagation()
    addItem({
      id: `${row.marketId}-${outcome.outcome}-${outcome.bookSlug}`,
      outcome: `${row.player.name} ${outcome.outcome.toUpperCase()} ${row.line} ${row.statType}`,
      eventName: `${row.event.away} @ ${row.event.home}`,
      odds: outcome.odds,
      stake: 10,
    })
    toast.success('Added to bet slip')
  }

  const toggleAnalyzer = (key: string) => {
    setExpandedRow(prev => prev === key ? null : key)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>person_search</span>
            Player Props
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">EV-driven prop analysis with historical hit rates · click a row to analyze</p>
        </div>
        <button onClick={fetchProps} disabled={loading} className="btn-secondary">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Filter Panel */}
      <div className="card space-y-5">
        {/* Stat type chips */}
        <div>
          <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Stat Type</p>
          <div className="flex flex-wrap gap-1.5">
            {STAT_TYPES.map(s => (
              <button
                key={s.value}
                onClick={() => setStatType(s.value)}
                className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                  statType === s.value
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-surface-container-high text-on-surface-variant border-outline-variant/20 hover:border-outline-variant/40 hover:text-on-surface'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Over / Under */}
          <div>
            <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Direction</p>
            <div className="flex rounded-xl overflow-hidden border border-outline-variant/20">
              {(['both', 'over', 'under'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setOverUnder(v)}
                  className={`flex-1 py-2 text-xs font-bold capitalize transition-colors ${
                    overUnder === v
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Last N */}
          <div>
            <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Hit% Window</p>
            <div className="flex rounded-xl overflow-hidden border border-outline-variant/20">
              {LAST_N_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setLastN(n)}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${
                    lastN === n
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  L{n}
                </button>
              ))}
            </div>
          </div>

          {/* Odds range */}
          <div>
            <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Odds Range</p>
            <div className="flex gap-1.5 items-center">
              <input type="number" value={minOdds} onChange={e => setMinOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="-1000" />
              <span className="text-on-surface-variant text-xs shrink-0">to</span>
              <input type="number" value={maxOdds} onChange={e => setMaxOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="+1000" />
            </div>
          </div>

          {/* Hit% range */}
          <div>
            <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Hit% Range (L{lastN})</p>
            <div className="flex gap-1.5 items-center">
              <input type="number" value={minHitRate} min={0} max={100}
                onChange={e => setMinHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="0" />
              <span className="text-on-surface-variant text-xs shrink-0">–</span>
              <input type="number" value={maxHitRate} min={0} max={100}
                onChange={e => setMaxHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="100" />
            </div>
          </div>
        </div>

        {/* Game selector */}
        {games.length > 0 && (
          <div className="max-w-xs">
            <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Game</p>
            <div className="relative">
              <select
                value={gameId}
                onChange={e => setGameId(e.target.value)}
                className="input-field text-xs w-full appearance-none pr-7"
              >
                <option value="">All Games</option>
                {games.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.awayTeam?.abbreviation ?? g.away} @ {g.homeTeam?.abbreviation ?? g.home}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-on-surface-variant">{props.length} props found · sorted by EV% · click row to open bet analyzer</p>

      {/* Table */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm">Loading props…</div>
        ) : props.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant text-sm gap-2">
            <span className="material-symbols-outlined opacity-30" style={{ fontSize: '32px' }}>person_search</span>
            No props match your filters. Try widening the filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                <th className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Player</th>
                <th className="px-3 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Matchup</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Stat</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Line</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">O/U</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Best Odds</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">L5 Hit%</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">L10 Hit%</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">L20 Hit%</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">EV%</th>
                <th className="px-3 py-3 text-center text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Add</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {props.map((row) => {
                const rowKey = `${row.marketId}-${row.bestEV.outcome}`
                const isExpanded = expandedRow === rowKey
                return (
                  <>
                    <tr
                      key={rowKey}
                      onClick={() => toggleAnalyzer(rowKey)}
                      className={`hover:bg-surface-container-high/30 transition-colors cursor-pointer ${isExpanded ? 'bg-surface-container-high/20' : ''}`}
                    >
                      {/* Player */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-primary text-xs font-headline font-bold shrink-0">
                            {row.player.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="font-headline font-bold text-on-surface text-xs leading-tight">{row.player.name}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCheatSheet({
                                    playerId: row.player.id,
                                    playerName: row.player.name,
                                    statType: row.statType,
                                    line: row.line,
                                  })
                                }}
                                title="Open Cheat Sheet"
                                className="text-on-surface-variant hover:text-primary transition-colors"
                              >
                                <BarChart2 size={11} />
                              </button>
                            </div>
                            <p className="text-on-surface-variant text-xs">{row.player.team} · {row.player.position}</p>
                          </div>
                        </div>
                      </td>

                      {/* Matchup */}
                      <td className="px-3 py-3 text-on-surface-variant text-xs whitespace-nowrap">
                        {row.event.away} @ {row.event.home}
                      </td>

                      {/* Stat type */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                          {row.statType}
                        </span>
                      </td>

                      {/* Line */}
                      <td className="px-3 py-3 text-center text-on-surface font-headline font-bold">{row.line}</td>

                      {/* Over/Under */}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs font-bold uppercase ${
                          row.bestEV.outcome === 'over' ? 'text-secondary' : 'text-error'
                        }`}>
                          {row.bestEV.outcome}
                        </span>
                      </td>

                      {/* Best odds */}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono font-bold ${row.bestEV.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>
                          {row.bestEV.odds > 0 ? '+' : ''}{row.bestEV.odds}
                        </span>
                        <p className="text-xs text-on-surface-variant/60">{row.bestEV.bookName}</p>
                      </td>

                      {/* Hit rates */}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-headline font-bold ${hitRateColor(row.hitRate.l5)}`}>{row.hitRate.l5}%</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-headline font-bold ${hitRateColor(row.hitRate.l10)}`}>{row.hitRate.l10}%</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-headline font-bold ${hitRateColor(row.hitRate.l20)}`}>{row.hitRate.l20}%</span>
                      </td>

                      {/* EV badge */}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${evColor(row.bestEV.evPct)}`}>
                          {row.bestEV.evPct > 0 ? '+' : ''}{(row.bestEV.evPct * 100).toFixed(1)}%
                        </span>
                      </td>

                      {/* Add to slip */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => handleAddToSlip(e, row, row.bestEV)}
                            className="w-7 h-7 rounded-xl bg-primary/15 text-primary hover:bg-primary/30 flex items-center justify-center text-sm font-bold transition-colors"
                          >
                            +
                          </button>
                          {isExpanded
                            ? <ChevronUp size={12} className="text-on-surface-variant" />
                            : <ChevronDown size={12} className="text-on-surface-variant/50" />
                          }
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <AnalyzerRow key={`${rowKey}-analyzer`} marketId={row.marketId} row={row} />
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Cheat Sheet Drawer */}
      {cheatSheet && (
        <PlayerCheatSheetDrawer
          isOpen={!!cheatSheet}
          onClose={() => setCheatSheet(null)}
          playerId={cheatSheet.playerId}
          playerName={cheatSheet.playerName}
          statType={cheatSheet.statType}
          line={cheatSheet.line}
        />
      )}
    </div>
  )
}
