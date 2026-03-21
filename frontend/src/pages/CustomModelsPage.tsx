import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Copy, X } from 'lucide-react'
import { analyticsApi } from '../lib/api'
import toast from 'react-hot-toast'

const DEFAULT_WEIGHTS = {
  efgPct: 0.15, tsPct: 0.10, fourFactorsOffense: 0.10, fourFactorsDefense: 0.10,
  tovPct: 0.08, orbPct: 0.07, ftr: 0.07, netRating: 0.10, pace: 0.05,
  usgPct: 0.05, homeCourtAdvantage: 0.05, momentum: 0.05, recentForm: 0.05,
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-on-surface-variant w-36 truncate">{label}</span>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-purple-500"
      />
      <span className="text-xs font-mono text-on-surface w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function ModelCard({ model, onDelete, onDuplicate }: any) {
  const weights = model.weights || {}
  const topWeights = Object.entries(weights)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)

  return (
    <div className="card hover:border-outline-variant/30 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline font-bold text-on-surface">{model.name}</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">{model.description || 'Custom model'}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onDuplicate(model.id)} className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors">
            <Copy size={14} />
          </button>
          <button onClick={() => onDelete(model.id)} className="p-1.5 text-on-surface-variant hover:text-error transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {topWeights.map(([key, val]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-on-surface-variant">{key}</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(val as number) * 100}%` }} />
              </div>
              <span className="text-on-surface w-8 text-right">{((val as number) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${model.isPublic ? 'bg-secondary/15 text-secondary border border-secondary/30' : 'bg-surface-container-highest text-on-surface-variant'}`}>
          {model.isPublic ? 'Public' : 'Private'}
        </span>
        {model.isActive && (
          <span className="text-xs px-2 py-0.5 rounded-full text-primary bg-primary/10 border border-primary/25">
            Active
          </span>
        )}
      </div>
    </div>
  )
}

function CreateModelModal({ onClose, presetModels }: any) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS })
  const [fromPreset, setFromPreset] = useState('')
  const qc = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: any) => analyticsApi.createModel(data),
    onSuccess: () => { toast.success('Model created!'); qc.invalidateQueries({ queryKey: ['custom-models'] }); onClose() },
    onError: (err: any) => toast.error(`Failed to create model: ${err?.response?.data?.message || err.message}`),
  })

  const loadPreset = (id: string) => {
    const preset = presetModels?.find((p: any) => p.id === id)
    if (preset) setWeights({ ...DEFAULT_WEIGHTS, ...preset.weights })
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const normalize = () => {
    const total = totalWeight
    if (total === 0) return
    const normalized: any = {}
    for (const [k, v] of Object.entries(weights)) normalized[k] = v / total
    setWeights(normalized)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" style={{ backdropFilter: 'blur(8px)' }}>
      <div className="bg-surface-container-low border border-outline-variant/15 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/10">
          <h3 className="font-headline font-bold text-on-surface text-lg">Create Custom Model</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          <div>
            <label className="label-sm">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My Model" />
          </div>
          <div>
            <label className="label-sm">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label-sm">Start from preset</label>
            <select value={fromPreset} onChange={e => { setFromPreset(e.target.value); loadPreset(e.target.value) }} className="input-field">
              <option value="">Custom</option>
              {presetModels?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label-sm mb-0">Weights</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${Math.abs(totalWeight - 1) < 0.01 ? 'text-secondary' : 'text-yellow-400'}`}>
                  Sum: {(totalWeight * 100).toFixed(0)}%
                </span>
                <button onClick={normalize} className="text-xs text-primary hover:brightness-110 transition-all">Normalize</button>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(weights).map(([key, val]) => (
                <WeightSlider key={key} label={key} value={val as number}
                  onChange={v => setWeights(w => ({ ...w, [key]: v }))} />
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-outline-variant/10 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => createMutation.mutate({ name, description, weights })}
            disabled={!name || createMutation.isPending}
            className="btn-primary flex-1"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Model'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomModelsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: models, isLoading } = useQuery({ queryKey: ['custom-models'], queryFn: () => analyticsApi.getModels() })
  const { data: presets } = useQuery({ queryKey: ['preset-models'], queryFn: () => analyticsApi.getPresetModels() })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteModel(id),
    onSuccess: () => { toast.success('Model deleted'); qc.invalidateQueries({ queryKey: ['custom-models'] }) },
  })

  const dupMutation = useMutation({
    mutationFn: (id: string) => analyticsApi.duplicateModel(id),
    onSuccess: () => { toast.success('Model duplicated'); qc.invalidateQueries({ queryKey: ['custom-models'] }) },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>architecture</span>
            Custom Models
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Build and manage your betting models</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={15} /> New Model
        </button>
      </div>

      {/* Preset models */}
      <div>
        <h2 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">12 Preset Models</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(presets?.data ?? []).map((preset: any) => (
            <div key={preset.id} className="card cursor-default hover:border-primary/20 transition-colors">
              <p className="font-headline font-bold text-on-surface text-sm">{preset.name}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{preset.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom models */}
      <div>
        <h2 className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">Your Models</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2].map(i => <div key={i} className="card h-32 animate-pulse bg-surface-container-high" />)}
          </div>
        ) : models?.data?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.data.map((m: any) => (
              <ModelCard key={m.id} model={m} onDelete={(id: string) => deleteMutation.mutate(id)} onDuplicate={(id: string) => dupMutation.mutate(id)} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-12">
            <span className="material-symbols-outlined text-on-surface-variant/30 mx-auto mb-3" style={{ fontSize: '40px', display: 'block' }}>architecture</span>
            <p className="text-on-surface-variant">No custom models yet</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">Create your first model</button>
          </div>
        )}
      </div>

      {showCreate && <CreateModelModal onClose={() => setShowCreate(false)} presetModels={presets?.data ?? []} />}
    </div>
  )
}
