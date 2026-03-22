import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { PlusCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { bankrollApi } from '../lib/api'
import { useBankrollStore, KellyFraction } from '../stores/bankroll'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

const KELLY_OPTIONS: { label: string; shortLabel: string; value: KellyFraction }[] = [
  { label: 'Full Kelly', shortLabel: '1/1', value: 1.0 },
  { label: '1/2 Kelly', shortLabel: '1/2', value: 0.5 },
  { label: '1/4 Kelly', shortLabel: '1/4', value: 0.25 },
  { label: '1/8 Kelly', shortLabel: '1/8', value: 0.75 },
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

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'text-on-surface',
}: {
  icon: string
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '18px' }}
        >
          {icon}
        </span>
        <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-headline font-black tracking-tight ${color}`}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant mt-1">{sub}</p>
      )}
    </div>
  )
}

// ─── Kelly Calculator ───────────────────────────────────────

function KellyCalculator({
  bankroll,
  kellyFraction,
}: {
  bankroll: number
  kellyFraction: KellyFraction
}) {
  const [odds, setOdds] = useState('+110')
  const [prob, setProb] = useState('55')
  const [result, setResult] = useState<null | {
    stake: number
    ev: number
    evPct: number
    kellyFull: number
  }>(null)

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
    <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: '18px' }}
        >
          calculate
        </span>
        <h3 className="font-headline font-bold text-on-surface text-sm">
          Kelly Calculator
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label-sm">American Odds</label>
          <input
            type="text"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
            className="input-field w-full text-sm"
            placeholder="+110"
          />
        </div>
        <div>
          <label className="label-sm">True Probability (%)</label>
          <input
            type="number"
            value={prob}
            onChange={(e) => setProb(e.target.value)}
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
        {calcMut.isPending ? 'Calculating...' : 'Calculate'}
      </button>

      {result && (
        <div className="bg-surface-container-high rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-on-surface-variant text-xs mb-0.5">
              Recommended Stake
            </p>
            <p className="text-secondary font-headline font-bold">
              {fmtUSD(result.stake)}
            </p>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs mb-0.5">
              EV per $100
            </p>
            <p
              className={`font-headline font-bold ${result.ev >= 0 ? 'text-secondary' : 'text-error'}`}
            >
              {fmtUSD(result.ev)}
            </p>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs mb-0.5">EV %</p>
            <p className="text-on-surface">{fmtPct(result.evPct)}</p>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs mb-0.5">
              Full Kelly %
            </p>
            <p className="text-on-surface">{fmtPct(result.kellyFull)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────

export default function BankrollPage() {
  const {
    bankroll,
    kellyFraction,
    stopLossPct,
    setBankroll,
    setKellyFraction,
    setStopLoss,
    startSession,
    isStopLossHit,
    drawdownPct,
  } = useBankrollStore()
  const { addItem } = useBetSlipStore()

  const [bankrollInput, setBankrollInput] = useState(String(bankroll))
  const [stopLossInput, setStopLossInput] = useState(String(stopLossPct))

  const stopLossHit = isStopLossHit()
  const ddPct = drawdownPct()

  const {
    data: portfolioData,
    isLoading: portLoading,
    refetch: refetchPort,
  } = useQuery({
    queryKey: ['bankroll-portfolio', bankroll, kellyFraction],
    queryFn: () =>
      bankrollApi
        .getPortfolio({ bankroll, kellyFraction })
        .then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['bankroll-stats'],
    queryFn: () => bankrollApi.getStats().then((r) => r.data),
    staleTime: 120_000,
  })

  useEffect(() => {
    setBankrollInput(String(bankroll))
  }, [bankroll])

  const applySettings = () => {
    const b = Number(bankrollInput)
    const sl = Number(stopLossInput)
    if (b > 0) {
      setBankroll(b)
      startSession(b)
    }
    if (sl > 0 && sl < 100) setStopLoss(sl)
    toast.success('Settings updated')
    refetchPort()
  }

  const bets = portfolioData?.bets ?? []
  const growthHistory = statsData?.growthHistory ?? []

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: '28px' }}
            >
              account_balance_wallet
            </span>
            Bankroll Manager
          </h1>
        </div>
        <button onClick={() => refetchPort()} className="btn-ghost text-xs">
          <RefreshCw size={13} />
          Refresh Portfolio
        </button>
      </div>

      {/* ── Stop Loss Warning ── */}
      {stopLossHit && (
        <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/30 rounded-xl text-error text-sm">
          <AlertTriangle size={16} />
          <span>
            <strong>Stop Loss Hit:</strong> Your bankroll has dropped{' '}
            {ddPct.toFixed(1)}% — consider pausing betting for today.
          </span>
        </div>
      )}

      {/* ── Session Settings Card ── */}
      <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: '20px' }}
            >
              tune
            </span>
            <h3 className="font-headline font-bold text-on-surface">
              Session Settings
            </h3>
          </div>
          <span className="badge-positive">ACTIVE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Total Bankroll */}
          <div>
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-1.5">
              Total Bankroll
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
                $
              </span>
              <input
                type="number"
                value={bankrollInput}
                onChange={(e) => setBankrollInput(e.target.value)}
                className="input-field pl-7"
                min={1}
              />
            </div>
          </div>

          {/* Kelly Fraction Strategy */}
          <div>
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-1.5">
              Kelly Fraction Strategy
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {KELLY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setKellyFraction(opt.value)}
                  className={`py-2 rounded-xl text-sm font-headline font-bold transition-colors ${
                    kellyFraction === opt.value
                      ? 'bg-primary text-on-primary-container'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Stop Loss Threshold */}
          <div>
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-1.5">
              Stop Loss Threshold
            </label>
            <div className="relative">
              <input
                type="number"
                value={stopLossInput}
                onChange={(e) => setStopLossInput(e.target.value)}
                className="input-field pr-8"
                min={1}
                max={50}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
                %
              </span>
            </div>
          </div>
        </div>

        {/* Drawdown Meter */}
        <div className="mt-5 pt-4 border-t border-outline-variant/15">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-on-surface-variant">Drawdown</span>
            <span
              className={`text-xs font-headline font-bold ${
                ddPct >= stopLossPct
                  ? 'text-error'
                  : ddPct >= stopLossPct * 0.7
                    ? 'text-yellow-400'
                    : 'text-secondary'
              }`}
            >
              {ddPct.toFixed(1)}% / {stopLossPct}%
            </span>
          </div>
          <div className="w-full bg-surface-container-highest rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                ddPct >= stopLossPct
                  ? 'bg-error'
                  : ddPct >= stopLossPct * 0.7
                    ? 'bg-yellow-500'
                    : 'bg-secondary'
              }`}
              style={{
                width: `${Math.min(100, (ddPct / stopLossPct) * 100)}%`,
              }}
            />
          </div>
        </div>

        <button onClick={applySettings} className="btn-primary mt-5">
          Apply Settings
        </button>
      </div>

      {/* ── Stat Cards Row ── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-xl" />
          ))}
        </div>
      ) : (
        statsData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon="trending_up"
              label="Session ROI"
              value={fmtPct(statsData.roi)}
              sub={`${statsData.totalBets} bets`}
              color={statsData.roi >= 0 ? 'text-secondary' : 'text-error'}
            />
            <StatCard
              icon="scoreboard"
              label="Win Record"
              value={`${statsData.won}-${statsData.lost}${statsData.pushed > 0 ? `-${statsData.pushed}` : ''}`}
              sub={`${((statsData.won / (statsData.won + statsData.lost)) * 100).toFixed(1)}% win rate`}
              color="text-on-surface"
            />
            <StatCard
              icon="monitoring"
              label="Sharpe Ratio"
              value={statsData.sharpe.toFixed(2)}
              color={
                statsData.sharpe >= 1
                  ? 'text-secondary'
                  : statsData.sharpe >= 0
                    ? 'text-yellow-400'
                    : 'text-error'
              }
            />
            <StatCard
              icon="arrow_downward"
              label="Max Drawdown"
              value={fmtPct(statsData.maxDrawdown)}
              color={
                statsData.maxDrawdown > 0.15
                  ? 'text-error'
                  : 'text-on-surface-variant'
              }
            />
          </div>
        )
      )}

      {/* ── Growth Chart ── */}
      {growthHistory.length > 0 && (
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: '18px' }}
            >
              show_chart
            </span>
            <h3 className="font-headline font-bold text-on-surface text-sm">
              Bankroll Growth
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={growthHistory}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(74,56,40,0.3)"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: '#a89585', fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: '#a89585', fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a120a',
                  border: '1px solid rgba(74,56,40,0.3)',
                  borderRadius: 12,
                }}
                labelStyle={{ color: '#a89585' }}
                formatter={(v: number) => [fmtUSD(v), 'Bankroll']}
              />
              <ReferenceLine
                y={statsData?.growthHistory?.[0]?.bankroll ?? 1000}
                stroke="#4a3828"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="bankroll"
                stroke="#e8913a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Kelly Calculator ── */}
      <KellyCalculator bankroll={bankroll} kellyFraction={kellyFraction} />

      {/* ── Kelly Portfolio Table ── */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-headline font-bold text-on-surface text-sm flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: '18px' }}
            >
              table_chart
            </span>
            Kelly Portfolio
            {bets.length > 0 && (
              <span className="ml-1 text-on-surface-variant font-normal text-xs">
                ({bets.length} bets)
              </span>
            )}
          </h3>
          {portfolioData && (
            <span className="text-xs text-on-surface-variant">
              Total stake:{' '}
              <span className="text-on-surface font-bold">
                {fmtUSD(portfolioData.totalStake)}
              </span>{' '}
              ({((portfolioData.totalStake / bankroll) * 100).toFixed(1)}% of
              bankroll)
            </span>
          )}
        </div>

        {portLoading ? (
          <div className="p-6 text-center text-on-surface-variant text-sm">
            Loading portfolio...
          </div>
        ) : bets.length === 0 ? (
          <div className="p-10 text-center">
            <span
              className="material-symbols-outlined text-on-surface-variant/20 mb-3"
              style={{ fontSize: '40px', display: 'block' }}
            >
              table_chart
            </span>
            <p className="text-on-surface-variant text-sm">
              No +EV bets found. Run a scan from the EV Feed page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                  <th className="text-left p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Event / Market
                  </th>
                  <th className="text-left p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Outcome
                  </th>
                  <th className="text-right p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Decimal Odds
                  </th>
                  <th className="text-right p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Advantage (%)
                  </th>
                  <th className="text-right p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Kelly Stake
                  </th>
                  <th className="text-center p-3 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Status
                  </th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {bets.map((bet: any) => (
                  <tr
                    key={bet.marketOddsId}
                    className="border-b border-outline-variant/5 hover:bg-surface-container-high/30 transition-colors"
                  >
                    <td className="p-3">
                      <p className="text-on-surface font-medium">
                        {bet.eventName}
                      </p>
                      <p className="text-on-surface-variant text-xs">
                        {bet.bookName}
                      </p>
                    </td>
                    <td className="p-3">
                      <span className="text-on-surface font-medium">
                        {bet.outcome}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-on-surface font-headline font-bold">
                        {fmtOdds(bet.odds)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-secondary font-headline font-bold">
                        {fmtPct(bet.evPct)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-primary font-headline font-bold">
                        {fmtUSD(bet.recommendedStake)}
                      </span>
                      <p className="text-on-surface-variant text-xs">
                        {fmtPct(bet.kellyFractional)} of roll
                      </p>
                    </td>
                    <td className="p-3 text-center">
                      {bet.settled ? (
                        <span className="badge-neutral">SETTLED</span>
                      ) : (
                        <span className="badge-positive">OPEN</span>
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
                        className="flex items-center gap-1 text-xs text-primary hover:brightness-110 transition-all"
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
  )
}
