import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Plus, X, Zap, TrendingUp, TrendingDown,
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
  if (r >= 0.5)  return 'bg-secondary/20 text-secondary'
  if (r >= 0.2)  return 'bg-secondary/10 text-secondary'
  if (r >= 0.05) return 'bg-secondary/6 text-secondary'
  if (r <= -0.5) return 'bg-error/20 text-error'
  if (r <= -0.2) return 'bg-error/10 text-error'
  if (r <= -0.05)return 'bg-error/6 text-error'
  return 'bg-surface-container-highest text-on-surface-variant'
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
  const cls  = evPct > 5  ? 'text-secondary bg-secondary/12 border-secondary/30'
             : evPct > 0  ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
             : evPct > -5 ? 'text-on-surface-variant bg-surface-container-highest border-outline-variant/20'
             :               'text-error bg-error/10 border-error/30'
  return <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${cls}`}>{sign}{evPct.toFixed(1)}% EV</span>
}

// ─── Correlation Matrix ───────────────────────────────────────────────────────

function CorrelationMatrix({ legs, matrix }: { legs: any[]; matrix: number[][] }) {
  const n = legs.length
  if (n < 2) return null
  return (
    <div>
      <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">
        Correlation Matrix
      </h3>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="w-24" />
              {legs.map((_, j) => (
                <th key={j} className="px-2 py-1 text-on-surface-variant font-normal text-center max-w-[80px] truncate">
                  {j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {legs.map((_, i) => (
              <tr key={i}>
                <td className="pr-2 text-on-surface-variant text-right">
                  <span className="inline-block w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] text-center leading-5 mr-1 font-bold">{i + 1}</span>
                </td>
                {matrix[i].map((r, j) => (
                  <td key={j} className="p-0.5">
                    {i === j ? (
                      <div className="w-14 h-7 bg-surface-container-highest rounded-lg flex items-center justify-center text-on-surface-variant">—</div>
                    ) : (
                      <div className={`w-14 h-7 rounded-lg flex items-center justify-center font-mono text-[10px] ${corrColor(r)}`}>
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
                <span className="text-on-surface-variant">
                  <span className="text-primary">#{i + 1}</span> × <span className="text-primary">#{j + 1}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${corrColor(r)}`}>
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
            className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
              filter === t
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'
            }`}
          >
            {t === 'PLAYER_PROP' ? 'Props' : t === 'ALL' ? 'All' : t}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        {legs.map((market: any) =>
          market.outcomes.map((o: any) => {
            const key = `${market.marketId}-${o.outcome}`
            const alreadyAdded = selected.some(s => s.marketId === market.marketId && s.outcome === o.outcome)
            const label = market.playerName
              ? `${market.playerName} ${o.outcome.toUpperCase()}${o.line != null ? ` ${o.line}` : ''} (${market.propStatType ?? market.marketType})`
              : `${o.outcome.toUpperCase()}${o.line != null ? ` ${o.line}` : ''} ${market.marketType}`
            return (
              <div key={key} className="flex items-center justify-between bg-surface-container-high/60 rounded-xl px-3 py-2.5 border border-outline-variant/10">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-on-surface truncate">{label}</div>
                  {market.playerName && (
                    <div className="text-[10px] text-on-surface-variant">{market.marketType}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className={`text-xs font-mono font-bold ${o.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>
                    {fmtOdds(o.odds)}
                  </span>
                  <button
                    disabled={alreadyAdded}
                    onClick={() => onAdd({ marketId: market.marketId, outcome: o.outcome, label, odds: o.odds })}
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                      alreadyAdded
                        ? 'bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed'
                        : 'bg-primary/20 text-primary hover:bg-primary/35'
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
          <div className="text-center text-on-surface-variant text-xs py-6">No markets available for this type</div>
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
      id: `parlay-${Date.now()}`,
      eventId: selectedEvent,
      marketId: '',
      eventName: `${mode === 'sgp' ? 'SGP' : 'Parlay'} — ${legs.length} legs`,
      outcome: legs.map(l => l.label).join(' / '),
      odds: analysis.parlayOddsAmerican,
      stake: 10,
      ev: analysis.corrEVPct ?? analysis.evPct,
    })
    toast.success('Parlay added to bet slip!')
  }

  const eventLabel = (ev: any) =>
    `${ev.awayTeam?.abbreviation ?? ev.away} @ ${ev.homeTeam?.abbreviation ?? ev.home}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>layers</span>
          Parlay Builder
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          SGP correlation engine · same-game parlays · multi-game parlay EV
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-outline-variant/10">
        {([
          { key: 'sgp',    label: 'Same-Game Parlay (SGP)' },
          { key: 'parlay', label: 'Multi-Game Parlay' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setMode(key); setLegs([]); setAnalysis(null) }}
            className={`px-4 py-2.5 text-sm font-headline font-bold transition-colors border-b-2 ${
              mode === key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
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
            <label className="label-sm mb-2">
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
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>

            {/* SGP Suggestions */}
            {mode === 'sgp' && suggestedData?.suggested?.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-1 text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2">
                  <Star size={10} /> AI Suggested Legs (positive EV, low conflict)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedData.suggested.map((s: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => addSuggestedLeg(s)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-400/10 border border-yellow-400/25 rounded-xl text-xs hover:bg-yellow-400/20 transition-colors"
                    >
                      <Plus size={10} className="text-yellow-400" />
                      <span className="text-on-surface max-w-[160px] truncate">
                        {s.playerName ? `${s.playerName} ${s.outcome}` : `${s.outcome} ${s.marketType}`}
                      </span>
                      <span className="text-secondary font-mono font-bold">{fmtOdds(s.odds)}</span>
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
                className="flex items-center justify-between w-full text-sm font-headline font-bold text-on-surface mb-3"
              >
                <span>Available Legs {marketsLoading ? '(loading…)' : ''}</span>
                <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${showLegPicker ? 'rotate-180' : ''}`} />
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
              <span className="text-sm font-headline font-bold text-on-surface">
                Selected Legs ({legs.length})
              </span>
              {legs.length > 0 && (
                <button onClick={() => { setLegs([]); setAnalysis(null) }} className="text-xs text-on-surface-variant hover:text-error transition-colors">
                  Clear all
                </button>
              )}
            </div>

            {legs.length === 0 ? (
              <div className="text-center text-on-surface-variant text-xs py-6">
                <span className="material-symbols-outlined opacity-30 mb-2" style={{ fontSize: '28px', display: 'block' }}>layers</span>
                Add at least 2 legs from the picker
              </div>
            ) : (
              <div className="space-y-1.5">
                {legs.map((leg, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-container-high/60 rounded-xl px-3 py-2.5 border border-outline-variant/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-on-surface truncate">{leg.label}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className={`text-xs font-mono font-bold ${leg.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>
                        {fmtOdds(leg.odds)}
                      </span>
                      <button onClick={() => removeLeg(i)} className="text-on-surface-variant hover:text-error transition-colors">
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
                className="btn-primary w-full mt-4"
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
              <h3 className="text-sm font-headline font-bold text-on-surface">Analysis Results</h3>

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
                  <div key={label} className="bg-surface-container-high/60 rounded-xl p-3 text-center border border-outline-variant/10">
                    <div className="text-xs text-on-surface-variant mb-0.5">{label}</div>
                    <div className="text-sm font-headline font-bold text-on-surface">{value}</div>
                  </div>
                ))}
              </div>

              {/* EV row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-on-surface-variant">
                    {mode === 'sgp' ? 'Independent EV' : 'Parlay EV'}
                  </span>
                  {evBadge(analysis.indepEVPct ?? analysis.evPct)}
                </div>
                {mode === 'sgp' && analysis.corrEVPct != null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-on-surface-variant">Correlation-Adjusted EV</span>
                      {evBadge(analysis.corrEVPct)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-on-surface-variant">EV Impact from Correlations</span>
                      <span className={`text-xs font-bold flex items-center gap-1 ${
                        analysis.evImprovementPct > 0 ? 'text-secondary' : 'text-error'
                      }`}>
                        {analysis.evImprovementPct > 0
                          ? <TrendingUp size={11} />
                          : <TrendingDown size={11} />}
                        {analysis.evImprovementPct > 0 ? '+' : ''}{analysis.evImprovementPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-on-surface-variant">Avg leg correlation</span>
                      <span className={`text-xs font-mono ${
                        analysis.avgCorrelation > 0.1 ? 'text-secondary' : analysis.avgCorrelation < -0.1 ? 'text-error' : 'text-on-surface-variant'
                      }`}>
                        {analysis.avgCorrelation >= 0 ? '+' : ''}{analysis.avgCorrelation.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Warning for negative corr */}
              {mode === 'sgp' && analysis.avgCorrelation < -0.15 && (
                <div className="flex gap-2 bg-error/10 border border-error/25 rounded-xl p-3 text-xs text-error">
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
                <h4 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Leg Breakdown</h4>
                <div className="space-y-1.5">
                  {analysis.legs.map((leg: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-surface-container-high/50 rounded-xl px-3 py-2.5 border border-outline-variant/10">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-on-surface truncate">
                            {leg.player?.name ?? leg.event?.home ?? ''} {leg.outcome}
                            {leg.line != null ? ` ${leg.line}` : ''}
                          </div>
                          <div className="text-on-surface-variant/60">{leg.marketType}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-on-surface-variant">{(leg.trueProb * 100).toFixed(0)}%</span>
                        {evBadge(leg.ev?.evPct * 100 ?? 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Send to slip */}
              <button onClick={sendToBetSlip} className="btn-secondary w-full">
                <Plus size={14} /> Add to Bet Slip ({fmtOdds(analysis.parlayOddsAmerican)})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
