import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Plus, X, Zap, TrendingUp, TrendingDown,
  RefreshCw, ChevronDown, AlertTriangle, Star,
} from 'lucide-react'
import { parlayApi, sportsApi } from '../lib/api'
import { betslipApi, type TrackedWagerInput } from '../lib/betslipApi'
import toast from 'react-hot-toast'

interface SelectedLeg {
  marketId: string
  eventId: string
  outcome: string
  label: string
  odds: number
  bookId?: string
  bookName?: string
  line?: number
  marketType?: string
  propStatType?: string
}

function fmtOdds(odds: number) {
  return `${odds > 0 ? '+' : ''}${odds}`
}

function corrColor(r: number) {
  if (r >= 0.5) return 'bg-secondary/20 text-secondary'
  if (r >= 0.2) return 'bg-secondary/10 text-secondary'
  if (r >= 0.05) return 'bg-secondary/6 text-secondary'
  if (r <= -0.5) return 'bg-error/20 text-error'
  if (r <= -0.2) return 'bg-error/10 text-error'
  if (r <= -0.05) return 'bg-error/6 text-error'
  return 'bg-surface-container-highest text-on-surface-variant'
}

function corrLabel(r: number) {
  const abs = Math.abs(r)
  const strength = abs >= 0.6 ? 'Strong' : abs >= 0.3 ? 'Moderate' : abs >= 0.1 ? 'Slight' : 'Negligible'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)} ${strength}`
}

function averageCorrelation(matrix?: number[][] | null) {
  if (!matrix || matrix.length < 2) return null
  const values: number[] = []
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) values.push(matrix[i][j])
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function evBadge(evPct: number | null | undefined) {
  if (evPct == null || !Number.isFinite(evPct)) {
    return <span className="px-2 py-0.5 rounded-lg border text-xs font-bold text-on-surface-variant bg-surface-container-highest border-outline-variant/20">UNMODELED</span>
  }
  const sign = evPct > 0 ? '+' : ''
  const cls = evPct > 5 ? 'text-secondary bg-secondary/12 border-secondary/30'
    : evPct > 0 ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
      : evPct > -5 ? 'text-on-surface-variant bg-surface-container-highest border-outline-variant/20'
        : 'text-error bg-error/10 border-error/30'
  return <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${cls}`}>{sign}{evPct.toFixed(1)}% EV</span>
}

function CorrelationMatrix({ matrix }: { matrix: number[][] }) {
  const n = matrix.length
  if (n < 2) return null
  return (
    <div>
      <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">Empirical Correlation Matrix</h3>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead><tr><th className="w-24" />{matrix.map((_, j) => <th key={j} className="px-2 py-1 text-on-surface-variant font-normal text-center">{j + 1}</th>)}</tr></thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="pr-2 text-on-surface-variant text-right"><span className="inline-block w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] text-center leading-5 mr-1 font-bold">{i + 1}</span></td>
                {row.map((r, j) => (
                  <td key={j} className="p-0.5">
                    {i === j
                      ? <div className="w-14 h-7 bg-surface-container-highest rounded-lg flex items-center justify-center text-on-surface-variant">—</div>
                      : <div className={`w-14 h-7 rounded-lg flex items-center justify-center font-mono text-[10px] ${corrColor(r)}`}>{r >= 0 ? '+' : ''}{r.toFixed(2)}</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1">
        {matrix.map((row, i) => row.slice(i + 1).map((r, offset) => {
          const j = i + 1 + offset
          return <div key={`${i}-${j}`} className="flex items-center justify-between text-xs"><span className="text-on-surface-variant"><span className="text-primary">#{i + 1}</span> × <span className="text-primary">#{j + 1}</span></span><span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${corrColor(r)}`}>{corrLabel(r)}</span></div>
        }))}
      </div>
    </div>
  )
}

function LegPicker({ eventData, selected, onAdd }: {
  eventData: any
  selected: SelectedLeg[]
  onAdd: (leg: SelectedLeg) => void
}) {
  const [filter, setFilter] = useState('ALL')
  const types = ['ALL', 'PLAYER_PROP', 'PLAYER_PROP_ALTERNATE', 'MONEYLINE', 'SPREAD', 'TOTAL']
  const markets = (eventData?.legs ?? []).filter((market: any) => filter === 'ALL' || market.marketType === filter)
  const eventId = eventData?.eventId ?? ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {types.map(type => (
          <button key={type} onClick={() => setFilter(type)} className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${filter === type ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40'}`}>
            {type.startsWith('PLAYER_PROP') ? (type === 'PLAYER_PROP' ? 'Props' : 'Alt Props') : type === 'ALL' ? 'All' : type}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        {markets.flatMap((market: any) =>
          market.outcomes.map((outcome: any) => {
            const key = `${eventId}-${market.marketId}-${outcome.outcome}-${outcome.line ?? 'none'}-${outcome.bookId ?? 'book'}`
            const alreadyAdded = selected.some(leg =>
              leg.eventId === eventId &&
              leg.marketId === market.marketId &&
              leg.outcome === outcome.outcome &&
              (leg.line ?? null) === (outcome.line ?? null)
            )
            const playerName = market.player?.name
            const label = playerName
              ? `${playerName} ${String(outcome.outcome).toUpperCase()}${outcome.line != null ? ` ${outcome.line}` : ''} (${market.propStatType ?? market.marketType})`
              : `${String(outcome.outcome).toUpperCase()}${outcome.line != null ? ` ${outcome.line}` : ''} ${market.marketType}`
            return (
              <div key={key} className="flex items-center justify-between bg-surface-container-high/60 rounded-xl px-3 py-2.5 border border-outline-variant/10">
                <div className="flex-1 min-w-0"><div className="text-xs text-on-surface truncate">{label}</div><div className="text-[10px] text-on-surface-variant">{outcome.bookName ?? market.marketType}</div></div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className={`text-xs font-mono font-bold ${outcome.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>{fmtOdds(outcome.odds)}</span>
                  <button disabled={alreadyAdded} onClick={() => onAdd({ marketId: market.marketId, eventId, outcome: String(outcome.outcome).toLowerCase(), label, odds: outcome.odds, bookId: outcome.bookId, bookName: outcome.bookName, line: outcome.line ?? undefined, marketType: market.marketType, propStatType: market.propStatType ?? undefined })} className={`w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${alreadyAdded ? 'bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed' : 'bg-primary/20 text-primary hover:bg-primary/35'}`}>{alreadyAdded ? '✓' : '+'}</button>
                </div>
              </div>
            )
          })
        )}
        {markets.length === 0 && <div className="text-center text-on-surface-variant text-xs py-6">No markets available for this type</div>}
      </div>
    </div>
  )
}

export default function ParlayBuilderPage() {
  const [mode, setMode] = useState<'sgp' | 'parlay'>('sgp')
  const [selectedEvent, setSelectedEvent] = useState('')
  const [legs, setLegs] = useState<SelectedLeg[]>([])
  const [analysis, setAnalysis] = useState<any>(null)
  const [showLegPicker, setShowLegPicker] = useState(true)
  const [ticketStake, setTicketStake] = useState(25)
  const [tracking, setTracking] = useState(false)

  const { data: eventsData } = useQuery({
    queryKey: ['events-scheduled'],
    queryFn: () => sportsApi.getEvents('nba', { status: 'SCHEDULED' }),
    staleTime: 60_000,
    select: (response) => (response.data?.events ?? response.data ?? []) as any[],
  })
  const events = eventsData ?? []

  useEffect(() => {
    if (!selectedEvent && events.length > 0) setSelectedEvent(events[0].id)
  }, [events, selectedEvent])

  const { data: eventMarketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ['parlay-markets', selectedEvent],
    queryFn: () => parlayApi.getEventMarkets(selectedEvent),
    enabled: !!selectedEvent,
    staleTime: 30_000,
    select: (response) => response.data,
  })

  const { data: suggestedData } = useQuery({
    queryKey: ['sgp-suggest', selectedEvent],
    queryFn: () => parlayApi.suggestLegs(selectedEvent, 6),
    enabled: !!selectedEvent && mode === 'sgp',
    staleTime: 60_000,
    select: (response) => response.data,
  })

  const analyzeMutation = useMutation({
    mutationFn: () => mode === 'sgp'
      ? parlayApi.analyzeSGP(selectedEvent, legs.map(leg => ({ marketId: leg.marketId, outcome: leg.outcome })))
      : parlayApi.analyzeParlay(legs.map(leg => ({ marketId: leg.marketId, outcome: leg.outcome }))),
    onSuccess: (response) => setAnalysis(response.data),
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'Analysis failed'),
  })

  const addLeg = (leg: SelectedLeg) => {
    if (legs.some(existing => existing.eventId === leg.eventId && existing.marketId === leg.marketId && existing.outcome === leg.outcome && (existing.line ?? null) === (leg.line ?? null))) return
    setLegs(previous => [...previous, leg])
    setAnalysis(null)
  }

  const removeLeg = (index: number) => {
    setLegs(previous => previous.filter((_, itemIndex) => itemIndex !== index))
    setAnalysis(null)
  }

  const addSuggestedLeg = (suggestion: any) => {
    const label = suggestion.playerName
      ? `${suggestion.playerName} ${String(suggestion.outcome).toUpperCase()}${suggestion.line != null ? ` ${suggestion.line}` : ''} (${suggestion.propStatType ?? suggestion.marketType})`
      : `${String(suggestion.outcome).toUpperCase()} ${suggestion.marketType}`
    addLeg({
      marketId: suggestion.marketId,
      eventId: selectedEvent,
      outcome: String(suggestion.outcome).toLowerCase(),
      label,
      odds: suggestion.bestOdds,
      bookId: suggestion.bookId,
      bookName: suggestion.bestBook,
      line: suggestion.line ?? undefined,
      marketType: suggestion.marketType,
      propStatType: suggestion.propStatType ?? undefined,
    })
  }

  const trackParlay = async () => {
    if (!analysis || tracking || ticketStake <= 0) return
    const analyzedLegs = analysis.legs ?? []
    const items: TrackedWagerInput[] = analyzedLegs.map((leg: any, index: number) => {
      const selected = legs[index]
      const outcome = String(leg.outcome ?? selected?.outcome ?? '').toLowerCase()
      return {
        marketId: leg.marketId ?? selected?.marketId,
        eventId: leg.event?.id ?? selected?.eventId ?? analysis.event?.id ?? selectedEvent,
        bookId: leg.bookId ?? selected?.bookId,
        outcome,
        odds: leg.bestOdds ?? selected?.odds,
        recommendedLine: leg.line ?? selected?.line,
        direction: canonicalDirection(outcome),
        propStatType: leg.propStatType ?? selected?.propStatType,
        ev: leg.ev?.evPct,
      }
    })
    if (items.some(item => !item.marketId || !item.eventId || !item.bookId || !Number.isFinite(item.odds))) {
      toast.error('Parlay cannot be tracked until every leg has an exact market, event, sportsbook and price')
      return
    }

    setTracking(true)
    try {
      await betslipApi.submitTrackedParlay(
        `${mode === 'sgp' ? 'SGP' : 'Parlay'} ${new Date().toISOString()}`,
        ticketStake,
        items,
      )
      toast.success('Parlay persisted for CLV and settlement tracking')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Failed to persist parlay')
    } finally {
      setTracking(false)
    }
  }

  const eventLabel = (event: any) => `${event.awayTeam?.abbreviation ?? event.away} @ ${event.homeTeam?.abbreviation ?? event.home}`
  const matrix = analysis?.correlationModel?.matrix ?? null
  const avgCorrelation = averageCorrelation(matrix)
  const unmodeled = analysis?.probabilityModel === 'UNMODELED_SAME_EVENT_DEPENDENCE' || analysis?.correlationModel?.status === 'UNMODELED'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3"><span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>layers</span>Parlay Builder</h1>
        <p className="text-on-surface-variant text-sm mt-1">Empirical same-game dependence · explicit unmodeled states · exact tracked ticket settlement</p>
      </div>

      <div className="flex gap-1 border-b border-outline-variant/10">
        {([{ key: 'sgp', label: 'Same-Game Parlay (SGP)' }, { key: 'parlay', label: 'Multi-Game Parlay' }] as const).map(({ key, label }) => (
          <button key={key} onClick={() => { setMode(key); setLegs([]); setAnalysis(null) }} className={`px-4 py-2.5 text-sm font-headline font-bold transition-colors border-b-2 ${mode === key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="card">
            <label className="label-sm mb-2">{mode === 'sgp' ? 'Game (all legs must share this event)' : 'Browse a game, add legs, then switch games to build a multi-game ticket'}</label>
            <div className="relative">
              <select value={selectedEvent} onChange={event => { const next = event.target.value; setSelectedEvent(next); if (mode === 'sgp') setLegs([]); setAnalysis(null) }} className="input-field w-full appearance-none pr-8">
                <option value="">— Select a game —</option>
                {events.map((event: any) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            </div>

            {mode === 'sgp' && suggestedData?.suggested?.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-1 text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2"><Star size={10} /> Opportunity-First positive-EV suggestions</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedData.suggested.map((suggestion: any, index: number) => (
                    <button key={index} onClick={() => addSuggestedLeg(suggestion)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-400/10 border border-yellow-400/25 rounded-xl text-xs hover:bg-yellow-400/20 transition-colors"><Plus size={10} className="text-yellow-400" /><span className="text-on-surface max-w-[160px] truncate">{suggestion.playerName ? `${suggestion.playerName} ${suggestion.outcome}` : `${suggestion.outcome} ${suggestion.marketType}`}</span><span className="text-secondary font-mono font-bold">{fmtOdds(suggestion.bestOdds)}</span></button>
                  ))}
                </div>
                {suggestedData.correlationModel?.status === 'UNMODELED' && <p className="text-[10px] text-on-surface-variant mt-2">Correlation optimization withheld: {suggestedData.correlationModel.reason}.</p>}
              </div>
            )}
          </div>

          {selectedEvent && (
            <div className="card">
              <button onClick={() => setShowLegPicker(value => !value)} className="flex items-center justify-between w-full text-sm font-headline font-bold text-on-surface mb-3"><span>Available Legs {marketsLoading ? '(loading…)' : ''}</span><ChevronDown size={14} className={`text-on-surface-variant transition-transform ${showLegPicker ? 'rotate-180' : ''}`} /></button>
              {showLegPicker && !marketsLoading && eventMarketsData && <LegPicker eventData={eventMarketsData} selected={legs} onAdd={addLeg} />}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3"><span className="text-sm font-headline font-bold text-on-surface">Selected Legs ({legs.length})</span>{legs.length > 0 && <button onClick={() => { setLegs([]); setAnalysis(null) }} className="text-xs text-on-surface-variant hover:text-error transition-colors">Clear all</button>}</div>
            {legs.length === 0 ? <div className="text-center text-on-surface-variant text-xs py-6"><span className="material-symbols-outlined opacity-30 mb-2" style={{ fontSize: '28px', display: 'block' }}>layers</span>Add at least 2 legs from the picker</div> : (
              <div className="space-y-1.5">{legs.map((leg, index) => <div key={`${leg.eventId}-${leg.marketId}-${leg.outcome}-${leg.line ?? index}`} className="flex items-center justify-between bg-surface-container-high/60 rounded-xl px-3 py-2.5 border border-outline-variant/10"><div className="flex items-center gap-2 min-w-0"><span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{index + 1}</span><div className="min-w-0"><span className="text-xs text-on-surface truncate block">{leg.label}</span><span className="text-[9px] text-on-surface-variant">{leg.bookName ?? 'Book'} · {leg.eventId === selectedEvent ? 'current game' : 'other game'}</span></div></div><div className="flex items-center gap-2 ml-2 shrink-0"><span className={`text-xs font-mono font-bold ${leg.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>{fmtOdds(leg.odds)}</span><button onClick={() => removeLeg(index)} className="text-on-surface-variant hover:text-error transition-colors"><X size={12} /></button></div></div>)}</div>
            )}
            {legs.length >= 2 && <button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} className="btn-primary w-full mt-4">{analyzeMutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Analyzing…</> : <><Zap size={14} /> Analyze {mode === 'sgp' ? 'SGP' : 'Parlay'}</>}</button>}
          </div>

          {analysis && (
            <div className="card space-y-4">
              <h3 className="text-sm font-headline font-bold text-on-surface">Analysis Results</h3>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Parlay Odds" value={fmtOdds(analysis.parlayOddsAmerican)} />
                <Metric label="Decimal" value={`${analysis.parlayOddsDecimal}x`} />
                <Metric label={mode === 'sgp' ? 'Independent Prob' : 'True Probability'} value={analysis.indepProb != null ? `${analysis.indepProb.toFixed(1)}%` : analysis.trueProb != null ? `${analysis.trueProb.toFixed(1)}%` : 'UNMODELED'} />
                {mode === 'sgp' && <Metric label="Correlation-Adj Prob" value={analysis.corrProb != null ? `${analysis.corrProb.toFixed(1)}%` : 'WITHHELD'} />}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-xs text-on-surface-variant">{mode === 'sgp' ? 'Independent EV' : 'Parlay EV'}</span>{evBadge(analysis.indepEVPct ?? analysis.evPct)}</div>
                {mode === 'sgp' && <div className="flex items-center justify-between"><span className="text-xs text-on-surface-variant">Correlation-Adjusted EV</span>{evBadge(analysis.corrEVPct)}</div>}
                {mode === 'sgp' && analysis.evImprovementPct != null && <div className="flex items-center justify-between"><span className="text-xs text-on-surface-variant">EV Impact from Correlations</span><span className={`text-xs font-bold flex items-center gap-1 ${analysis.evImprovementPct > 0 ? 'text-secondary' : 'text-error'}`}>{analysis.evImprovementPct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{analysis.evImprovementPct > 0 ? '+' : ''}{analysis.evImprovementPct.toFixed(1)}%</span></div>}
                {avgCorrelation != null && <div className="flex items-center justify-between"><span className="text-xs text-on-surface-variant">Avg empirical correlation</span><span className={`text-xs font-mono ${avgCorrelation > 0.1 ? 'text-secondary' : avgCorrelation < -0.1 ? 'text-error' : 'text-on-surface-variant'}`}>{avgCorrelation >= 0 ? '+' : ''}{avgCorrelation.toFixed(2)}</span></div>}
              </div>

              {(analysis.warning || unmodeled) && <div className="flex gap-2 bg-yellow-400/10 border border-yellow-400/25 rounded-xl p-3 text-xs text-yellow-300"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{analysis.warning ?? 'Dependence is unmodeled; probability and EV are withheld rather than guessed.'}</div>}
              {mode === 'sgp' && matrix && <CorrelationMatrix matrix={matrix} />}

              <div>
                <h4 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">Leg Breakdown</h4>
                <div className="space-y-1.5">{(analysis.legs ?? []).map((leg: any, index: number) => <div key={`${leg.marketId}-${index}`} className="flex items-center justify-between text-xs bg-surface-container-high/50 rounded-xl px-3 py-2.5 border border-outline-variant/10"><div className="flex items-center gap-2 min-w-0"><span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">{index + 1}</span><div className="min-w-0"><div className="text-on-surface truncate">{leg.playerName ?? leg.player?.name ?? leg.event?.home ?? ''} {leg.outcome}{leg.line != null ? ` ${leg.line}` : ''}</div><div className="text-on-surface-variant/60">{leg.marketType} · {leg.bestBook ?? ''}</div></div></div><div className="flex items-center gap-2 shrink-0 ml-2"><span className="text-on-surface-variant">{leg.probability != null ? `${(leg.probability * 100).toFixed(0)}%` : '—'}</span>{evBadge(leg.ev?.evPct)}</div></div>)}</div>
              </div>

              <div className="border-t border-outline-variant/10 pt-3 space-y-2">
                <label className="label-sm">Ticket Stake</label>
                <input type="number" min={0.01} step={1} value={ticketStake} onChange={event => setTicketStake(Number(event.target.value))} className="input-field w-full" />
                <p className="text-[10px] text-on-surface-variant">Tracking records the exact ticket for settlement/CLV analytics. It does not place a sportsbook order.</p>
                <button onClick={trackParlay} disabled={tracking || ticketStake <= 0} className="btn-secondary w-full disabled:opacity-50"><Plus size={14} /> {tracking ? 'Saving…' : `Track Parlay (${fmtOdds(analysis.parlayOddsAmerican)})`}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface-container-high/60 rounded-xl p-3 text-center border border-outline-variant/10"><div className="text-xs text-on-surface-variant mb-0.5">{label}</div><div className="text-sm font-headline font-bold text-on-surface">{value}</div></div>
}

function canonicalDirection(outcome: string): 'OVER' | 'UNDER' | 'HOME' | 'AWAY' | 'YES' | 'NO' | 'OTHER' {
  const normalized = outcome.trim().toUpperCase()
  if (['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO'].includes(normalized)) return normalized as any
  return 'OTHER'
}
