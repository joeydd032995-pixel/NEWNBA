import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, Plus, Trash2, Copy, Edit2, X, Check } from 'lucide-react'
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
      <span className="text-xs text-slate-400 w-36 truncate">{label}</span>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-primary-500"
      />
      <span className="text-xs font-mono text-white w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function ModelCard({ model, onDelete, onDuplicate }: any) {
  const weights = model.weights || {}
  const topWeights = Object.entries(weights)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)

  return (
    <div className="card hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{model.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{model.description || 'Custom model'}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onDuplicate(model.id)} className="p-1.5 text-slate-500 hover:text-white">
            <Copy size={14} />
          </button>
          <button onClick={() => onDelete(model.id)} className="p-1.5 text-slate-500 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {topWeights.map(([key, val]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-slate-400">{key}</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(val as number) * 100}%` }} />
              </div>
              <span className="text-white w-8 text-right">{((val as number) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${model.isPublic ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
          {model.isPublic ? 'Public' : 'Private'}
        </span>
        {model.isActive && (
          <span
            className="text-xs px-2 py-0.5 rounded-full text-neon-blue-400"
            style={{ background: 'linear-gradient(135deg, rgba(0,3,112,0.35) 0%, rgba(76,65,158,0.10) 100%)', border: '1px solid rgba(76,65,158,0.30)', boxShadow: '0 0 8px rgba(76,65,158,0.2)' }}
          >
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
    onError: () => toast.error('Failed to create model'),
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-900 border border-dark-600 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <h3 className="font-semibold text-white">Create Custom Model</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My Model" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Start from preset</label>
            <select value={fromPreset} onChange={e => { setFromPreset(e.target.value); loadPreset(e.target.value) }} className="input-field">
              <option value="">Custom</option>
              {presetModels?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400">Weights</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${Math.abs(totalWeight - 1) < 0.01 ? 'text-green-400' : 'text-yellow-400'}`}>
                  Sum: {(totalWeight * 100).toFixed(0)}%
                </span>
                <button onClick={normalize} className="text-xs text-primary-400 hover:underline">Normalize</button>
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
        <div className="p-4 border-t border-dark-600 flex gap-3">
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders size={20} className="text-primary-400" /> Custom Models
          </h1>
          <p className="text-slate-400 text-sm">Build and manage your betting models</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New Model
        </button>
      </div>

      {/* Preset models */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">12 Preset Models</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(presets?.data ?? []).map((preset: any) => (
            <div key={preset.id} className="card text-sm cursor-default hover:border-primary-500/30 transition-colors">
              <p className="font-medium text-white">{preset.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{preset.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom models */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Your Models</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2].map(i => <div key={i} className="card h-32 animate-pulse" />)}
          </div>
        ) : models?.data?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.data.map((m: any) => (
              <ModelCard key={m.id} model={m} onDelete={(id: string) => deleteMutation.mutate(id)} onDuplicate={(id: string) => dupMutation.mutate(id)} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-10">
            <Sliders size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No custom models yet</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-3">Create your first model</button>
          </div>
        )}
      </div>

      {showCreate && <CreateModelModal onClose={() => setShowCreate(false)} presetModels={presets?.data ?? []} />}
    </div>
  )
}
