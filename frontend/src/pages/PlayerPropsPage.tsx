import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, ChevronDown } from 'lucide-react'
import { playerPropsApi, sportsApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

const STAT_TYPES = [
  { value: '',         label: 'ALL'  },
  { value: 'POINTS',   label: 'PTS'  },
  { value: 'REBOUNDS', label: 'REB'  },
  { value: 'ASSISTS',  label: 'AST'  },
  { value: 'THREES',   label: '3PT'  },
  { value: 'PRA',      label: 'PRA'  },
  { value: 'PR',       label: 'P+R'  },
  { value: 'PA',       label: 'P+A'  },
  { value: 'RA',       label: 'R+A'  },
  { value: 'STEALS',   label: 'STLS' },
  { value: 'BLOCKS',   label: 'BLKS' },
  { value: 'MINUTES',  label: 'MIN'  },
]

const LAST_N_OPTIONS = [5, 10, 15, 20]

function hitRateColor(pct: number) {
  if (pct >= 70) return 'text-green-400'
  if (pct >= 50) return 'text-gold-300'
  return 'text-red-400'
}

function evColor(evPct: number): React.CSSProperties {
  if (evPct > 0.05) return { background: 'rgba(74,222,128,0.12)',   color: '#4ade80',  border: '1px solid rgba(74,222,128,0.25)' }
  if (evPct > 0.02) return { background: 'rgba(245,158,11,0.12)',   color: '#fbbf24',  border: '1px solid rgba(245,158,11,0.25)' }
  if (evPct > 0)    return { background: 'rgba(6,182,212,0.12)',    color: '#22d3ee',  border: '1px solid rgba(6,182,212,0.25)'  }
  return               { background: 'rgba(255,255,255,0.05)', color: '#64748b',  border: '1px solid rgba(255,255,255,0.08)' }
}

export default function PlayerPropsPage() {
  const { addItem } = useBetSlipStore()

  const [statType,    setStatType]    = useState('')
  const [overUnder,   setOverUnder]   = useState<'over' | 'under' | 'both'>('both')
  const [lastN,       setLastN]       = useState(10)
  const [minOdds,     setMinOdds]     = useState(-1000)
  const [maxOdds,     setMaxOdds]     = useState(1000)
  const [minHitRate,  setMinHitRate]  = useState(0)
  const [maxHitRate,  setMaxHitRate]  = useState(100)
  const [gameId,      setGameId]      = useState('')
  const [props,       setProps]       = useState<any[]>([])
  const [games,       setGames]       = useState<any[]>([])
  const [loading,     setLoading]     = useState(false)

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
    } catch {
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

  // Shared toggle segment styles
  const segStyle = (active: boolean): React.CSSProperties => active
    ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
    : { background: 'rgba(4,8,18,0.6)',      color: '#64748b' }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <TrendingUp size={18} className="text-gold-400" />
            Player Props
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">EV-driven prop analysis with historical hit rates</p>
        </div>
        <button onClick={fetchProps} disabled={loading} className="btn-secondary">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ── Filter panel ────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        {/* Stat type chips */}
        <div>
          <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Stat Type</p>
          <div className="flex flex-wrap gap-1.5">
            {STAT_TYPES.map(s => (
              <button
                key={s.value}
                onClick={() => setStatType(s.value)}
                className={`stat-chip text-xs ${statType === s.value ? 'active' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Over / Under */}
          <div>
            <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Direction</p>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {(['both', 'over', 'under'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setOverUnder(v)}
                  className="flex-1 py-1.5 text-xs font-medium capitalize transition-all duration-150"
                  style={segStyle(overUnder === v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Last N */}
          <div>
            <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Hit% Window</p>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {LAST_N_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setLastN(n)}
                  className="flex-1 py-1.5 text-xs font-medium transition-all duration-150"
                  style={segStyle(lastN === n)}
                >
                  L{n}
                </button>
              ))}
            </div>
          </div>

          {/* Odds range */}
          <div>
            <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Odds Range</p>
            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                value={minOdds}
                onChange={e => setMinOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full"
                placeholder="-1000"
              />
              <span className="text-slate-700 text-xs shrink-0">to</span>
              <input
                type="number"
                value={maxOdds}
                onChange={e => setMaxOdds(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full"
                placeholder="+1000"
              />
            </div>
          </div>

          {/* Hit% range */}
          <div>
            <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Hit% Range (L{lastN})</p>
            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                value={minHitRate}
                min={0} max={100}
                onChange={e => setMinHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full"
                placeholder="0"
              />
              <span className="text-slate-700 text-xs shrink-0">–</span>
              <input
                type="number"
                value={maxHitRate}
                min={0} max={100}
                onChange={e => setMaxHitRate(Number(e.target.value))}
                className="input-field py-1.5 text-xs w-full"
                placeholder="100"
              />
            </div>
          </div>
        </div>

        {/* Game selector */}
        {games.length > 0 && (
          <div className="max-w-xs">
            <p className="text-2xs text-slate-600 mb-2 uppercase tracking-widest font-semibold">Game</p>
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
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <p className="text-2xs text-slate-600">
        {props.length} props found &middot; sorted by EV%
      </p>

      {/* ── Props table ─────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-slate-500 text-sm">
            <RefreshCw size={16} className="animate-spin text-slate-700" />
            Loading props…
          </div>
        ) : props.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <TrendingUp size={28} className="text-slate-700" />
            <p className="text-slate-500 text-sm">No props match your filters</p>
            <p className="text-slate-700 text-xs">Try widening the filters above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="px-4 py-3.5">Player</th>
                  <th className="px-3 py-3.5">Matchup</th>
                  <th className="px-3 py-3.5 text-center">Stat</th>
                  <th className="px-3 py-3.5 text-center">Line</th>
                  <th className="px-3 py-3.5 text-center">O/U</th>
                  <th className="px-3 py-3.5 text-center">Best Odds</th>
                  <th className="px-3 py-3.5 text-center">L5</th>
                  <th className="px-3 py-3.5 text-center">L10</th>
                  <th className="px-3 py-3.5 text-center">L20</th>
                  <th className="px-3 py-3.5 text-center">EV%</th>
                  <th className="px-3 py-3.5 text-center">Add</th>
                </tr>
              </thead>
              <tbody>
                {props.map((row) => (
                  <tr key={`${row.marketId}-${row.bestEV.outcome}`}>
                    {/* Player */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold shrink-0"
                          style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                        >
                          {row.player.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white text-xs leading-tight">{row.player.name}</p>
                          <p className="text-2xs text-slate-600">{row.player.team} · {row.player.position}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {row.event.away} @ {row.event.home}
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className="text-2xs font-semibold px-2 py-0.5 rounded"
                        style={{ background: 'rgba(6,182,212,0.1)', color: '#22d3ee' }}
                      >
                        {row.statType}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center text-white font-semibold text-xs">{row.line}</td>

                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-bold uppercase ${row.bestEV.outcome === 'over' ? 'text-green-400' : 'text-red-400'}`}>
                        {row.bestEV.outcome}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span className={`font-mono font-semibold text-xs ${row.bestEV.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                        {row.bestEV.odds > 0 ? '+' : ''}{row.bestEV.odds}
                      </span>
                      <p className="text-2xs text-slate-700 mt-0.5">{row.bestEV.bookName}</p>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span className={`font-semibold text-xs ${hitRateColor(row.hitRate.l5)}`}>{row.hitRate.l5}%</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-semibold text-xs ${hitRateColor(row.hitRate.l10)}`}>{row.hitRate.l10}%</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-semibold text-xs ${hitRateColor(row.hitRate.l20)}`}>{row.hitRate.l20}%</span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className="text-2xs font-semibold px-2 py-0.5 rounded-full"
                        style={evColor(row.bestEV.evPct)}
                      >
                        {row.bestEV.evPct > 0 ? '+' : ''}{(row.bestEV.evPct * 100).toFixed(1)}%
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleAddToSlip(row, row.bestEV)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mx-auto transition-all duration-150"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
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
                        +
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
