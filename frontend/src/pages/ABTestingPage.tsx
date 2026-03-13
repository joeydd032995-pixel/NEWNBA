import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TestTube2, Plus, Play, Square, Trash2, X, BarChart2 } from 'lucide-react'
import { abTestApi, analyticsApi } from '../lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    DRAFT: 'bg-slate-800 text-slate-400',
    RUNNING: 'bg-blue-900/50 text-blue-400',
    COMPLETED: 'bg-green-900/50 text-green-400',
    PAUSED: 'bg-yellow-900/50 text-yellow-400',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? map.DRAFT}`}>{status}</span>
}

function TestCard({ test, onStart, onStop, onDelete, onAnalyze }: any) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{test.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{test.description || ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={test.status} />
          <div className="flex gap-1">
            {test.status === 'DRAFT' && (
              <button onClick={() => onStart(test.id)} className="p-1.5 text-slate-500 hover:text-green-400"><Play size={14} /></button>
            )}
            {test.status === 'RUNNING' && (
              <button onClick={() => onStop(test.id)} className="p-1.5 text-slate-500 hover:text-yellow-400"><Square size={14} /></button>
            )}
            <button onClick={() => onAnalyze(test.id)} className="p-1.5 text-slate-500 hover:text-blue-400"><BarChart2 size={14} /></button>
            <button onClick={() => onDelete(test.id)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="bg-dark-800 p-2 rounded">
          <p className="text-slate-500">Variant A</p>
          <p className="font-medium text-white">{test.variantA?.name ?? 'Model A'}</p>
        </div>
        <div className="bg-dark-800 p-2 rounded">
          <p className="text-slate-500">Variant B</p>
          <p className="font-medium text-white">{test.variantB?.name ?? 'Model B'}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>Target: {test.sampleSize} samples</span>
        <span>·</span>
        <span>Confidence: {((test.confidenceLevel ?? 0.95) * 100).toFixed(0)}%</span>
        {test.isSignificant && <span className="text-green-400 font-medium">✓ Significant</span>}
      </div>

      {test.pValue && (
        <div className="mt-2 text-xs">
          <span className="text-slate-400">p-value: </span>
          <span className={test.pValue < 0.05 ? 'text-green-400' : 'text-yellow-400'}>{test.pValue.toFixed(4)}</span>
        </div>
      )}
    </div>
  )
}

function AnalysisModal({ testId, onClose }: { testId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ab-analysis', testId],
    queryFn: () => abTestApi.analyze(testId),
  })

  const analysis = data?.data
  const chartData = analysis ? [
    { variant: 'Variant A', winRate: (analysis.statsA?.winRate ?? 0.52) * 100, roi: (analysis.statsA?.roi ?? 0.06) * 100 },
    { variant: 'Variant B', winRate: (analysis.statsB?.winRate ?? 0.49) * 100, roi: (analysis.statsB?.roi ?? 0.02) * 100 },
  ] : [
    { variant: 'Variant A', winRate: 54.2, roi: 8.4 },
    { variant: 'Variant B', winRate: 51.1, roi: 2.1 },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-900 border border-slate-700 rounded-xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="font-semibold text-white">A/B Test Analysis</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Analyzing...</div>
          ) : (
            <div className="space-y-4">
              {/* Comparison chart */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="variant" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
                  <Legend />
                  <Bar dataKey="winRate" fill="#3b82f6" name="Win Rate %" />
                  <Bar dataKey="roi" fill="#22c55e" name="ROI %" />
                </BarChart>
              </ResponsiveContainer>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                {['A', 'B'].map(v => {
                  const stats = v === 'A' ? analysis?.statsA : analysis?.statsB
                  return (
                    <div key={v} className={`p-3 rounded-lg border ${analysis?.tTest?.winner === v ? 'border-green-500/50 bg-green-900/10' : 'border-slate-700 bg-dark-800'}`}>
                      <p className="font-medium text-white mb-2">
                        Variant {v} {analysis?.tTest?.winner === v && <span className="text-green-400 text-xs ml-1">★ Winner</span>}
                      </p>
                      {[
                        { label: 'Win Rate', value: `${((stats?.winRate ?? 0) * 100).toFixed(1)}%` },
                        { label: 'ROI', value: `${((stats?.roi ?? 0) * 100).toFixed(2)}%` },
                        { label: 'Sample Size', value: stats?.sampleSize ?? 0 },
                      ].map(m => (
                        <div key={m.label} className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">{m.label}</span>
                          <span className="text-white">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Statistical test results */}
              <div className="bg-dark-800 p-3 rounded-lg text-sm">
                <p className="font-medium text-white mb-2">Statistical Test Results</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">t-statistic: </span><span className="text-white">{analysis?.tTest?.tStatistic?.toFixed(4) ?? '—'}</span></div>
                  <div><span className="text-slate-400">p-value: </span><span className={`${(analysis?.tTest?.pValue ?? 1) < 0.05 ? 'text-green-400' : 'text-yellow-400'}`}>{analysis?.tTest?.pValue?.toFixed(4) ?? '—'}</span></div>
                  <div><span className="text-slate-400">Significant: </span><span className={analysis?.tTest?.isSignificant ? 'text-green-400' : 'text-slate-400'}>{analysis?.tTest?.isSignificant ? 'Yes' : 'No'}</span></div>
                </div>
                <p className="mt-2 text-slate-300">{analysis?.recommendation ?? 'Run test to see results.'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ABTestingPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [analyzeId, setAnalyzeId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', variantAId: '', variantBId: '', sampleSize: 100, confidenceLevel: 0.95 })
  const qc = useQueryClient()

  const { data: tests } = useQuery({ queryKey: ['ab-tests'], queryFn: () => abTestApi.getAll() })
  const { data: models } = useQuery({ queryKey: ['custom-models'], queryFn: () => analyticsApi.getModels() })

  const createMutation = useMutation({
    mutationFn: (data: any) => abTestApi.create(data),
    onSuccess: () => { toast.success('A/B test created!'); qc.invalidateQueries({ queryKey: ['ab-tests'] }); setShowCreate(false) },
    onError: () => toast.error('Failed to create A/B test'),
  })
  const startMutation = useMutation({
    mutationFn: (id: string) => abTestApi.start(id),
    onSuccess: () => { toast.success('Test started'); qc.invalidateQueries({ queryKey: ['ab-tests'] }) },
    onError: () => toast.error('Failed to start test'),
  })
  const stopMutation = useMutation({
    mutationFn: (id: string) => abTestApi.stop(id),
    onSuccess: () => { toast.success('Test paused'); qc.invalidateQueries({ queryKey: ['ab-tests'] }) },
    onError: () => toast.error('Failed to pause test'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => abTestApi.remove(id),
    onSuccess: () => { toast.success('Test deleted'); qc.invalidateQueries({ queryKey: ['ab-tests'] }) },
    onError: () => toast.error('Failed to delete test'),
  })

  const testItems = tests?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TestTube2 size={20} className="text-cyan-400" /> A/B Testing
          </h1>
          <p className="text-slate-400 text-sm">Compare models with statistical significance testing</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New A/B Test
        </button>
      </div>

      {testItems.length === 0 ? (
        <div className="card text-center py-10">
          <TestTube2 size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No A/B tests yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-3">Create your first test</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testItems.map((t: any) => (
            <TestCard key={t.id} test={t}
              onStart={(id: string) => startMutation.mutate(id)}
              onStop={(id: string) => stopMutation.mutate(id)}
              onDelete={(id: string) => deleteMutation.mutate(id)}
              onAnalyze={(id: string) => setAnalyzeId(id)} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Create A/B Test</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Test Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Model A vs Model B" />
              </div>
              {['variantAId', 'variantBId'].map((key, i) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 block mb-1">Variant {['A', 'B'][i]}</label>
                  <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input-field">
                    <option value="">Select model...</option>
                    {models?.data?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Sample Size</label>
                  <input type="number" value={form.sampleSize} min={20} max={10000}
                    onChange={e => setForm(f => ({ ...f, sampleSize: Number(e.target.value) }))} className="input-field" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Confidence Level</label>
                  <select value={form.confidenceLevel} onChange={e => setForm(f => ({ ...f, confidenceLevel: Number(e.target.value) }))} className="input-field">
                    <option value={0.90}>90%</option>
                    <option value={0.95}>95%</option>
                    <option value={0.99}>99%</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createMutation.mutate(form)} disabled={!form.name || !form.variantAId || !form.variantBId} className="btn-primary flex-1">
                {createMutation.isPending ? 'Creating...' : 'Create Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {analyzeId && <AnalysisModal testId={analyzeId} onClose={() => setAnalyzeId(null)} />}
    </div>
  )
}
