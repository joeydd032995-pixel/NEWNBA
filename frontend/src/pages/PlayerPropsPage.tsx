import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, ChevronDown } from 'lucide-react'
import { playerPropsApi, sportsApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

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
  if (pct >= 70) return 'text-green-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function evColor(evPct: number) {
  if (evPct > 0.05) return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (evPct > 0.02) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  if (evPct > 0)    return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  return 'bg-slate-700/40 text-slate-400 border-slate-600/30'
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
    } catch (e: any) {
      toast.error('Failed to load player props')
      setProps([])
    } finally {
      setLoading(false)
    }
  }, [statType, overUnder, lastN, minOdds, maxOdds, minHitRate, maxHitRate, gameId])

  useEffect(() => { fetchGames() }, [fetchGames])
  useEffect(() => { fetchProps() }, [fetchProps])

  const handleAddToSlip = (row: any, outcome: any) => {
    addItem({
      id: `${row.marketId}-${outcome.outcome}-${outcome.bookSlug}`,
      outcome: `${row.player.name} ${outcome.outcome.toUpperCase()} ${row.line} ${row.statType}`,
      eventName: `${row.event.away} @ ${row.event.home}`,
      odds: outcome.odds,
      stake: 10,
    })
    toast.success('Added to bet slip')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-primary-400" /> Player Props
          </h1>
          <p className="text-slate-400 text-sm">EV-driven prop analysis with historical hit rates</p>
        </div>
        <button onClick={fetchProps} disabled={loading} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Filter Panel */}
      <div className="card space-y-4">
        {/* Stat type chips */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Stat Type</p>
          <div className="flex flex-wrap gap-1.5">
            {STAT_TYPES.map(s => (
              <button
                key={s.value}
                onClick={() => setStatType(s.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  statType === s.value
                    ? 'bg-primary-600/30 text-primary-300 border-primary-500/50'
                    : 'bg-dark-800 text-slate-400 border-slate-700 hover:border-slate-500'
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
            <p className="text-xs text-slate-500 mb-2">Direction</p>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['both', 'over', 'under'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setOverUnder(v)}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                    overUnder === v
                      ? 'bg-primary-600/30 text-primary-300'
                      : 'bg-dark-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Last N */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Hit% Window</p>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {LAST_N_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setLastN(n)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    lastN === n
                      ? 'bg-primary-600/30 text-primary-300'
                      : 'bg-dark-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  L{n}
                </button>
              ))}
            </div>
          </div>

          {/* Odds range */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Odds Range</p>
            <div className="flex gap-1.5 items-center">
              <input type="number" value={minOdds} onChange={e => setMinOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="-1000" />
              <span className="text-slate-600 text-xs shrink-0">to</span>
              <input type="number" value={maxOdds} onChange={e => setMaxOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="+1000" />
            </div>
          </div>

          {/* Hit% range */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Hit% Range (L{lastN})</p>
            <div className="flex gap-1.5 items-center">
              <input type="number" value={minHitRate} min={0} max={100}
                onChange={e => setMinHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="0" />
              <span className="text-slate-600 text-xs shrink-0">–</span>
              <input type="number" value={maxHitRate} min={0} max={100}
                onChange={e => setMaxHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full" placeholder="100" />
            </div>
          </div>
        </div>

        {/* Game selector */}
        {games.length > 0 && (
          <div className="max-w-xs">
            <p className="text-xs text-slate-500 mb-2">Game</p>
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
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-500">{props.length} props found · sorted by EV%</p>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Loading props…</div>
        ) : props.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
            <TrendingUp size={28} className="opacity-30" />
            No props match your filters. Try widening the filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-3 py-3 text-left">Matchup</th>
                <th className="px-3 py-3 text-center">Stat</th>
                <th className="px-3 py-3 text-center">Line</th>
                <th className="px-3 py-3 text-center">O/U</th>
                <th className="px-3 py-3 text-center">Best Odds</th>
                <th className="px-3 py-3 text-center">L5 Hit%</th>
                <th className="px-3 py-3 text-center">L10 Hit%</th>
                <th className="px-3 py-3 text-center">L20 Hit%</th>
                <th className="px-3 py-3 text-center">EV%</th>
                <th className="px-3 py-3 text-center">Add</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {props.map((row) => (
                <tr key={`${row.marketId}-${row.bestEV.outcome}`} className="hover:bg-slate-800/30 transition-colors">
                  {/* Player */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 text-xs font-bold shrink-0">
                        {row.player.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white text-xs leading-tight">{row.player.name}</p>
                        <p className="text-slate-500 text-xs">{row.player.team} · {row.player.position}</p>
                      </div>
                    </div>
                  </td>

                  {/* Matchup */}
                  <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {row.event.away} @ {row.event.home}
                  </td>

                  {/* Stat type */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs font-medium text-primary-300 bg-primary-600/10 px-2 py-0.5 rounded">
                      {row.statType}
                    </span>
                  </td>

                  {/* Line */}
                  <td className="px-3 py-3 text-center text-white font-medium">{row.line}</td>

                  {/* Over/Under */}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-semibold uppercase ${
                      row.bestEV.outcome === 'over' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {row.bestEV.outcome}
                    </span>
                  </td>

                  {/* Best odds */}
                  <td className="px-3 py-3 text-center">
                    <span className={`font-mono font-medium ${row.bestEV.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                      {row.bestEV.odds > 0 ? '+' : ''}{row.bestEV.odds}
                    </span>
                    <p className="text-xs text-slate-600">{row.bestEV.bookName}</p>
                  </td>

                  {/* Hit rates */}
                  <td className="px-3 py-3 text-center">
                    <span className={`font-semibold ${hitRateColor(row.hitRate.l5)}`}>{row.hitRate.l5}%</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`font-semibold ${hitRateColor(row.hitRate.l10)}`}>{row.hitRate.l10}%</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`font-semibold ${hitRateColor(row.hitRate.l20)}`}>{row.hitRate.l20}%</span>
                  </td>

                  {/* EV badge */}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${evColor(row.bestEV.evPct)}`}>
                      {row.bestEV.evPct > 0 ? '+' : ''}{(row.bestEV.evPct * 100).toFixed(1)}%
                    </span>
                  </td>

                  {/* Add to slip */}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleAddToSlip(row, row.bestEV)}
                      className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 hover:bg-primary-600/40 flex items-center justify-center text-sm font-bold transition-colors"
                    >
                      +
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
