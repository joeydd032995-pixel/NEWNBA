import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, TrendingDown, ChevronDown, ChevronUp, CheckCircle, XCircle, MinusCircle, Star } from 'lucide-react'
import { expertPicksApi, evApi } from '../lib/api'
import toast from 'react-hot-toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={`${n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-on-surface-variant/40'} ${onChange ? 'cursor-pointer' : ''}`}
          onClick={() => onChange?.(n)}
        />
      ))}
    </div>
  )
}

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-xs text-on-surface-variant italic">Pending</span>
  if (result === 'WIN')  return <span className="flex items-center gap-1 text-xs text-secondary"><CheckCircle size={11} />Win</span>
  if (result === 'LOSS') return <span className="flex items-center gap-1 text-xs text-error"><XCircle size={11} />Loss</span>
  return <span className="flex items-center gap-1 text-xs text-yellow-400"><MinusCircle size={11} />Push</span>
}

function PublicVsExpert({ publicPct, expertPct }: { publicPct: number; expertPct: number }) {
  const diff = expertPct - publicPct
  const color = diff > 0 ? 'text-secondary' : 'text-error'
  return (
    <div className="text-xs">
      <div className="flex gap-2">
        <span className="text-on-surface-variant">Public: <span className="text-on-surface">{publicPct}%</span></span>
        <span className="text-on-surface-variant">Experts: <span className={color}>{expertPct}%</span></span>
      </div>
      {Math.abs(diff) >= 20 && (
        <div className={`mt-0.5 font-semibold ${color}`}>
          {diff > 0 ? '↑ Sharp lean' : '↓ Fade opportunity'}
        </div>
      )}
    </div>
  )
}

// ─── Add Pick Form ───────────────────────────────────────────────────────────

function AddPickForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    expertName: '',
    source: 'manual',
    marketId: '',
    outcome: 'over',
    odds: '',
    confidence: 3,
    reasoning: '',
  })

  const { data: evData } = useQuery({
    queryKey: ['ev-feed-slim'],
    queryFn: () => evApi.getFeed({ sport: 'nba', limit: 100 }),
    staleTime: 60_000,
  })
  const markets: any[] = evData?.data ?? []

  const mutation = useMutation({
    mutationFn: () =>
      expertPicksApi.create({
        ...form,
        odds: form.odds ? Number(form.odds) : undefined,
        confidence: Number(form.confidence),
      }),
    onSuccess: () => {
      toast.success('Expert pick logged!')
      setForm({ expertName: '', source: 'manual', marketId: '', outcome: 'over', odds: '', confidence: 3, reasoning: '' })
      setOpen(false)
      onCreated()
    },
    onError: () => toast.error('Failed to log pick'),
  })

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="card">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-headline font-bold text-on-surface w-full"
      >
        <Plus size={15} className="text-primary" />
        Log Expert Pick
        {open ? <ChevronUp size={14} className="ml-auto text-on-surface-variant" /> : <ChevronDown size={14} className="ml-auto text-on-surface-variant" />}
      </button>

      {open && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Expert / Source Name</label>
            <input
              className="input-field"
              placeholder="e.g. ESPN, Sharp Action, John Doe"
              value={form.expertName}
              onChange={e => set('expertName', e.target.value)}
            />
          </div>
          <div>
            <label className="label-sm">Platform / Source</label>
            <select className="input-field" value={form.source} onChange={e => set('source', e.target.value)}>
              <option value="manual">Manual</option>
              <option value="espn">ESPN</option>
              <option value="vsin">VSiN</option>
              <option value="pickswise">Pickswise</option>
              <option value="sharpsports">SharpSports</option>
              <option value="dimers">Dimers</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="label-sm">Market</label>
            <select className="input-field" value={form.marketId} onChange={e => set('marketId', e.target.value)}>
              <option value="">— Select market —</option>
              {markets.map((m: any) => {
                const home = m.market?.event?.homeTeam?.abbreviation ?? '?'
                const away = m.market?.event?.awayTeam?.abbreviation ?? '?'
                const type = m.market?.marketType ?? 'ML'
                return (
                  <option key={m.marketId ?? m.id} value={m.marketId ?? m.id}>
                    {away} @ {home} · {type}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="label-sm">Outcome</label>
            <select className="input-field" value={form.outcome} onChange={e => set('outcome', e.target.value)}>
              <option value="over">Over</option>
              <option value="under">Under</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
              <option value="spread_home">Spread Home</option>
              <option value="spread_away">Spread Away</option>
            </select>
          </div>

          <div>
            <label className="label-sm">Odds (American, optional)</label>
            <input
              className="input-field"
              type="number"
              placeholder="-110"
              value={form.odds}
              onChange={e => set('odds', e.target.value)}
            />
          </div>

          <div>
            <label className="label-sm">Confidence</label>
            <div className="pt-2">
              <StarRating value={form.confidence} onChange={v => set('confidence', v)} />
            </div>
          </div>

          <div className="col-span-2">
            <label className="label-sm">Reasoning (optional)</label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Why is this a good bet?"
              value={form.reasoning}
              onChange={e => set('reasoning', e.target.value)}
            />
          </div>

          <div className="col-span-2 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => mutation.mutate()}
              disabled={!form.expertName || !form.marketId || mutation.isPending}
            >
              {mutation.isPending ? 'Logging…' : 'Log Pick'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Contrarian Signals ──────────────────────────────────────────────────────

function ContrarianSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['contrarian'],
    queryFn: () => expertPicksApi.getContrarian(),
    staleTime: 60_000,
  })
  const items: any[] = data?.data ?? []

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-black text-on-surface-variant uppercase tracking-widest">
        <TrendingDown size={13} className="text-secondary" />
        Beat-the-Public Signals ({items.length})
      </div>
      {isLoading && <div className="text-on-surface-variant text-sm">Loading…</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-on-surface-variant text-sm py-8 text-center card">
          No contrarian signals right now — log picks and sync public data to see disagreements.
        </div>
      )}
      {items.map((item: any, i: number) => {
        const home = item.market?.event?.homeTeam?.abbreviation ?? '?'
        const away = item.market?.event?.awayTeam?.abbreviation ?? '?'
        const type = item.market?.marketType ?? ''
        return (
          <div key={i} className="bg-secondary/8 border border-secondary/25 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-headline font-bold text-on-surface text-sm">{away} @ {home}</span>
                <span className="text-on-surface-variant text-xs ml-2">{type}</span>
              </div>
              <span className="text-xs text-secondary font-bold uppercase">{item.expertOutcome}</span>
            </div>
            <PublicVsExpert publicPct={item.publicPctBets} expertPct={item.expertPct} />
            <div className="text-xs text-on-surface-variant mt-1">
              {item.expertCount}/{item.totalExperts} experts · {item.publicPctMoney}% public money
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const RESULT_OPTIONS = ['WIN', 'LOSS', 'PUSH'] as const

export default function ExpertPicksPage() {
  const [tab, setTab] = useState<'feed' | 'contrarian'>('feed')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['expert-picks'],
    queryFn: () => expertPicksApi.getAll({ limit: 100 }),
    staleTime: 30_000,
  })
  const picks: any[] = data?.data ?? []

  const resolveMutation = useMutation({
    mutationFn: ({ id, result }: { id: string; result: 'WIN' | 'LOSS' | 'PUSH' }) =>
      expertPicksApi.resolve(id, result),
    onSuccess: () => {
      toast.success('Pick resolved!')
      setResolvingId(null)
      qc.invalidateQueries({ queryKey: ['expert-picks'] })
    },
    onError: () => toast.error('Failed to resolve pick'),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['expert-picks'] })

  const pending = picks.filter(p => !p.result)
  const resolved = picks.filter(p => p.result)
  const wins = resolved.filter(p => p.result === 'WIN').length
  const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>star</span>
            Expert Picks
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Track expert consensus vs public money — find Beat-the-Public opportunities</p>
        </div>
        <button onClick={invalidate} className="btn-secondary">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Picks', value: picks.length },
          { label: 'Pending', value: pending.length },
          { label: 'Resolved', value: resolved.length },
          { label: 'Win Rate', value: winRate !== null ? `${winRate}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center py-4">
            <div className="text-2xl font-headline font-black text-on-surface">{value}</div>
            <div className="text-xs text-on-surface-variant mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      <AddPickForm onCreated={invalidate} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant/10">
        {(['feed', 'contrarian'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-headline font-bold capitalize transition-colors border-b-2 ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t === 'contrarian' ? 'Beat the Public' : 'All Picks'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'contrarian' ? (
        <ContrarianSection />
      ) : (
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-36 text-on-surface-variant text-sm">Loading picks…</div>
          ) : picks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-on-surface-variant text-sm gap-2">
              <span className="material-symbols-outlined opacity-30" style={{ fontSize: '32px' }}>star</span>
              No expert picks yet — log the first one above.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                  <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Market</th>
                  <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Expert</th>
                  <th className="text-center py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Outcome</th>
                  <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Odds</th>
                  <th className="text-center py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Conf</th>
                  <th className="text-right py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Public %</th>
                  <th className="text-center py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Result</th>
                  <th className="text-left py-3 px-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Reasoning</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {picks.map((pick: any) => {
                  const home = pick.market?.event?.homeTeam?.abbreviation ?? '?'
                  const away = pick.market?.event?.awayTeam?.abbreviation ?? '?'
                  const type = pick.market?.marketType ?? ''
                  const playerName = pick.market?.player?.name
                  return (
                    <tr key={pick.id} className="hover:bg-surface-container-high/30 transition-colors">
                      {/* Market */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-on-surface text-xs">{away} @ {home}</div>
                        {playerName && <div className="text-xs text-primary">{playerName}</div>}
                        <div className="text-xs text-on-surface-variant">{type}</div>
                      </td>

                      {/* Expert */}
                      <td className="py-3 px-4">
                        <div className="text-on-surface text-xs font-medium">{pick.expertName}</div>
                        <div className="text-xs text-on-surface-variant capitalize">{pick.source}</div>
                      </td>

                      {/* Outcome */}
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-lg ${
                          ['over', 'home'].includes(pick.outcome)
                            ? 'text-secondary bg-secondary/10 border border-secondary/20'
                            : 'text-error bg-error/10 border border-error/20'
                        }`}>
                          {pick.outcome}
                        </span>
                      </td>

                      {/* Odds */}
                      <td className="py-3 px-4 text-right font-mono text-xs text-on-surface">
                        {pick.odds ? `${pick.odds > 0 ? '+' : ''}${pick.odds}` : '—'}
                      </td>

                      {/* Confidence */}
                      <td className="py-3 px-4 text-center">
                        <StarRating value={pick.confidence} />
                      </td>

                      {/* Public split */}
                      <td className="py-3 px-4 text-right text-xs">
                        {pick.publicSplit ? (
                          <div className={
                            pick.publicSplit.pctBets <= 40 ? 'text-secondary' :
                            pick.publicSplit.pctBets >= 60 ? 'text-error' : 'text-on-surface-variant'
                          }>
                            {pick.publicSplit.pctBets.toFixed(0)}% bets<br />
                            {pick.publicSplit.pctMoney.toFixed(0)}% $
                          </div>
                        ) : <span className="text-on-surface-variant/40">—</span>}
                      </td>

                      {/* Result */}
                      <td className="py-3 px-4 text-center">
                        <ResultBadge result={pick.result} />
                      </td>

                      {/* Reasoning */}
                      <td className="py-3 px-4 text-xs text-on-surface-variant max-w-[180px] truncate">
                        {pick.reasoning || <span className="text-on-surface-variant/40 italic">—</span>}
                      </td>

                      {/* Resolve */}
                      <td className="py-3 px-4 text-right">
                        {!pick.result && (
                          resolvingId === pick.id ? (
                            <div className="flex gap-1">
                              {RESULT_OPTIONS.map(r => (
                                <button
                                  key={r}
                                  onClick={() => resolveMutation.mutate({ id: pick.id, result: r })}
                                  className={`px-1.5 py-0.5 text-xs rounded-lg font-bold ${
                                    r === 'WIN' ? 'bg-secondary/20 text-secondary hover:bg-secondary/30' :
                                    r === 'LOSS' ? 'bg-error/20 text-error hover:bg-error/30' :
                                    'bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                              <button onClick={() => setResolvingId(null)} className="text-on-surface-variant hover:text-on-surface text-xs px-1">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setResolvingId(pick.id)}
                              className="text-xs text-on-surface-variant hover:text-primary transition-colors"
                            >
                              Resolve
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
