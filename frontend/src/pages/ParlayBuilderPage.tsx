import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Layers, Plus, X, Zap, TrendingUp, TrendingDown,
  RefreshCw, ChevronDown, AlertTriangle, Star,
} from 'lucide-react'
import { parlayApi, sportsApi } from '../lib/api'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SelectedLeg { marketId: string; outcome: string; label: string; odds: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtOdds(odds: number) {
  return `${odds > 0 ? '+' : ''}${odds}`
}

function corrColor(r: number) {
  if (r >= 0.5)  return 'bg-green-700 text-green-100'
  if (r >= 0.2)  return 'bg-green-900/60 text-green-300'
  if (r >= 0.05) return 'bg-green-900/30 text-green-400'
  if (r <= -0.5) return 'bg-red-700 text-red-100'
  if (r <= -0.2) return 'bg-red-900/60 text-red-300'
  if (r <= -0.05)return 'bg-red-900/30 text-red-400'
  return 'bg-slate-700 text-slate-400'
}

function corrLabel(r: number) {
  if (r >= 0.5)  return `+${r.toFixed(2)} Strong`
  if (r >= 0.2)  return `+${r.toFixed(2)} Moderate`
  if (r >= 0.05) return `+${r.toFixed(2)} Slight`
  if (r <= -0.5) return `${r.toFixed(2)} Strong`
  if (r <= -0.2) return `${r.toFixed(2)} Moderate`
  if (r <= -0.05)return `${r.toFixed(2)} Slight`
  return '0.00 Indep'
}

function evBadge(evPct: number) {
  const sign = evPct > 0 ? '+' : ''
  const cls  = evPct > 5  ? 'text-green-400 bg-green-900/30 border-green-700/50'
             : evPct > 0  ? 'text-yellow-400 bg-yellow-900/20 border-yellow-700/40'
             : evPct > -5 ? 'text-slate-400 bg-slate-800 border-slate-700'
             :               'text-red-400 bg-red-900/20 border-red-700/40'
  return <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${cls}`}>{sign}{evPct.toFixed(1)}% EV</span>
}

// ─── Correlation Matrix ───────────────────────────────────────────────────────

function CorrelationMatrix({ legs, matrix }: { legs: any[]; matrix: number[][] }) {
  const n = legs.length
  if (n < 2) return null
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Correlation Matrix
      </h3>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="w-24" />
              {legs.map((l, j) => (
                <th key={j} className="px-2 py-1 text-slate-500 font-normal text-center max-w-[80px] truncate">
                  {j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {legs.map((_, i) => (
              <tr key={i}>
                <td className="pr-2 text-slate-500 text-right">
                  <span className="inline-block w-4 h-4 rounded-full bg-primary-700 text-primary-200 text-[10px] text-center leading-4 mr-1">{i + 1}</span>
                </td>
                {matrix[i].map((r, j) => (
                  <td key={j} className="p-0.5">
                    {i === j ? (
                      <div className="w-14 h-7 bg-slate-700 rounded flex items-center justify-center text-slate-500">—</div>
                    ) : (
                      <div className={`w-14 h-7 rounded flex items-center justify-center font-mono text-[10px] ${corrColor(r)}`}>
                        {r >= 0 ? '+' : ''}{r.toFixed(2)}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pair summaries */}
      <div className="mt-3 space-y-1">
        {legs.map((lA, i) =>
          legs.slice(i + 1).map((lB, jj) => {
            const j = i + 1 + jj
            const r = matrix[i][j]
            return (
              <div key={`${i}-${j}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  <span className="text-primary-400">#{i + 1}</span> × <span className="text-primary-400">#{j + 1}</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${corrColor(r)}`}>
                  {corrLabel(r)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Leg Picker ───────────────────────────────────────────────────────────────

function LegPicker({ eventData, selected, onAdd }: {
  eventData: any; selected: SelectedLeg[]; onAdd: (leg: SelectedLeg) => void
}) {
  const [filter, setFilter] = useState<string>('ALL')
  const types = ['ALL', 'PLAYER_PROP', 'MONEYLINE', 'SPREAD', 'TOTAL']

  const legs = (eventData?.legs ?? []).filter((m: any) =>
    filter === 'ALL' || m.marketType === filter
  )

  return (
    <div className="space-y-3">
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
              filter === t
                ? 'bg-primary-600/30 border-primary-500/50 text-primary-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {t === 'PLAYER_PROP' ? 'Props' : t === 'ALL' ? 'All' : t}
          </button>
        ))}
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {legs.map((market: any) =>
          market.outcomes.map((o: any) => {
            const key = `${market.marketId}-${o.outcome}`
            const alreadyAdded = selected.some(s => s.marketId === market.marketId && s.outcome === o.outcome)
            const label = market.playerName
              ? `${market.playerName} ${o.outcome.toUpperCase()}${o.line != null ? ` ${o.line}` : ''} (${market.propStatType ?? market.marketType})`
              : `${o.outcome.toUpperCase()}${o.line != null ? ` ${o.line}` : ''} ${market.marketType}`
            return (
              <div key={key} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white truncate">{label}</div>
                  {market.playerName && (
                    <div className="text-[10px] text-slate-500">{market.marketType}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className={`text-xs font-mono font-bold ${o.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                    {fmtOdds(o.odds)}
                  </span>
                  <button
                    disabled={alreadyAdded}
                    onClick={() => onAdd({ marketId: market.marketId, outcome: o.outcome, label, odds: o.odds })}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      alreadyAdded
                        ? 'bg-slate-700 text-slate-600 cursor-not-allowed'
                        : 'bg-primary-600/30 text-primary-400 hover:bg-primary-600/50'
                    }`}
                  >
                    {alreadyAdded ? '✓' : '+'}
                  </button>
                </div>
              </div>
            )
          })
        )}
        {legs.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-6">No markets available for this type</div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParlayBuilderPage() {
  const [mode, setMode] = useState<'sgp' | 'parlay'>('sgp')
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [legs, setLegs] = useState<SelectedLeg[]>([])
  const [analysis, setAnalysis] = useState<any>(null)
  const [showLegPicker, setShowLegPicker] = useState(true)
  const { addItem } = useBetSlipStore()

  // Fetch scheduled events
  const { data: eventsData } = useQuery({
    queryKey: ['events-scheduled'],
    queryFn: () => sportsApi.getEvents('nba', { status: 'SCHEDULED' }),
    staleTime: 60_000,
    select: (r) => (r.data?.events ?? r.data ?? []) as any[],
  })
  const events: any[] = eventsData ?? []

  // Set default event
  useEffect(() => {
    if (!selectedEvent && events.length > 0) setSelectedEvent(events[0].id)
  }, [events, selectedEvent])

  // Fetch markets for selected event
  const { data: eventMarketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ['parlay-markets', selectedEvent],
    queryFn: () => parlayApi.getEventMarkets(selectedEvent),
    enabled: !!selectedEvent,
    staleTime: 30_000,
    select: (r) => r.data,
  })

  // Suggest legs
  const { data: suggestedData } = useQuery({
    queryKey: ['sgp-suggest', selectedEvent],
    queryFn: () => parlayApi.suggestLegs(selectedEvent, 6),
    enabled: !!selectedEvent && mode === 'sgp',
    staleTime: 60_000,
    select: (r) => r.data,
  })

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: () =>
      mode === 'sgp'
        ? parlayApi.analyzeSGP(selectedEvent, legs.map(l => ({ marketId: l.marketId, outcome: l.outcome })))
        : parlayApi.analyzeParlay(legs.map(l => ({ marketId: l.marketId, outcome: l.outcome }))),
    onSuccess: (res) => setAnalysis(res.data),
    onError: () => toast.error('Analysis failed'),
  })

  const addLeg = (leg: SelectedLeg) => {
    if (legs.some(l => l.marketId === leg.marketId && l.outcome === leg.outcome)) return
    setLegs(prev => [...prev, leg])
    setAnalysis(null)
  }

  const removeLeg = (idx: number) => {
    setLegs(prev => prev.filter((_, i) => i !== idx))
    setAnalysis(null)
  }

  const addSuggestedLeg = (s: any) => {
    const label = s.playerName
      ? `${s.playerName} ${s.outcome.toUpperCase()} (${s.propStatType ?? s.marketType})`
      : `${s.outcome.toUpperCase()} ${s.marketType}`
    addLeg({ marketId: s.marketId, outcome: s.outcome, label, odds: s.odds })
  }

  const sendToBetSlip = () => {
    if (!analysis) return
    addItem({
      eventId: selectedEvent,
      marketId: '',
      eventName: `${mode === 'sgp' ? 'SGP' : 'Parlay'} — ${legs.length} legs`,
      outcome: legs.map(l => l.label).join(' / '),
      odds: analysis.parlayOddsAmerican,
      ev: analysis.corrEVPct ?? analysis.evPct,
    })
    toast.success('Parlay added to bet slip!')
  }

  const eventLabel = (ev: any) =>
    `${ev.awayTeam?.abbreviation ?? ev.away} @ ${ev.homeTeam?.abbreviation ?? ev.home}`

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={20} className="text-primary-400" /> Parlay Builder
          </h1>
          <p className="text-slate-400 text-sm">
            SGP correlation engine · same-game parlays · multi-game parlay EV
          </p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { key: 'sgp',    label: 'Same-Game Parlay (SGP)' },
          { key: 'parlay', label: 'Multi-Game Parlay' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setMode(key); setLegs([]); setAnalysis(null) }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              mode === key
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Left: Leg picker ─────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Event selector */}
          <div className="card">
            <label className="label-sm mb-1">
              {mode === 'sgp' ? 'Game (same game for all legs)' : 'Add legs from any game'}
            </label>
            <div className="relative">
              <select
                value={selectedEvent}
                onChange={e => { setSelectedEvent(e.target.value); setLegs([]); setAnalysis(null) }}
                className="input-field w-full appearance-none pr-8"
              >
                <option value="">— Select a game —</option>
                {events.map((ev: any) => (
                  <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* SGP Suggestions */}
            {mode === 'sgp' && suggestedData?.suggested?.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-yellow-400 uppercase tracking-wider mb-2">
                  <Star size={10} /> AI Suggested Legs (positive EV, low conflict)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedData.suggested.map((s: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => addSuggestedLeg(s)}
                      className="flex items-center gap-1.5 px-2 py-1 bg-yellow-900/20 border border-yellow-700/40 rounded-lg text-xs hover:bg-yellow-900/30 transition-colors"
                    >
                      <Plus size={10} className="text-yellow-400" />
                      <span className="text-slate-300 max-w-[160px] truncate">
                        {s.playerName ? `${s.playerName} ${s.outcome}` : `${s.outcome} ${s.marketType}`}
                      </span>
                      <span className="text-green-400 font-mono">{fmtOdds(s.odds)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Leg picker */}
          {selectedEvent && (
            <div className="card">
              <button
                onClick={() => setShowLegPicker(v => !v)}
                className="flex items-center justify-between w-full text-sm font-semibold text-white mb-2"
              >
                <span>Available Legs {marketsLoading ? '(loading…)' : ''}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showLegPicker ? 'rotate-180' : ''}`} />
              </button>
              {showLegPicker && !marketsLoading && eventMarketsData && (
                <LegPicker
                  eventData={eventMarketsData}
                  selected={legs}
                  onAdd={addLeg}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Right: Selected legs + analysis ──────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Selected legs */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">
                Selected Legs ({legs.length})
              </span>
              {legs.length > 0 && (
                <button onClick={() => { setLegs([]); setAnalysis(null) }} className="text-xs text-slate-500 hover:text-red-400">
                  Clear all
                </button>
              )}
            </div>

            {legs.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-6">
                <Layers size={24} className="mx-auto mb-2 opacity-30" />
                Add at least 2 legs from the picker
              </div>
            ) : (
              <div className="space-y-1.5">
                {legs.map((leg, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-primary-700 text-primary-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-slate-300 truncate">{leg.label}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className={`text-xs font-mono font-bold ${leg.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                        {fmtOdds(leg.odds)}
                      </span>
                      <button onClick={() => removeLeg(i)} className="text-slate-600 hover:text-red-400">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {legs.length >= 2 && (
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
              >
                {analyzeMutation.isPending
                  ? <><RefreshCw size={14} className="animate-spin" /> Analyzing…</>
                  : <><Zap size={14} /> Analyze {mode === 'sgp' ? 'SGP' : 'Parlay'}</>
                }
              </button>
            )}
          </div>

          {/* Analysis results */}
          {analysis && (
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-white">Analysis Results</h3>

              {/* Odds & Probability */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Parlay Odds', value: `${analysis.parlayOddsAmerican > 0 ? '+' : ''}${analysis.parlayOddsAmerican}` },
                  { label: 'Decimal',     value: `${analysis.parlayOddsDecimal}x` },
                  { label: mode === 'sgp' ? 'True Prob (indep)' : 'True Probability',
                    value: `${(analysis.indepProb ?? analysis.trueProb).toFixed(1)}%` },
                  ...(mode === 'sgp' && analysis.corrProb != null ? [
                    { label: 'Adj Prob (corr)', value: `${analysis.corrProb.toFixed(1)}%` }
                  ] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-800/50 rounded-lg p-2 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                    <div className="text-sm font-bold text-white">{value}</div>
                  </div>
                ))}
              </div>

              {/* EV row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {mode === 'sgp' ? 'Independent EV' : 'Parlay EV'}
                  </span>
                  {evBadge(analysis.indepEVPct ?? analysis.evPct)}
                </div>
                {mode === 'sgp' && analysis.corrEVPct != null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Correlation-Adjusted EV</span>
                      {evBadge(analysis.corrEVPct)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">EV Impact from Correlations</span>
                      <span className={`text-xs font-semibold flex items-center gap-1 ${
                        analysis.evImprovementPct > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {analysis.evImprovementPct > 0
                          ? <TrendingUp size={11} />
                          : <TrendingDown size={11} />}
                        {analysis.evImprovementPct > 0 ? '+' : ''}{analysis.evImprovementPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Avg leg correlation</span>
                      <span className={`text-xs font-mono ${
                        analysis.avgCorrelation > 0.1 ? 'text-green-400' : analysis.avgCorrelation < -0.1 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {analysis.avgCorrelation >= 0 ? '+' : ''}{analysis.avgCorrelation.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Warning for negative corr */}
              {mode === 'sgp' && analysis.avgCorrelation < -0.15 && (
                <div className="flex gap-2 bg-red-900/20 border border-red-700/40 rounded-lg p-2 text-xs text-red-300">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  Legs are negatively correlated — these props conflict. Consider removing contradictory legs.
                </div>
              )}

              {/* Correlation matrix */}
              {mode === 'sgp' && analysis.corrMatrix && (
                <CorrelationMatrix legs={analysis.legs} matrix={analysis.corrMatrix} />
              )}

              {/* Individual legs */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Leg Breakdown</h4>
                <div className="space-y-1">
                  {analysis.legs.map((leg: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-slate-800/40 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 h-4 rounded-full bg-primary-700 text-primary-200 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-slate-300 truncate">
                            {leg.player?.name ?? leg.event?.home ?? ''} {leg.outcome}
                            {leg.line != null ? ` ${leg.line}` : ''}
                          </div>
                          <div className="text-slate-600">{leg.marketType}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-slate-400">{(leg.trueProb * 100).toFixed(0)}%</span>
                        {evBadge((leg.ev?.evPct ?? 0) * 100)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Send to slip */}
              <button onClick={sendToBetSlip} className="btn-secondary w-full flex items-center justify-center gap-2">
                <Plus size={14} /> Add to Bet Slip ({fmtOdds(analysis.parlayOddsAmerican)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
