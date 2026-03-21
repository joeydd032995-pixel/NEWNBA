import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, X, Loader2 } from 'lucide-react'
import { optimizationApi } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import toast from 'react-hot-toast'

const WEIGHT_KEYS = ['efgPct', 'tsPct', 'fourFactorsOffense', 'fourFactorsDefense', 'tovPct', 'orbPct', 'ftr', 'netRating', 'pace', 'usgPct', 'homeCourtAdvantage', 'momentum']

/* ── Status Badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-surface-container-high text-on-surface-variant',
    RUNNING: 'bg-primary/15 text-primary border border-primary/30',
    COMPLETED: 'bg-secondary/12 text-secondary border border-secondary/25',
    FAILED: 'bg-error/12 text-error border border-error/25',
    CANCELLED: 'bg-surface-container-high text-on-surface-variant',
    ARCHIVED: 'bg-surface-container-high text-on-surface-variant',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${map[status] ?? map.PENDING}`}>
      {status}
    </span>
  )
}

/* ── Demo Data ───────────────────────────────────────────────────────────── */
const DEMO_RUNS = [
  { id: 'demo-1', name: 'Demo Run', status: 'COMPLETED', bestFitness: 0.7842, createdAt: '2026-03-18' },
  { id: 'demo-2', name: 'Baseline Alpha', status: 'ARCHIVED', bestFitness: 0.6531, createdAt: '2026-03-15' },
  { id: 'demo-3', name: 'Efficiency Focus', status: 'COMPLETED', bestFitness: 0.7210, createdAt: '2026-03-12' },
]

const DEMO_WEIGHT_DIST = WEIGHT_KEYS.map(key => ({
  name: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).substring(0, 10),
  value: +(Math.random() * 0.15 + 0.02).toFixed(3),
}))

const DEMO_MODEL_STATS = [
  { metric: 'Precision', value: '0.847', delta: '+2.1%' },
  { metric: 'Recall', value: '0.792', delta: '+1.4%' },
  { metric: 'Loss', value: '0.312', delta: '-5.2%' },
]

export default function OptimizationPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: 'GA Run ' + new Date().toLocaleDateString(),
    populationSize: 50,
    maxGenerations: 50,
    mutationRate: 0.1,
    crossoverRate: 0.8,
    elitismCount: 2,
    fitnessWeights: { roi: 0.4, winRate: 0.3, sharpeRatio: 0.2, calibration: 0.1 },
  })
  const [selectedRun, setSelectedRun] = useState<string | null>('demo-1')
  const qc = useQueryClient()

  const { data: runs } = useQuery({ queryKey: ['opt-runs'], queryFn: () => optimizationApi.getRuns() })
  const { data: runDetail } = useQuery({
    queryKey: ['opt-run', selectedRun],
    queryFn: () => optimizationApi.getRun(selectedRun!),
    enabled: !!selectedRun && !selectedRun.startsWith('demo'),
    refetchInterval: (data: any) => data?.data?.status === 'RUNNING' ? 3000 : false,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => optimizationApi.createRun(data),
    onSuccess: (res) => {
      toast.success('Optimization started!')
      qc.invalidateQueries({ queryKey: ['opt-runs'] })
      setSelectedRun(res.data.id)
      setShowCreate(false)
    },
    onError: () => toast.error('Failed to start optimization'),
  })

  const convergenceData = runDetail?.data?.convergenceData ?? Array.from({ length: 30 }, (_, i) => ({
    generation: i,
    bestFitness: 0.3 + i * 0.015 + (Math.random() - 0.5) * 0.02,
    avgFitness: 0.2 + i * 0.01,
  }))

  const allRuns = [...(runs?.data ?? []), ...DEMO_RUNS]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
            Genetic Optimizer
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">Evolve model weights using population-based search</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          New Run
        </button>
      </div>

      {/* ── Main Grid: Chart + Run List ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Convergence Chart */}
        <div className="lg:col-span-8 card">
          <div className="flex items-center justify-between mb-4">
            <p className="stat-label text-primary">Convergence Chart</p>
            {runDetail?.data?.status === 'RUNNING' && (
              <Loader2 size={14} className="text-primary animate-spin" />
            )}
          </div>
          <div className="rounded-xl p-2" style={{ background: '#080402' }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={convergenceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,145,58,0.08)" />
                <XAxis dataKey="generation" stroke="#4a3828" tick={{ fontSize: 10, fill: '#a89585' }} />
                <YAxis stroke="#4a3828" tick={{ fontSize: 10, fill: '#a89585' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    background: '#150e08',
                    border: '1px solid rgba(232,145,58,0.25)',
                    borderRadius: '12px',
                    color: '#f0e6dc',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="bestFitness" stroke="#e8913a" strokeWidth={2} dot={false} name="Best Fitness" />
                <Line type="monotone" dataKey="avgFitness" stroke="#a89585" strokeWidth={1} dot={false} name="Avg Fitness" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Optimization Runs List */}
        <div className="lg:col-span-4 card flex flex-col">
          <p className="stat-label text-primary mb-3">Optimization Runs</p>
          <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar max-h-[320px]">
            {allRuns.map((run: any) => (
              <button
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className={`w-full text-left bg-surface-container-high rounded-xl p-3 border transition-colors ${
                  selectedRun === run.id
                    ? 'border-primary/40'
                    : 'border-outline-variant/10 hover:border-outline-variant/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-on-surface text-sm truncate pr-2">{run.name}</p>
                  <StatusBadge status={run.status} />
                </div>
                {run.bestFitness != null && (
                  <p className="text-xs text-secondary font-mono">Best: {run.bestFitness.toFixed(4)}</p>
                )}
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  {new Date(run.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3 Stat Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'BEST FITNESS', value: '0.0042', icon: 'emoji_events' },
          { label: 'POPULATION', value: '500', icon: 'groups' },
          { label: 'MUTATION RATE', value: '0.05%', icon: 'genetics' },
        ].map(stat => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>{stat.icon}</span>
            </div>
            <div>
              <p className="stat-label">{stat.label}</p>
              <p className="text-xl font-black font-headline text-on-surface mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom Row: Genotype Map, Weight Distribution, Model Stats ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Genotype Map */}
        <div className="lg:col-span-4 bg-surface-container-low rounded-xl border border-primary/30 p-6"
          style={{ boxShadow: '0 0 20px rgba(232,145,58,0.1)' }}>
          <p className="stat-label text-primary mb-3">Genotype Map</p>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 48 }, (_, i) => {
              const intensity = Math.random()
              return (
                <div
                  key={i}
                  className="aspect-square rounded"
                  style={{
                    background: `rgba(232,145,58,${(intensity * 0.6 + 0.05).toFixed(2)})`,
                  }}
                />
              )
            })}
          </div>
          <p className="text-[10px] text-on-surface-variant mt-3 text-center">
            Gene activation across population
          </p>
        </div>

        {/* Weight Distribution */}
        <div className="lg:col-span-4 card">
          <p className="stat-label text-primary mb-3">Weight Distribution</p>
          <div className="rounded-xl p-1" style={{ background: '#080402' }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={DEMO_WEIGHT_DIST} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,145,58,0.08)" />
                <XAxis dataKey="name" stroke="#4a3828" tick={{ fontSize: 8, fill: '#a89585' }} angle={-45} textAnchor="end" height={50} />
                <YAxis stroke="#4a3828" tick={{ fontSize: 9, fill: '#a89585' }} />
                <Tooltip
                  contentStyle={{
                    background: '#150e08',
                    border: '1px solid rgba(232,145,58,0.25)',
                    borderRadius: '12px',
                    color: '#f0e6dc',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill="#e8913a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Model Stats Table */}
        <div className="lg:col-span-4 card">
          <p className="stat-label text-primary mb-3">Model Stats</p>
          <table className="table-base w-full">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="text-right">Value</th>
                <th className="text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_MODEL_STATS.map(row => (
                <tr key={row.metric}>
                  <td className="text-on-surface font-medium">{row.metric}</td>
                  <td className="text-right font-mono text-on-surface">{row.value}</td>
                  <td className={`text-right font-mono text-sm ${
                    row.delta.startsWith('+') ? 'text-secondary' : row.delta.startsWith('-') && row.metric === 'Loss' ? 'text-secondary' : 'text-error'
                  }`}>
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-backdrop">
          <div className="bg-surface-container-low border border-outline-variant/15 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>genetics</span>
                <h3 className="font-headline font-bold text-on-surface">New GA Optimization Run</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Run Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'populationSize', label: 'Population Size', min: 10, max: 200, step: 10 },
                  { key: 'maxGenerations', label: 'Max Generations', min: 10, max: 200, step: 10 },
                  { key: 'mutationRate', label: 'Mutation Rate', min: 0.01, max: 0.5, step: 0.01 },
                  { key: 'crossoverRate', label: 'Crossover Rate', min: 0.5, max: 1.0, step: 0.05 },
                ].map(({ key, label, min, max, step }) => (
                  <div key={key}>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">{label}</label>
                    <input type="number" value={(form as any)[key]} min={min} max={max} step={step}
                      onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                      className="input-field" />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-outline-variant/10 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => createMutation.mutate({
                  name: form.name,
                  config: { ...form, weightKeys: WEIGHT_KEYS },
                  runNow: true,
                })}
                disabled={createMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Start Optimization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
