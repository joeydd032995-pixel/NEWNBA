import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { alertsApi } from '../lib/api'

const ALERT_TYPES = [
  { value: 'EV_THRESHOLD', label: 'EV Threshold' },
  { value: 'ARBITRAGE', label: 'Arbitrage Detected' },
  { value: 'LINE_MOVEMENT', label: 'Line Movement' },
  { value: 'INJURY', label: 'Injury Report' },
  { value: 'CUSTOM', label: 'Custom' },
]

export default function AlertsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1 })

  const { data, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => alertsApi.getAll().then(r => r.data) })
  const alerts: any[] = Array.isArray(data) ? data : []

  const toggleMut = useMutation({
    mutationFn: (id: string) => alertsApi.toggle(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['alerts'] })
      const prev = qc.getQueryData(['alerts'])
      qc.setQueryData(['alerts'], (old: any) =>
        Array.isArray(old) ? old.map((a: any) => a.id === id ? { ...a, isActive: !a.isActive } : a) : old
      )
      return { prev }
    },
    onError: (_err: any, _id: any, ctx: any) => {
      qc.setQueryData(['alerts'], ctx?.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast.success('Alert deleted')
    },
  })

  const createMut = useMutation({
    mutationFn: () => alertsApi.create({
      name: form.name,
      type: form.type,
      conditions: { minEV: form.minEV, minProfit: form.minProfit },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      setShowCreate(false)
      setForm({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1 })
      toast.success('Alert created!')
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell size={20} className="text-yellow-400" /> Alerts
          </h1>
          <p className="text-slate-400 text-sm">Get notified on betting opportunities</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New Alert
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading alerts…</p>
      ) : (
        <div className="grid gap-3">
          {alerts.length === 0 && (
            <p className="text-slate-500 text-sm">No alerts yet. Create one to get started.</p>
          )}
          {alerts.map((alert: any) => (
            <div key={alert.id} className={`card flex items-center gap-4 ${!alert.isActive ? 'opacity-60' : ''}`}>
              <button
                onClick={() => toggleMut.mutate(alert.id)}
                className={alert.isActive ? 'text-green-400' : 'text-slate-500'}
              >
                {alert.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              </button>
              <div className="flex-1">
                <p className="font-medium text-white">{alert.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {alert.type.replace('_', ' ')}
                  </span>
                  {alert.lastTriggered ? (
                    <span className="text-xs text-slate-500">
                      Last: {new Date(alert.lastTriggered).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">Never triggered</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeMut.mutate(alert.id)}
                className="text-slate-500 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Create Alert</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Alert Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="EV Alert"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Alert Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="input-field"
                >
                  {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.type === 'EV_THRESHOLD' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Minimum EV (%)</label>
                  <input
                    type="number"
                    value={form.minEV}
                    min={0}
                    max={50}
                    step={0.5}
                    onChange={e => setForm(f => ({ ...f, minEV: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              )}
              {form.type === 'ARBITRAGE' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Minimum Profit (%)</label>
                  <input
                    type="number"
                    value={form.minProfit}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={e => setForm(f => ({ ...f, minProfit: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!form.name || createMut.isPending}
                className="btn-primary flex-1"
              >
                {createMut.isPending ? 'Creating…' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
