import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { analyticsApi } from '../lib/api'
import toast from 'react-hot-toast'

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
    <div className="card">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      <code className="block mt-2 text-xs text-primary-400 bg-dark-800 p-2 rounded">{formula}</code>

      <div className="mt-3 space-y-2">
        {inputs.map((inp: any) => (
          <div key={inp.key} className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">{inp.label}</label>
            <input
              type="number"
              value={values[inp.key]}
              onChange={e => setValues(v => ({ ...v, [inp.key]: Number(e.target.value) }))}
              className="input-field py-1 text-sm flex-1"
              step={inp.step ?? 1}
              min={inp.min ?? 0}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={handleCalc} className="btn-secondary text-sm py-1.5">Calculate</button>
        {result !== null && (
          <span className="text-green-400 font-bold">{(result * 100).toFixed(2)}%</span>
        )}
      </div>
    </div>
  )
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Calculator size={20} className="text-yellow-400" /> NBA Formulas
        </h1>
        <p className="text-slate-400 text-sm">Interactive NBA analytics formula calculator</p>
      </div>

      {/* EV Calculator - featured */}
      <div className="card border-primary-500/30">
        <h2 className="font-semibold text-white mb-3">Expected Value Calculator</h2>
        <code className="text-xs text-primary-400 bg-dark-800 p-2 rounded block mb-3">
          EV = (trueProb × potentialWin) - ((1 - trueProb) × stake)
        </code>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">True Probability (%)</label>
            <input type="number" value={evCalc.trueProb * 100} min={1} max={99} step={0.5}
              onChange={e => setEvCalc(c => ({ ...c, trueProb: Number(e.target.value) / 100 }))}
              className="input-field" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">American Odds</label>
            <input type="number" value={evCalc.odds} step={5}
              onChange={e => setEvCalc(c => ({ ...c, odds: Number(e.target.value) }))}
              className="input-field" />
          </div>
        </div>
        <button onClick={calcEV} className="btn-primary">Calculate EV</button>
        {evResult && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'EV', value: `$${evResult.ev?.toFixed(2)}`, color: evResult.ev > 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'EV %', value: `${(evResult.evPct * 100).toFixed(2)}%`, color: evResult.evPct > 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'True Prob', value: `${(evResult.trueProb * 100).toFixed(1)}%`, color: 'text-white' },
              { label: 'Kelly %', value: `${(evResult.kellyFraction * 100).toFixed(2)}%`, color: 'text-yellow-400' },
            ].map(m => (
              <div key={m.label} className="bg-dark-800 rounded-lg p-3">
                <p className="text-xs text-slate-500">{m.label}</p>
                <p className={`font-bold text-lg ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formula cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormulaCard
          title="True Shooting %"
          formula="TS% = PTS / [2 × (FGA + 0.475 × FTA)]"
          description="Measures shooting efficiency accounting for 3-pointers and free throws"
          inputs={[
            { key: 'points', label: 'Points', default: 28 },
            { key: 'fga', label: 'FGA', default: 20 },
            { key: 'fta', label: 'FTA', default: 8 },
          ]}
          calculate={(v: any) => analyticsApi.calcTrueShooting(v)}
        />
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
      </div>

      {/* Static formula reference */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Advanced Metrics Reference</h2>
        <div className="space-y-4 text-sm">
          {[
            { name: 'eFG%', formula: '(FG + 0.5 × 3P) / FGA', desc: 'Adjusts field goal percentage for 3-point value' },
            { name: 'Four Factors', formula: '0.40×eFG% + 0.25×TOV% + 0.20×ORB% + 0.15×FTR', desc: 'Dean Oliver\'s winning formula' },
            { name: 'BPM', formula: 'Regression on box score stats vs team performance', desc: 'Box Plus/Minus player value above average' },
            { name: 'RAPTOR', formula: 'On/off + player tracking + box score regression', desc: 'FiveThirtyEight\'s player rating (approx)' },
            { name: 'LEBRON', formula: 'Ridge regression + on/off, luck-adjusted', desc: 'Comprehensive player metric (approx)' },
            { name: 'Kelly Criterion', formula: 'f* = (bp - q) / b', desc: 'Optimal bet sizing for long-term growth' },
          ].map(f => (
            <div key={f.name} className="flex gap-4 p-3 bg-dark-800 rounded-lg">
              <div className="w-24 shrink-0">
                <span className="font-bold text-primary-400">{f.name}</span>
              </div>
              <div>
                <code className="text-xs text-green-400">{f.formula}</code>
                <p className="text-xs text-slate-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
