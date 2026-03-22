import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, TrendingDown, ChevronDown, ChevronUp, CheckCircle, XCircle, MinusCircle, Star, Shield, Zap, Bell, ArrowUpRight } from 'lucide-react'
import { expertPicksApi, evApi, arbApi } from '../lib/api'
import toast from 'react-hot-toast'

// ─── Helpers ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={`${n <= value ? 'text-primary fill-primary' : 'text-on-surface-variant/40'} ${onChange ? 'cursor-pointer' : ''}`}
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
  return <span className="flex items-center gap-1 text-xs text-primary"><MinusCircle size={11} />Push</span>
}

function ExpertAvatar({ name, tier }: { name: string; tier?: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-14 h-14 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-primary font-headline font-black text-lg shadow-card">
      {initials}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === 'ELITE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-primary/20 text-primary border border-primary/30">
        <Zap size={9} />
        Elite
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-secondary/15 text-secondary border border-secondary/30">
      <Shield size={9} />
      Verified
    </span>
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
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-5">
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
              <option value="">-- Select market --</option>
              {markets.map((m: any) => {
                const home = m.market?.event?.homeTeam?.abbreviation ?? '?'
                const away = m.market?.event?.awayTeam?.abbreviation ?? '?'
                const type = m.market?.marketType ?? 'ML'
                return (
                  <option key={m.marketId ?? m.id} value={m.marketId ?? m.id}>
                    {away} @ {home} -- {type}
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
              {mutation.isPending ? 'Logging...' : 'Log Pick'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Arbitrage Sidebar ──────────────────────────────────────────────────────

function ArbitrageSidebar() {
  const { data, isLoading } = useQuery({
    queryKey: ['arb-sidebar'],
    queryFn: () => arbitrageApi.getAll({ limit: 5 }),
    staleTime: 30_000,
  })
  const arbs: any[] = data?.data ?? []

  return (
    <div className="space-y-4">
      {/* Arbitrage Feed Card */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Arbitrage Feed</p>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/15 text-secondary border border-secondary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            LIVE
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : arbs.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant text-xs">
            No arbitrage opportunities found right now.
          </div>
        ) : (
          <div className="space-y-3">
            {arbs.map((arb: any, i: number) => {
              const home = arb.event?.homeTeam?.abbreviation ?? arb.homeTeam ?? '?'
              const away = arb.event?.awayTeam?.abbreviation ?? arb.awayTeam ?? '?'
              return (
                <div
                  key={arb.id ?? i}
                  className="bg-surface-container rounded-xl border border-outline-variant/15 p-3 hover:border-outline-variant/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-headline font-bold text-on-surface">{away} @ {home}</p>
                    <span className="text-[10px] font-bold text-secondary">
                      +{typeof arb.profitPct === 'number' ? arb.profitPct.toFixed(1) : arb.profitPct ?? '?'}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(arb.books ?? arb.outcomes ?? []).slice(0, 3).map((b: any, j: number) => (
                      <div key={j} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary/60" />
                        <span className="text-[10px] text-on-surface-variant">{b.bookName ?? b.book ?? '?'}</span>
                        <span className="text-[10px] font-mono text-on-surface">{b.odds ? (b.odds > 0 ? `+${b.odds}` : b.odds) : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Smart Alerts Card */}
      <div className="relative overflow-hidden rounded-xl border border-primary/30 p-5" style={{ background: 'linear-gradient(135deg, rgba(232,145,58,0.12) 0%, rgba(15,9,6,0.95) 60%)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Bell size={16} className="text-primary" />
          <p className="text-sm font-headline font-bold text-on-surface">Smart Alerts</p>
        </div>
        <p className="text-xs text-on-surface-variant mb-4">
          Get notified when expert consensus aligns with +EV opportunities.
        </p>
        <button className="btn-primary w-full text-xs py-2">
          <Bell size={12} />
          Enable Alerts
        </button>
      </div>
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
    <div className="space-y-3">
      {isLoading && <div className="text-on-surface-variant text-sm">Loading...</div>}
      {!isLoading && items.length === 0 && (
        <div className="text-on-surface-variant text-sm py-8 text-center bg-surface-container-low rounded-xl border border-outline-variant/20">
          No contrarian signals right now -- log picks and sync public data to see disagreements.
        </div>
      )}
      {items.map((item: any, i: number) => {
        const home = item.market?.event?.homeTeam?.abbreviation ?? '?'
        const away = item.market?.event?.awayTeam?.abbreviation ?? '?'
        const type = item.market?.marketType ?? ''
        const diff = (item.expertPct ?? 0) - (item.publicPctBets ?? 0)
        return (
          <div key={i} className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-5 group hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-headline font-bold text-on-surface text-sm">{away} @ {home}</span>
                <span className="text-on-surface-variant text-xs">{type}</span>
              </div>
              <span className="text-xs text-primary font-bold uppercase bg-primary/10 px-2 py-0.5 rounded-lg">{item.expertOutcome}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-surface-container rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Public</p>
                <p className="text-lg font-headline font-black text-on-surface">{item.publicPctBets}%</p>
              </div>
              <div className="bg-surface-container rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Experts</p>
                <p className={`text-lg font-headline font-black ${diff > 0 ? 'text-secondary' : 'text-error'}`}>{item.expertPct}%</p>
              </div>
            </div>
            <div className="text-xs text-on-surface-variant mt-2">
              {item.expertCount}/{item.totalExperts} experts aligned -- {item.publicPctMoney}% public money
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type TabKey = 'all' | 'sport' | 'leaderboard' | 'my-experts'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All Picks' },
  { key: 'sport', label: 'By Sport' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'my-experts', label: 'My Experts' },
]
const RESULT_OPTIONS = ['WIN', 'LOSS', 'PUSH'] as const

export default function ExpertPicksPage() {
  const [tab, setTab] = useState<TabKey>('all')
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
    <div className="space-y-6">
      {/* ── Page Header Bento ─────────────────────────────────────── */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black font-headline tracking-tighter text-on-surface">
              Expert Picks
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Track expert consensus vs public money -- find Beat-the-Public opportunities
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-surface-container rounded-xl border border-outline-variant/20 px-5 py-3 text-center min-w-[100px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-0.5">Total Picks</p>
              <p className="text-2xl font-headline font-black text-on-surface">{picks.length}</p>
            </div>
            <div className="bg-surface-container rounded-xl border border-outline-variant/20 px-5 py-3 text-center min-w-[100px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-secondary mb-0.5">Pending</p>
              <p className="text-2xl font-headline font-black text-on-surface">{pending.length}</p>
            </div>
            <button onClick={invalidate} className="btn-secondary">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── 12-col Grid Layout ────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">
        {/* ── Left: Picks (col-span-8) ──────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-5">
          {/* Add form */}
          <AddPickForm onCreated={invalidate} />

          {/* Underline Tab Bar */}
          <div className="relative flex border-b border-outline-variant/15">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-5 py-3 text-sm font-headline font-bold transition-colors ${
                  tab === t.key
                    ? 'text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === 'leaderboard' ? (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-8 text-center">
              <p className="text-on-surface-variant text-sm">Leaderboard coming soon -- track expert performance over time.</p>
            </div>
          ) : tab === 'sport' ? (
            <ContrarianSection />
          ) : tab === 'my-experts' ? (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-8 text-center">
              <p className="text-on-surface-variant text-sm">Save your favorite experts to track their picks here.</p>
            </div>
          ) : (
            /* All Picks */
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton h-40 w-full" />
                  ))}
                </div>
              ) : picks.length === 0 ? (
                <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-12 text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/30 mb-2" style={{ fontSize: '36px' }}>star</span>
                  <p className="text-on-surface-variant text-sm mt-2">No expert picks yet -- log the first one above.</p>
                </div>
              ) : (
                picks.map((pick: any) => {
                  const home = pick.market?.event?.homeTeam?.abbreviation ?? '?'
                  const away = pick.market?.event?.awayTeam?.abbreviation ?? '?'
                  const type = pick.market?.marketType ?? ''
                  const playerName = pick.market?.player?.name
                  const tier = pick.confidence >= 4 ? 'ELITE' : 'VERIFIED'

                  return (
                    <div
                      key={pick.id}
                      className="group relative bg-surface-container-low rounded-xl border border-outline-variant/20 p-6 pt-8 hover:border-primary/30 transition-colors"
                    >
                      {/* Floating Avatar */}
                      <div className="absolute -top-4 -left-4">
                        <ExpertAvatar name={pick.expertName} tier={tier} />
                      </div>

                      {/* Expert Info Row */}
                      <div className="flex items-center justify-between ml-12 mb-4">
                        <div className="flex items-center gap-2">
                          <p className="font-headline font-bold text-on-surface text-sm">{pick.expertName}</p>
                          <TierBadge tier={tier} />
                          <span className="text-xs text-on-surface-variant capitalize">{pick.source}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StarRating value={pick.confidence} />
                          <ResultBadge result={pick.result} />
                        </div>
                      </div>

                      {/* Two-column: Game Info + Expert Pick */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Game Info Card */}
                        <div className="bg-surface-container rounded-xl border border-outline-variant/15 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Game Info</p>
                          <p className="font-headline font-bold text-on-surface">{away} @ {home}</p>
                          {playerName && <p className="text-xs text-primary mt-1">{playerName}</p>}
                          <p className="text-xs text-on-surface-variant mt-1">{type}</p>
                          {pick.publicSplit && (
                            <div className="mt-2 flex gap-3 text-xs">
                              <span className="text-on-surface-variant">Public: <span className="text-on-surface">{pick.publicSplit.pctBets?.toFixed(0)}%</span></span>
                              <span className="text-on-surface-variant">Money: <span className="text-on-surface">{pick.publicSplit.pctMoney?.toFixed(0)}%</span></span>
                            </div>
                          )}
                        </div>

                        {/* Expert Pick Card */}
                        <div className="bg-surface-container rounded-xl border border-outline-variant/15 p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Expert Pick</p>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold uppercase px-3 py-1 rounded-xl ${
                              ['over', 'home'].includes(pick.outcome)
                                ? 'text-secondary bg-secondary/10 border border-secondary/20'
                                : 'text-error bg-error/10 border border-error/20'
                            }`}>
                              {pick.outcome}
                            </span>
                            {pick.odds && (
                              <span className="font-mono font-bold text-on-surface text-sm">
                                {pick.odds > 0 ? '+' : ''}{pick.odds}
                              </span>
                            )}
                          </div>
                          {pick.reasoning && (
                            <p className="text-xs text-on-surface-variant mt-2 line-clamp-2">{pick.reasoning}</p>
                          )}
                          {/* Resolve Controls */}
                          {!pick.result && (
                            <div className="mt-3 pt-2 border-t border-outline-variant/10">
                              {resolvingId === pick.id ? (
                                <div className="flex gap-1">
                                  {RESULT_OPTIONS.map(r => (
                                    <button
                                      key={r}
                                      onClick={() => resolveMutation.mutate({ id: pick.id, result: r })}
                                      className={`px-2 py-1 text-xs rounded-lg font-bold ${
                                        r === 'WIN' ? 'bg-secondary/20 text-secondary hover:bg-secondary/30' :
                                        r === 'LOSS' ? 'bg-error/20 text-error hover:bg-error/30' :
                                        'bg-primary/20 text-primary hover:bg-primary/30'
                                      }`}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                  <button onClick={() => setResolvingId(null)} className="text-on-surface-variant hover:text-on-surface text-xs px-1 ml-auto">Cancel</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setResolvingId(pick.id)}
                                  className="text-xs text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
                                >
                                  <ArrowUpRight size={11} />
                                  Resolve
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* ── Right: Arbitrage Sidebar (col-span-4) ────────────── */}
        <div className="col-span-12 lg:col-span-4">
          <ArbitrageSidebar />
        </div>
      </div>
    </div>
  )
}
