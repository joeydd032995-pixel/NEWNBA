import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Wallet, TrendingUp, AlertTriangle, PlusCircle, Calculator, RefreshCw } from 'lucide-react'
import { bankrollApi } from '../lib/api'
import { useBankrollStore, KellyFraction } from '../stores/bankroll'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

const KELLY_OPTIONS: { label: string; value: KellyFraction }[] = [
  { label: '¼ Kelly', value: 0.25 },
  { label: '½ Kelly', value: 0.5 },
  { label: '¾ Kelly', value: 0.75 },
  { label: 'Full Kelly', value: 1.0 },
]

function fmtOdds(o: number) {
  return o > 0 ? `+${o}` : `${o}`
}

function fmtPct(v: number, decimals = 1) {
  return `${(v * 100).toFixed(decimals)}%`
}

function fmtUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Stats Bar ───────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Kelly Calculator ─────────────────────────────────────────

function KellyCalculator({ bankroll, kellyFraction }: { bankroll: number; kellyFraction: KellyFraction }) {
  const [odds, setOdds] = useState('+110')
  const [prob, setProb] = useState('55')
  const [result, setResult] = useState<null | { stake: number; ev: number; evPct: number; kellyFull: number }>(null)

  const calcMut = useMutation({
    mutationFn: () =>
      bankrollApi.calculate({
        bankroll,
        odds: Number(odds),
        trueProb: Number(prob) / 100,
        fraction: kellyFraction,
      }),
    onSuccess: (res) => setResult(res.data),
    onError: () => toast.error('Calculation failed'),
  })

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={16} className="text-primary-400" />
        <h3 className="font-semibold text-white text-sm">Kelly Calculator</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">American Odds</label>
          <input
            type="text"
            value={odds}
            onChange={e => setOdds(e.target.value)}
            className="input-field w-full text-sm"
            placeholder="+110"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">True Probability (%)</label>
          <input
            type="number"
            value={prob}
            onChange={e => setProb(e.target.value)}
            className="input-field w-full text-sm"
            min={1}
            max={99}
            step={0.5}
          />
        </div>
      </div>
      <button
        onClick={() => calcMut.mutate()}
        disabled={calcMut.isPending}
        className="btn-primary w-full text-sm mb-3"
      >
        {calcMut.isPending ? 'Calculating…' : 'Calculate'}
      </button>
      {result && (
        <div className="bg-slate-800 rounded-lg p-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Recommended Stake</p>
            <p className="text-green-400 font-bold">{fmtUSD(result.stake)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">EV per $100</p>
            <p className={result.ev >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
              {fmtUSD(result.ev)}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">EV %</p>
            <p className="text-white">{fmtPct(result.evPct)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Full Kelly %</p>
            <p className="text-white">{fmtPct(result.kellyFull)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

export default function BankrollPage() {
  const { bankroll, kellyFraction, stopLossPct, setBankroll, setKellyFraction, setStopLoss, startSession, isStopLossHit, drawdownPct } = useBankrollStore()
  const { addItem } = useBetSlipStore()

  const [bankrollInput, setBankrollInput] = useState(String(bankroll))
  const [stopLossInput, setStopLossInput] = useState(String(stopLossPct))

  const stopLossHit = isStopLossHit()
  const ddPct = drawdownPct()

  const { data: portfolioData, isLoading: portLoading, refetch: refetchPort } = useQuery({
    queryKey: ['bankroll-portfolio', bankroll, kellyFraction],
    queryFn: () => bankrollApi.getPortfolio({ bankroll, kellyFraction }).then(r => r.data),
    staleTime: 60_000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['bankroll-stats'],
    queryFn: () => bankrollApi.getStats().then(r => r.data),
    staleTime: 120_000,
  })

  useEffect(() => {
    setBankrollInput(String(bankroll))
  }, [bankroll])

  const applySettings = () => {
    const b = Number(bankrollInput)
    const sl = Number(stopLossInput)
    if (b > 0) { setBankroll(b); startSession(b) }
    if (sl > 0 && sl < 100) setStopLoss(sl)
    toast.success('Settings updated')
    refetchPort()
  }

  const bets = portfolioData?.bets ?? []
  const growthHistory = statsData?.growthHistory ?? []

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet size={20} className="text-primary-400" />
          <h1 className="text-xl font-bold text-white">Bankroll Manager</h1>
        </div>
        <button onClick={() => refetchPort()} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <RefreshCw size={13} />
          Refresh Portfolio
        </button>
      </div>

      {/* Stop Loss Warning */}
      {stopLossHit && (
        <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertTriangle size={16} />
          <span><strong>Stop Loss Hit:</strong> Your bankroll has dropped {ddPct.toFixed(1)}% — consider pausing betting for today.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Settings + Calculator */}
        <div className="space-y-4">
          {/* Settings Card */}
          <div className="card p-4">
            <h3 className="font-semibold text-white text-sm mb-4">Session Settings</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Bankroll ($)</label>
                <input
                  type="number"
                  value={bankrollInput}
                  onChange={e => setBankrollInput(e.target.value)}
                  className="input-field w-full"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2">Kelly Fraction</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {KELLY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setKellyFraction(opt.value)}
                      className={`py-1.5 rounded text-sm font-medium transition-colors ${
                        kellyFraction === opt.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">¼ Kelly recommended for reduced variance</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stop Loss (%)</label>
                <input
                  type="number"
                  value={stopLossInput}
                  onChange={e => setStopLossInput(e.target.value)}
                  className="input-field w-full"
                  min={1}
                  max={50}
                />
              </div>
              <button onClick={applySettings} className="btn-primary w-full text-sm">
                Apply Settings
              </button>
            </div>
          </div>

          {/* Drawdown Meter */}
          <div className="card p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">Drawdown</span>
              <span className={`text-xs font-bold ${ddPct >= stopLossPct ? 'text-red-400' : ddPct >= stopLossPct * 0.7 ? 'text-yellow-400' : 'text-green-400'}`}>
                {ddPct.toFixed(1)}% / {stopLossPct}%
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  ddPct >= stopLossPct ? 'bg-red-500' : ddPct >= stopLossPct * 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (ddPct / stopLossPct) * 100)}%` }}
              />
            </div>
          </div>

          <KellyCalculator bankroll={bankroll} kellyFraction={kellyFraction} />
        </div>

        {/* Right: Stats + Chart + Portfolio */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats row */}
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card p-4 animate-pulse h-20 bg-slate-800" />
              ))}
            </div>
          ) : statsData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="ROI"
                value={fmtPct(statsData.roi)}
                sub={`${statsData.totalBets} bets`}
                color={statsData.roi >= 0 ? 'text-green-400' : 'text-red-400'}
              />
              <StatCard
                label="Record"
                value={`${statsData.won}W-${statsData.lost}L`}
                sub={statsData.pushed > 0 ? `${statsData.pushed} push` : undefined}
              />
              <StatCard
                label="Sharpe Ratio"
                value={statsData.sharpe.toFixed(2)}
                color={statsData.sharpe >= 1 ? 'text-green-400' : statsData.sharpe >= 0 ? 'text-yellow-400' : 'text-red-400'}
              />
              <StatCard
                label="Max Drawdown"
                value={fmtPct(statsData.maxDrawdown)}
                color={statsData.maxDrawdown > 0.15 ? 'text-red-400' : 'text-slate-300'}
              />
            </div>
          )}

          {/* Growth Chart */}
          {growthHistory.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-primary-400" />
                <h3 className="font-semibold text-white text-sm">Bankroll Growth</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={growthHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v: number) => [fmtUSD(v), 'Bankroll']}
                  />
                  <ReferenceLine y={statsData?.growthHistory?.[0]?.bankroll ?? 1000} stroke="#475569" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="bankroll" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Portfolio Table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">
                Kelly Portfolio
                {bets.length > 0 && <span className="ml-2 text-slate-500 font-normal">({bets.length} bets)</span>}
              </h3>
              {portfolioData && (
                <span className="text-xs text-slate-400">
                  Total stake: <span className="text-white font-medium">{fmtUSD(portfolioData.totalStake)}</span>
                  {' '}({((portfolioData.totalStake / bankroll) * 100).toFixed(1)}% of bankroll)
                </span>
              )}
            </div>

            {portLoading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Loading portfolio…</div>
            ) : bets.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                No +EV bets found. Run a scan from the EV Feed page.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-800">
                      <th className="text-left p-3">Event / Outcome</th>
                      <th className="text-left p-3">Book</th>
                      <th className="text-right p-3">Odds</th>
                      <th className="text-right p-3">EV %</th>
                      <th className="text-right p-3">Kelly</th>
                      <th className="text-right p-3">Stake</th>
                      <th className="text-right p-3">Public %</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {bets.map((bet) => (
                      <tr key={bet.marketOddsId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          <p className="text-white font-medium">{bet.outcome}</p>
                          <p className="text-slate-500 text-xs">{bet.eventName}</p>
                        </td>
                        <td className="p-3 text-slate-300">{bet.bookName}</td>
                        <td className="p-3 text-right">
                          <span className={bet.odds > 0 ? 'text-green-400 font-medium' : 'text-slate-300'}>
                            {fmtOdds(bet.odds)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-green-400 font-medium">{fmtPct(bet.evPct)}</span>
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          {fmtPct(bet.kellyFractional)}
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-primary-400 font-bold">{fmtUSD(bet.recommendedStake)}</span>
                        </td>
                        <td className="p-3 text-right">
                          {bet.publicBetPct !== null ? (
                            <span className={`text-xs font-medium ${
                              bet.publicBetPct <= 40 ? 'text-green-400' : bet.publicBetPct >= 60 ? 'text-red-400' : 'text-slate-400'
                            }`}>
                              {bet.publicBetPct.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              addItem({
                                eventId: '',
                                marketId: bet.marketOddsId,
                                eventName: bet.eventName,
                                outcome: bet.outcome,
                                odds: bet.odds,
                                ev: bet.evPct,
                              })
                              toast.success('Added to bet slip')
                            }}
                            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
                          >
                            <PlusCircle size={14} />
                            Add
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
      </div>
    </div>
  )
}
