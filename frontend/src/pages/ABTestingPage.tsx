import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TestTube2, Plus, Play, Square, Trash2, X, BarChart2 } from 'lucide-react'
import { abTestApi, analyticsApi } from '../lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    DRAFT: 'bg-surface-container-highest text-on-surface-variant',
    COMPLETED: 'bg-secondary/15 text-secondary',
    PAUSED: 'bg-yellow-900/50 text-yellow-400',
  }
  if (status === 'RUNNING') {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs font-semibold text-primary"
        style={{ background: 'rgba(232,145,58,0.15)', border: '1px solid rgba(232,145,58,0.30)', boxShadow: '0 0 8px rgba(232,145,58,0.2)' }}
      >
        {status}
      </span>
    )
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? map.DRAFT}`}>{status}</span>
}

function TestCard({ test, onStart, onStop, onDelete, onAnalyze }: any) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-on-surface">{test.name}</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">{test.description || ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={test.status} />
          <div className="flex gap-1">
            {test.status === 'DRAFT' && (
              <button onClick={() => onStart(test.id)} className="p-1.5 text-on-surface-variant hover:text-secondary"><Play size={14} /></button>
            )}
            {test.status === 'RUNNING' && (
              <button onClick={() => onStop(test.id)} className="p-1.5 text-on-surface-variant hover:text-yellow-400"><Square size={14} /></button>
            )}
            <button onClick={() => onAnalyze(test.id)} className="p-1.5 text-on-surface-variant hover:text-primary"><BarChart2 size={14} /></button>
            <button onClick={() => onDelete(test.id)} className="p-1.5 text-on-surface-variant hover:text-error"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="bg-surface-container-high p-2 rounded">
          <p className="text-on-surface-variant">Variant A</p>
          <p className="font-medium text-on-surface">{test.variantA?.name ?? 'Model A'}</p>
        </div>
        <div className="bg-surface-container-high p-2 rounded">
          <p className="text-on-surface-variant">Variant B</p>
          <p className="font-medium text-on-surface">{test.variantB?.name ?? 'Model B'}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-on-surface-variant">
        <span>Target: {test.sampleSize} samples</span>
        <span>·</span>
        <span>Confidence: {((test.confidenceLevel ?? 0.95) * 100).toFixed(0)}%</span>
        {test.isSignificant && <span className="text-secondary font-medium">✓ Significant</span>}
      </div>

      {test.pValue && (
        <div className="mt-2 text-xs">
          <span className="text-on-surface-variant">p-value: </span>
          <span className={test.pValue < 0.05 ? 'text-secondary' : 'text-yellow-400'}>{test.pValue.toFixed(4)}</span>
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
      <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-4 border-b border-outline-variant/20">
          <h3 className="font-semibold text-on-surface">A/B Test Analysis</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-on-surface-variant">Analyzing...</div>
          ) : (
            <div className="space-y-4">
              {/* Comparison chart */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(232,145,58,0.08)" />
                  <XAxis dataKey="variant" stroke="#4a3828" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#4a3828" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#150e08', border: '1px solid rgba(232,145,58,0.2)', borderRadius: '8px', color: '#f0e6dc' }} />
                  <Legend />
                  <Bar dataKey="winRate" fill="#e8913a" name="Win Rate %" />
                  <Bar dataKey="roi" fill="#4ade80" name="ROI %" />
                </BarChart>
              </ResponsiveContainer>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                {['A', 'B'].map(v => {
                  const stats = v === 'A' ? analysis?.statsA : analysis?.statsB
                  return (
                    <div key={v} className={`p-3 rounded-lg border ${analysis?.tTest?.winner === v ? 'border-secondary/50 bg-secondary/10' : 'border-outline-variant/20 bg-surface-container-high'}`}>
                      <p className="font-medium text-on-surface mb-2">
                        Variant {v} {analysis?.tTest?.winner === v && <span className="text-secondary text-xs ml-1">★ Winner</span>}
                      </p>
                      {[
                        { label: 'Win Rate', value: `${((stats?.winRate ?? 0) * 100).toFixed(1)}%` },
                        { label: 'ROI', value: `${((stats?.roi ?? 0) * 100).toFixed(2)}%` },
                        { label: 'Sample Size', value: stats?.sampleSize ?? 0 },
                      ].map(m => (
                        <div key={m.label} className="flex justify-between text-xs mb-1">
                          <span className="text-on-surface-variant">{m.label}</span>
                          <span className="text-on-surface">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Statistical test results */}
              <div className="bg-surface-container-high p-3 rounded-lg text-sm">
                <p className="font-medium text-on-surface mb-2">Statistical Test Results</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-on-surface-variant">t-statistic: </span><span className="text-on-surface">{analysis?.tTest?.tStatistic?.toFixed(4) ?? '—'}</span></div>
                  <div><span className="text-on-surface-variant">p-value: </span><span className={`${(analysis?.tTest?.pValue ?? 1) < 0.05 ? 'text-secondary' : 'text-yellow-400'}`}>{analysis?.tTest?.pValue?.toFixed(4) ?? '—'}</span></div>
                  <div><span className="text-on-surface-variant">Significant: </span><span className={analysis?.tTest?.isSignificant ? 'text-secondary' : 'text-on-surface-variant'}>{analysis?.tTest?.isSignificant ? 'Yes' : 'No'}</span></div>
                </div>
                <p className="mt-2 text-on-surface">{analysis?.recommendation ?? 'Run test to see results.'}</p>
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
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <TestTube2 size={20} className="text-primary" /> A/B Testing
          </h1>
          <p className="text-on-surface-variant text-sm">Compare models with statistical significance testing</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New A/B Test
        </button>
      </div>

      {testItems.length === 0 ? (
        <div className="card text-center py-10">
          <TestTube2 size={32} className="text-outline-variant mx-auto mb-3" />
          <p className="text-on-surface-variant">No A/B tests yet</p>
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
          <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/20">
              <h3 className="font-semibold text-on-surface">Create A/B Test</h3>
              <button onClick={() => setShowCreate(false)} className="text-on-surface-variant hover:text-on-surface"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-on-surface-variant block mb-1">Test Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Model A vs Model B" />
              </div>
              {['variantAId', 'variantBId'].map((key, i) => (
                <div key={key}>
                  <label className="text-xs text-on-surface-variant block mb-1">Variant {['A', 'B'][i]}</label>
                  <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input-field">
                    <option value="">Select model...</option>
                    {models?.data?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-on-surface-variant block mb-1">Sample Size</label>
                  <input type="number" value={form.sampleSize} min={20} max={10000}
                    onChange={e => setForm(f => ({ ...f, sampleSize: Number(e.target.value) }))} className="input-field" />
                </div>
                <div>
                  <label className="text-xs text-on-surface-variant block mb-1">Confidence Level</label>
                  <select value={form.confidenceLevel} onChange={e => setForm(f => ({ ...f, confidenceLevel: Number(e.target.value) }))} className="input-field">
                    <option value={0.90}>90%</option>
                    <option value={0.95}>95%</option>
                    <option value={0.99}>99%</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-outline-variant/20 flex gap-3">
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
