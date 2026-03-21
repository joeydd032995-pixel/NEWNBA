import { useState } from 'react'
import { analyticsApi } from '../lib/api'
import toast from 'react-hot-toast'

/* ── Interactive Formula Card ────────────────────────────────────────────── */
function FormulaCard({ title, formula, description, inputs, calculate }: any) {
  const [values, setValues] = useState<Record<string, number>>(
    inputs.reduce((acc: any, inp: any) => ({ ...acc, [inp.key]: inp.default ?? 0 }), {})
  )
  const [result, setResult] = useState<number | null>(null)

  const handleCalc = async () => {
    try {
      const res = await calculate(values)
      const resultVal = Object.values(res.data)[0] as number
      setResult(resultVal)
    } catch {
      toast.error('Calculation failed')
    }
  }

  return (
    <div className="card flex flex-col justify-between h-full">
      <div>
        <p className="stat-label text-primary">{title}</p>
        <p className="text-xs text-on-surface-variant mt-1">{description}</p>

        <div className="mt-4 bg-surface-container-high rounded-xl p-4 flex items-center justify-center">
          <code className="text-sm font-mono text-primary font-semibold text-center">{formula}</code>
        </div>

        <div className="mt-4 space-y-2.5">
          {inputs.map((inp: any) => (
            <div key={inp.key} className="flex items-center gap-3">
              <label className="text-xs text-on-surface-variant w-24 shrink-0 font-medium">{inp.label}</label>
              <input
                type="number"
                value={values[inp.key]}
                onChange={e => setValues(v => ({ ...v, [inp.key]: Number(e.target.value) }))}
                className="input-field py-1.5 text-sm flex-1"
                step={inp.step ?? 1}
                min={inp.min ?? 0}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={handleCalc} className="btn-primary text-sm py-2 px-4">Calculate</button>
        {result !== null && (
          <span className="text-secondary font-black font-headline text-lg">{(result * 100).toFixed(2)}%</span>
        )}
      </div>
    </div>
  )
}

/* ── Four Factors Data ───────────────────────────────────────────────────── */
const FOUR_FACTORS = [
  {
    num: '01',
    name: 'SHOOTING',
    stat: 'eFG%',
    weight: '40%',
    priority: 'High',
    desc: 'Effective field goal percentage accounts for the extra value of three-pointers over two-pointers.',
    formula: '(FG + 0.5 x 3P) / FGA',
  },
  {
    num: '02',
    name: 'TURNOVERS',
    stat: 'TOV%',
    weight: '25%',
    priority: 'High',
    desc: 'Turnover percentage measures ball security per 100 possessions, a key offensive efficiency factor.',
    formula: 'TOV / (FGA + 0.44 x FTA + TOV)',
  },
  {
    num: '03',
    name: 'REBOUNDING',
    stat: 'ORB%',
    weight: '20%',
    priority: 'Moderate',
    desc: 'Offensive rebound rate creates second-chance opportunities and extends possessions.',
    formula: 'ORB / (ORB + Opp DRB)',
  },
  {
    num: '04',
    name: 'FREE THROWS',
    stat: 'FTR',
    weight: '15%',
    priority: 'Medium',
    desc: 'Free throw rate measures the ability to get to the line relative to field goal attempts.',
    formula: 'FTA / FGA',
  },
]

/* ────────────────────────────────────────────────────────────────────────────
   Formulas Page
   ──────────────────────────────────────────────────────────────────────────── */
export default function FormulasPage() {
  const [evCalc, setEvCalc] = useState({ trueProb: 0.55, odds: -115 })
  const [evResult, setEvResult] = useState<any>(null)

  const calcEV = async () => {
    try {
      const res = await analyticsApi.calcEV(evCalc)
      setEvResult(res.data)
    } catch {
      toast.error('EV calculation failed')
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page Title ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
          NBA Formulas
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Interactive analytics calculators and metric reference
        </p>
      </div>

      {/* ── Bento Grid: eFG% Reference + True Shooting ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* eFG% Reference -- large left card */}
        <div className="lg:col-span-7 card flex flex-col">
          <p className="stat-label text-primary">eFG% Reference</p>
          <p className="text-xs text-on-surface-variant mt-1">
            Adjusts field goal percentage for the extra value of three-pointers
          </p>

          <div className="mt-6 bg-surface-container-high rounded-xl p-6 flex flex-col items-center justify-center flex-1">
            <code className="text-lg md:text-xl font-mono text-primary font-bold tracking-wide text-center">
              eFG% = (FG + 0.5 x 3P) / FGA
            </code>
            <p className="text-xs text-on-surface-variant mt-3 text-center max-w-sm">
              A player shooting 45% on twos and 35% on threes has a higher eFG% than
              raw FG% suggests, reflecting true scoring efficiency.
            </p>
          </div>

          {/* EV Calculator inline */}
          <div className="mt-6 border-t border-outline-variant/15 pt-5">
            <p className="stat-label text-primary mb-3">Expected Value Calculator</p>
            <code className="text-xs font-mono text-on-surface-variant bg-surface-container-high px-3 py-2 rounded-lg block mb-4">
              EV = (trueProb x potentialWin) - ((1 - trueProb) x stake)
            </code>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-on-surface-variant block mb-1 font-medium">True Probability (%)</label>
                <input type="number" value={evCalc.trueProb * 100} min={1} max={99} step={0.5}
                  onChange={e => setEvCalc(c => ({ ...c, trueProb: Number(e.target.value) / 100 }))}
                  className="input-field" />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant block mb-1 font-medium">American Odds</label>
                <input type="number" value={evCalc.odds} step={5}
                  onChange={e => setEvCalc(c => ({ ...c, odds: Number(e.target.value) }))}
                  className="input-field" />
              </div>
            </div>
            <button onClick={calcEV} className="btn-primary text-sm">Calculate EV</button>
            {evResult && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'EV', value: `$${evResult.ev?.toFixed(2)}`, color: evResult.ev > 0 ? 'text-secondary' : 'text-error' },
                  { label: 'EV %', value: `${(evResult.evPct * 100).toFixed(2)}%`, color: evResult.evPct > 0 ? 'text-secondary' : 'text-error' },
                  { label: 'True Prob', value: `${(evResult.trueProb * 100).toFixed(1)}%`, color: 'text-on-surface' },
                  { label: 'Kelly %', value: `${(evResult.kellyFraction * 100).toFixed(2)}%`, color: 'text-primary' },
                ].map(m => (
                  <div key={m.label} className="bg-surface-container-high rounded-xl p-3">
                    <p className="stat-label">{m.label}</p>
                    <p className={`font-black font-headline text-lg mt-1 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* True Shooting % -- right column */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <FormulaCard
            title="True Shooting %"
            formula="TS% = PTS / [2 x (FGA + 0.475 x FTA)]"
            description="Measures shooting efficiency accounting for 3-pointers and free throws"
            inputs={[
              { key: 'points', label: 'Points', default: 28 },
              { key: 'fga', label: 'FGA', default: 20 },
              { key: 'fta', label: 'FTA', default: 8 },
            ]}
            calculate={(v: any) => analyticsApi.calcTrueShooting(v)}
          />

          {/* Elite range stat card with basketball visual area */}
          <div className="card flex-1 flex flex-col justify-between">
            <div>
              <p className="stat-label text-primary">Elite Range</p>
              <p className="text-xs text-on-surface-variant mt-1">League benchmarks for True Shooting %</p>
            </div>

            {/* Basketball visual area */}
            <div className="mt-4 bg-surface-container-high rounded-xl p-4 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-primary/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 32 }}>sports_basketball</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {[
                { tier: 'Elite', range: '> 62%', color: 'text-secondary' },
                { tier: 'Above Avg', range: '57 - 62%', color: 'text-primary' },
                { tier: 'Average', range: '54 - 57%', color: 'text-on-surface-variant' },
                { tier: 'Below Avg', range: '< 54%', color: 'text-error' },
              ].map(t => (
                <div key={t.tier} className="flex items-center justify-between bg-surface-container-high rounded-lg px-4 py-2.5">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">{t.tier}</span>
                  <span className={`text-sm font-mono font-bold ${t.color}`}>{t.range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pythagorean Win % ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormulaCard
          title="Pythagorean Win %"
          formula="WinPct = PF^13.91 / (PF^13.91 + PA^13.91)"
          description="Predicts expected win% based on points scored and allowed"
          inputs={[
            { key: 'pointsFor', label: 'Pts For', default: 115 },
            { key: 'pointsAgainst', label: 'Pts Against', default: 108 },
          ]}
          calculate={(v: any) => analyticsApi.calcPythagorean(v)}
        />

        {/* Kelly Criterion reference */}
        <div className="card flex flex-col justify-between">
          <div>
            <p className="stat-label text-primary">Kelly Criterion</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Optimal bet sizing formula for maximizing long-term bankroll growth
            </p>
          </div>
          <div className="mt-4 bg-surface-container-high rounded-xl p-5 flex items-center justify-center">
            <code className="text-lg font-mono text-primary font-bold">f* = (bp - q) / b</code>
          </div>
          <div className="mt-4 space-y-2 text-xs text-on-surface-variant">
            <div className="flex gap-2"><span className="font-mono text-primary font-bold w-4">b</span> Net odds received on the wager</div>
            <div className="flex gap-2"><span className="font-mono text-primary font-bold w-4">p</span> Probability of winning</div>
            <div className="flex gap-2"><span className="font-mono text-primary font-bold w-4">q</span> Probability of losing (1 - p)</div>
          </div>
        </div>
      </div>

      {/* ── THE FOUR FACTORS ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-outline-variant/20" />
          <h2 className="text-sm font-black font-headline uppercase tracking-widest text-on-surface-variant">
            The Four Factors
          </h2>
          <div className="h-px flex-1 bg-outline-variant/20" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FOUR_FACTORS.map(f => (
            <div key={f.num} className="card flex flex-col justify-between group hover:border-primary/30 transition-colors">
              {/* Number + Name */}
              <div>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl font-black font-headline text-outline-variant/40 leading-none">{f.num}</span>
                  <span className="stat-label text-primary">{f.stat}</span>
                </div>
                <h3 className="text-sm font-black font-headline text-on-surface uppercase tracking-wide">{f.name}</h3>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">{f.desc}</p>

                {/* Formula */}
                <div className="mt-4 bg-surface-container-high rounded-lg px-3 py-2">
                  <code className="text-[11px] font-mono text-primary/80">{f.formula}</code>
                </div>
              </div>

              {/* Priority + Weight */}
              <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Priority: <span className="text-on-surface">{f.priority}</span>
                </span>
                <span className="text-xs font-mono font-bold text-primary">{f.weight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Advanced Metrics Reference ────────────────────────────────────── */}
      <div className="card">
        <p className="stat-label text-primary mb-4">Advanced Metrics Reference</p>
        <div className="space-y-2.5">
          {[
            { name: 'BPM', formula: 'Regression on box score stats vs team performance', desc: 'Box Plus/Minus player value above average' },
            { name: 'RAPTOR', formula: 'On/off + player tracking + box score regression', desc: "FiveThirtyEight's player rating (approx)" },
            { name: 'LEBRON', formula: 'Ridge regression + on/off, luck-adjusted', desc: 'Comprehensive player metric (approx)' },
          ].map(f => (
            <div key={f.name} className="flex gap-4 p-3 bg-surface-container-high rounded-xl">
              <div className="w-20 shrink-0">
                <span className="font-black font-headline text-primary text-sm">{f.name}</span>
              </div>
              <div className="min-w-0">
                <code className="text-xs font-mono text-secondary/80">{f.formula}</code>
                <p className="text-xs text-on-surface-variant mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
