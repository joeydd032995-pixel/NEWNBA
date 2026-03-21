import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { ensembleApi, analyticsApi } from '../lib/api'
import toast from 'react-hot-toast'

/* ── Strategy card data ──────────────────────────────────────────────────── */
const STRATEGIES = [
  {
    value: 'WEIGHTED_AVERAGE',
    label: 'Weighted Average',
    desc: 'Linear blend of component predictions weighted by confidence.',
    badge: 'POPULAR',
    icon: 'balance',
    formula: 'Sum(weight x prob) / Sum(weight)',
  },
  {
    value: 'VOTING',
    label: 'Voting',
    desc: 'Majority vote with confidence-weighted ballots across models.',
    badge: 'STANDARD',
    icon: 'how_to_vote',
    formula: 'Majority vote with confidence weighting',
  },
  {
    value: 'STACKING',
    label: 'Stacking',
    desc: 'Meta-learner trained on component model predictions in logit space.',
    badge: 'ADVANCED',
    icon: 'stacks',
    formula: 'Meta-learner on component predictions',
  },
  {
    value: 'BOOSTING',
    label: 'Boosting',
    desc: 'Sequential correction weighting that emphasizes hard-to-predict cases.',
    badge: 'HIGH TECH',
    icon: 'rocket_launch',
    formula: 'Sequential emphasis on hard cases',
  },
]

/* ── Ensemble Card (for listing) ─────────────────────────────────────────── */
function EnsembleCard({ ensemble, onDelete, onOptimize }: any) {
  const strat = STRATEGIES.find(s => s.value === ensemble.strategy) ?? STRATEGIES[0]
  return (
    <div className="card group hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>{strat.icon}</span>
          </div>
          <div>
            <h3 className="font-headline font-bold text-on-surface">{ensemble.name}</h3>
            <p className="text-xs text-on-surface-variant">{ensemble.description || strat.label}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onOptimize(ensemble.id)}
            title="Auto-optimize weights"
            className="p-1.5 text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>
          </button>
          <button
            onClick={() => onDelete(ensemble.id)}
            className="p-1.5 text-on-surface-variant hover:text-error transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <span className="badge-yellow">{ensemble.strategy}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="stat-label">Components ({ensemble.components?.length ?? 0})</p>
        {(ensemble.components ?? []).slice(0, 3).map((c: any) => (
          <div key={c.id} className="flex justify-between text-xs">
            <span className="text-on-surface">{c.model?.name ?? 'Unknown'}</span>
            <span className="text-on-surface-variant font-mono">{(c.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Create Ensemble Modal ───────────────────────────────────────────────── */
function CreateEnsembleModal({ onClose, models }: any) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState('WEIGHTED_AVERAGE')
  const [components, setComponents] = useState<Array<{ modelId: string; weight: number }>>([])
  const qc = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: any) => ensembleApi.create(data),
    onSuccess: () => { toast.success('Ensemble created!'); qc.invalidateQueries({ queryKey: ['ensembles'] }); onClose() },
    onError: () => toast.error('Failed to create ensemble'),
  })

  const addComponent = () => {
    if (models?.length) {
      setComponents(c => {
        const n = c.length + 1
        return [...c.map(item => ({ ...item, weight: 1 / n })), { modelId: models[0].id, weight: 1 / n }]
      })
    }
  }

  const updateWeight = (i: number, w: number) => {
    setComponents(c => c.map((item, idx) => idx === i ? { ...item, weight: w } : item))
  }

  return (
    <div className="modal-backdrop">
      <div className="bg-surface-container-low border border-outline-variant/15 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>stacks</span>
            <h3 className="font-headline font-bold text-on-surface">Create Ensemble Model</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My Ensemble" />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Strategy</label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map(s => (
                <label key={s.value} className={`flex flex-col gap-0.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  strategy === s.value ? 'border-primary/50 bg-primary/8' : 'border-outline-variant/20 hover:border-outline-variant/40'
                }`}>
                  <input type="radio" value={s.value} checked={strategy === s.value} onChange={() => setStrategy(s.value)} className="sr-only" />
                  <span className="text-sm font-headline font-bold text-on-surface">{s.label}</span>
                  <span className="text-[10px] text-on-surface-variant">{s.formula}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Component Models</label>
              <button onClick={addComponent} className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold">
                <Plus size={12} /> Add
              </button>
            </div>
            {components.length === 0 && (
              <p className="text-xs text-on-surface-variant">No components yet. Add models above.</p>
            )}
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <select value={c.modelId} onChange={e => setComponents(comp => comp.map((item, idx) => idx === i ? { ...item, modelId: e.target.value } : item))}
                  className="input-field py-1.5 flex-1 text-sm">
                  {models?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input type="number" value={c.weight} step={0.1} min={0} max={1} onChange={e => updateWeight(i, Number(e.target.value))}
                  className="input-field py-1.5 w-20 text-sm" />
                <button onClick={() => setComponents(comp => comp.filter((_, idx) => idx !== i))} className="text-on-surface-variant hover:text-error transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-outline-variant/10 flex gap-3">
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

/* ────────────────────────────────────────────────────────────────────────────
   Ensemble Page
   ──────────────────────────────────────────────────────────────────────────── */
export default function EnsemblePage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: ensembles } = useQuery({ queryKey: ['ensembles'], queryFn: () => ensembleApi.getAll() })
  const { data: models } = useQuery({ queryKey: ['custom-models'], queryFn: () => analyticsApi.getModels() })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ensembleApi.remove(id),
    onSuccess: () => { toast.success('Ensemble deleted'); qc.invalidateQueries({ queryKey: ['ensembles'] }) },
    onError: () => toast.error('Failed to delete ensemble'),
  })

  const optimizeMutation = useMutation({
    mutationFn: (id: string) => ensembleApi.optimizeWeights(id),
    onSuccess: () => { toast.success('Weights optimized!'); qc.invalidateQueries({ queryKey: ['ensembles'] }) },
    onError: () => toast.error('Failed to optimize weights'),
  })

  const ensembleItems = ensembles?.data ?? []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-black font-headline tracking-tight text-on-surface">
          Ensemble Models
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Combine multiple models for stronger, more resilient predictions
        </p>
      </div>

      {/* ── 4-col Strategy Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STRATEGIES.map(s => (
          <div key={s.value} className="card group hover:border-primary/30 transition-colors flex flex-col justify-between">
            <div>
              {/* Icon box */}
              <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }}>{s.icon}</span>
              </div>

              {/* Name + description */}
              <h3 className="text-sm font-black font-headline text-on-surface">{s.label}</h3>
              <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">{s.desc}</p>
            </div>

            {/* Badge + arrow */}
            <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between">
              <span className="stat-label text-primary">{s.badge}</span>
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors" style={{ fontSize: 16 }}>
                arrow_forward
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Ensemble List or Empty State ──────────────────────────────────── */}
      {ensembleItems.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: 32 }}>stacks</span>
          </div>
          <p className="text-on-surface font-headline font-bold text-lg mb-1">No ensemble models yet</p>
          <p className="text-sm text-on-surface-variant mb-6 max-w-sm mx-auto">
            Create your first ensemble to combine multiple models for stronger predictions.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            Create first ensemble
          </button>
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

      {/* ── Create Modal ───────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateEnsembleModal onClose={() => setShowCreate(false)} models={models?.data ?? []} />
      )}
    </div>
  )
}
