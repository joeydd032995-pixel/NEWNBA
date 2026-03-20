import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Play, X, Loader2, CheckCircle2, TrendingUp } from 'lucide-react'
import { optimizationApi } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'

const WEIGHT_KEYS = ['efgPct', 'tsPct', 'fourFactorsOffense', 'fourFactorsDefense', 'tovPct', 'orbPct', 'ftr', 'netRating', 'pace', 'usgPct', 'homeCourtAdvantage', 'momentum']

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    PENDING: 'bg-slate-800 text-slate-400',
    COMPLETED: 'bg-green-900/50 text-green-400',
    FAILED: 'bg-red-900/50 text-red-400',
    CANCELLED: 'bg-slate-800 text-slate-500',
  }
  if (status === 'RUNNING') {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs font-semibold text-neon-blue-400"
        style={{ background: 'linear-gradient(135deg, rgba(0,3,112,0.35) 0%, rgba(76,65,158,0.10) 100%)', border: '1px solid rgba(76,65,158,0.30)', boxShadow: '0 0 8px rgba(76,65,158,0.2)' }}
      >
        {status}
      </span>
    )
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? map.PENDING}`}>{status}</span>
}

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
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: runs } = useQuery({ queryKey: ['opt-runs'], queryFn: () => optimizationApi.getRuns() })
  const { data: runDetail } = useQuery({
    queryKey: ['opt-run', selectedRun],
    queryFn: () => optimizationApi.getRun(selectedRun!),
    enabled: !!selectedRun,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <GitBranch size={20} className="text-purple-400" /> Genetic Algorithm Optimizer
          </h1>
          <p className="text-slate-400 text-sm">Evolve model weights using population-based search</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Play size={15} /> New Run
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Run list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase">Optimization Runs</h2>
          {(runs?.data ?? []).length === 0 ? (
            <div className="card text-center py-8">
              <GitBranch size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No runs yet</p>
            </div>
          ) : (runs?.data ?? []).map((run: any) => (
            <div
              key={run.id}
              onClick={() => setSelectedRun(run.id)}
              className={`card cursor-pointer hover:border-slate-600 transition-colors ${selectedRun === run.id ? 'border-purple-500/50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-white text-sm">{run.name}</p>
                <StatusBadge status={run.status} />
              </div>
              {run.bestFitness && (
                <p className="text-xs text-green-400 mt-1">Best: {run.bestFitness.toFixed(4)}</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">{new Date(run.createdAt).toLocaleDateString()}</p>
            </div>
          ))}

          {/* Demo run */}
          <div
            onClick={() => setSelectedRun('demo')}
            className={`card cursor-pointer hover:border-slate-600 transition-colors ${selectedRun === 'demo' ? 'border-purple-500/50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-white text-sm">Demo Run</p>
              <StatusBadge status="COMPLETED" />
            </div>
            <p className="text-xs text-green-400 mt-1">Best: 0.7842</p>
            <p className="text-xs text-slate-500 mt-0.5">50 generations</p>
          </div>
        </div>

        {/* Convergence chart */}
        <div className="lg:col-span-2 card">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" />
            Convergence Chart
            {runDetail?.data?.status === 'RUNNING' && (
              <Loader2 size={14} className="text-neon-blue-400 animate-spin" />
            )}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={convergenceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(76,65,158,0.08)" />
              <XAxis dataKey="generation" stroke="#444444" tick={{ fontSize: 10 }} />
              <YAxis stroke="#444444" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(76,65,158,0.2)', borderRadius: '8px', color: '#f1f5f9' }} />
              <Line type="monotone" dataKey="bestFitness" stroke="#22c55e" strokeWidth={2} dot={false} name="Best Fitness" />
              <Line type="monotone" dataKey="avgFitness" stroke="#64748b" strokeWidth={1} dot={false} name="Avg Fitness" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>

          {/* Best weights */}
          {(runDetail?.data?.bestWeights || selectedRun === 'demo') && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-white mb-2">Best Weights Found</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {WEIGHT_KEYS.map(key => {
                  const val = runDetail?.data?.bestWeights?.[key] ?? Math.random() * 0.15
                  return (
                    <div key={key} className="flex justify-between text-xs bg-dark-800 px-2 py-1.5 rounded">
                      <span className="text-slate-400">{key}</span>
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${val * 100}%` }} />
                        </div>
                        <span className="text-white w-8 text-right">{(val * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-600 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-dark-600">
              <h3 className="font-semibold text-white">New GA Optimization Run</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Run Name</label>
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
                    <label className="text-xs text-slate-400 block mb-1">{label}</label>
                    <input type="number" value={(form as any)[key]} min={min} max={max} step={step}
                      onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                      className="input-field" />
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-dark-600 flex gap-3">
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
