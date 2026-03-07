import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Plus, Trash2, Wand2, X } from 'lucide-react'
import { ensembleApi, analyticsApi } from '../lib/api'
import toast from 'react-hot-toast'

const STRATEGIES = [
  { value: 'WEIGHTED_AVERAGE', label: 'Weighted Average', desc: 'Σ(weight × prob) / Σweight' },
  { value: 'VOTING', label: 'Voting', desc: 'Majority vote with confidence weighting' },
  { value: 'STACKING', label: 'Stacking', desc: 'Meta-learner on component predictions' },
  { value: 'BOOSTING', label: 'Boosting', desc: 'Sequential emphasis on hard cases' },
]

function EnsembleCard({ ensemble, onDelete, onOptimize }: any) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{ensemble.name}</h3>
          <p className="text-xs text-slate-500">{ensemble.description || 'Ensemble model'}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onOptimize(ensemble.id)} title="Auto-optimize weights"
            className="p-1.5 text-slate-500 hover:text-yellow-400"><Wand2 size={14} /></button>
          <button onClick={() => onDelete(ensemble.id)} className="p-1.5 text-slate-500 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          ensemble.strategy === 'STACKING' ? 'bg-purple-900/40 text-purple-400' :
          ensemble.strategy === 'BOOSTING' ? 'bg-orange-900/40 text-orange-400' :
          ensemble.strategy === 'VOTING' ? 'bg-blue-900/40 text-blue-400' :
          'bg-green-900/40 text-green-400'
        }`}>{ensemble.strategy}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-xs text-slate-500 uppercase">Components ({ensemble.components?.length ?? 0})</p>
        {(ensemble.components ?? []).slice(0, 3).map((c: any) => (
          <div key={c.id} className="flex justify-between text-xs">
            <span className="text-slate-300">{c.model?.name ?? 'Unknown'}</span>
            <span className="text-slate-400">{(c.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateEnsembleModal({ onClose, models }: any) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState('WEIGHTED_AVERAGE')
  const [components, setComponents] = useState<Array<{ modelId: string; weight: number }>>([])
  const qc = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: any) => ensembleApi.create(data),
    onSuccess: () => { toast.success('Ensemble created!'); qc.invalidateQueries({ queryKey: ['ensembles'] }); onClose() },
  })

  const addComponent = () => {
    if (models?.length) {
      setComponents(c => [...c, { modelId: models[0].id, weight: 1 / (c.length + 1) }])
    }
  }

  const updateWeight = (i: number, w: number) => {
    setComponents(c => c.map((item, idx) => idx === i ? { ...item, weight: w } : item))
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-900 border border-slate-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="font-semibold text-white">Create Ensemble Model</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Strategy</label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map(s => (
                <label key={s.value} className={`flex flex-col gap-0.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  strategy === s.value ? 'border-primary-500 bg-primary-500/10' : 'border-slate-700 hover:border-slate-600'
                }`}>
                  <input type="radio" value={s.value} checked={strategy === s.value} onChange={() => setStrategy(s.value)} className="sr-only" />
                  <span className="text-sm font-medium text-white">{s.label}</span>
                  <span className="text-xs text-slate-500">{s.desc}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Component Models</label>
              <button onClick={addComponent} className="text-xs text-primary-400 hover:underline flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            {components.length === 0 && (
              <p className="text-xs text-slate-500">No components yet. Add models above.</p>
            )}
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <select value={c.modelId} onChange={e => setComponents(comp => comp.map((item, idx) => idx === i ? { ...item, modelId: e.target.value } : item))}
                  className="input-field py-1 flex-1 text-sm">
                  {models?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input type="number" value={c.weight} step={0.1} min={0} max={1} onChange={e => updateWeight(i, Number(e.target.value))}
                  className="input-field py-1 w-20 text-sm" />
                <button onClick={() => setComponents(comp => comp.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-t border-slate-800 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => createMutation.mutate({ name, description, strategy, components })}
            disabled={!name || components.length < 2 || createMutation.isPending}
            className="btn-primary flex-1">
            {createMutation.isPending ? 'Creating...' : 'Create Ensemble'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EnsemblePage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: ensembles } = useQuery({ queryKey: ['ensembles'], queryFn: () => ensembleApi.getAll() })
  const { data: models } = useQuery({ queryKey: ['custom-models'], queryFn: () => analyticsApi.getModels() })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ensembleApi.remove(id),
    onSuccess: () => { toast.success('Ensemble deleted'); qc.invalidateQueries({ queryKey: ['ensembles'] }) },
  })

  const optimizeMutation = useMutation({
    mutationFn: (id: string) => ensembleApi.optimizeWeights(id),
    onSuccess: () => { toast.success('Weights optimized!'); qc.invalidateQueries({ queryKey: ['ensembles'] }) },
  })

  const ensembleItems = ensembles?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical size={20} className="text-orange-400" /> Ensemble Models
          </h1>
          <p className="text-slate-400 text-sm">Combine multiple models for better predictions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New Ensemble
        </button>
      </div>

      {/* Strategy explainer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STRATEGIES.map(s => (
          <div key={s.value} className="card text-sm">
            <p className="font-medium text-white">{s.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
          </div>
        ))}
      </div>

      {ensembleItems.length === 0 ? (
        <div className="card text-center py-10">
          <FlaskConical size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No ensemble models yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-3">Create first ensemble</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ensembleItems.map((e: any) => (
            <EnsembleCard key={e.id} ensemble={e}
              onDelete={(id: string) => deleteMutation.mutate(id)}
              onOptimize={(id: string) => optimizeMutation.mutate(id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateEnsembleModal onClose={() => setShowCreate(false)} models={models?.data ?? []} />
      )}
    </div>
  )
}
