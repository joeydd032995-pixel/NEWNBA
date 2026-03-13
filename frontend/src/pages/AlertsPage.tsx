import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, X, BellOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { alertsApi } from '../lib/api'

const ALERT_TYPES = [
  { value: 'EV_THRESHOLD', label: 'EV Threshold'       },
  { value: 'ARBITRAGE',    label: 'Arbitrage Detected'  },
  { value: 'LINE_MOVEMENT',label: 'Line Movement'       },
  { value: 'INJURY',       label: 'Injury Report'       },
  { value: 'CUSTOM',       label: 'Custom'              },
]

const ALERT_TYPE_COLORS: Record<string, React.CSSProperties> = {
  EV_THRESHOLD: { background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' },
  ARBITRAGE:    { background: 'rgba(6,182,212,0.1)',  color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)'  },
  LINE_MOVEMENT:{ background: 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' },
  INJURY:       { background: 'rgba(239,68,68,0.1)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.2)'  },
  CUSTOM:       { background: 'rgba(255,255,255,0.05)',color: '#64748b', border: '1px solid rgba(255,255,255,0.08)'},
}

export default function AlertsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1 })

  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.getAll().then(r => r.data),
  })
  const alerts: any[] = Array.isArray(data) ? data : []

  const toggleMut = useMutation({
    mutationFn: (id: string) => alertsApi.toggle(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['alerts'] })
      const prev = qc.getQueryData(['alerts'])
      qc.setQueryData(['alerts'], (old: any) =>
        Array.isArray(old)
          ? old.map((a: any) => a.id === id ? { ...a, isActive: !a.isActive } : a)
          : old
      )
      return { prev }
    },
    onError: (_err: any, _id: any, ctx: any) => qc.setQueryData(['alerts'], ctx?.prev),
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
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <Bell size={18} className="text-gold-400" />
            Alerts
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Get notified on betting opportunities</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={13} />
          New Alert
        </button>
      </div>

      {/* ── Alert list ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="card h-16 skeleton" />)}
        </div>
      ) : (
        <div className="grid gap-2.5">
          {alerts.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-12 gap-3">
              <BellOff size={28} className="text-slate-700" />
              <div className="text-center">
                <p className="text-slate-500 text-sm">No alerts yet</p>
                <p className="text-slate-700 text-xs mt-0.5">Create an alert to get notified on opportunities</p>
              </div>
              <button onClick={() => setShowCreate(true)} className="btn-primary mt-1">
                <Plus size={13} /> Create Alert
              </button>
            </div>
          )}
          {alerts.map((alert: any) => (
            <div
              key={alert.id}
              className={`card flex items-center gap-4 transition-all duration-150 ${!alert.isActive ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => toggleMut.mutate(alert.id)}
                className="transition-colors duration-150 shrink-0"
                style={{ color: alert.isActive ? '#4ade80' : '#334155' }}
                aria-label={alert.isActive ? 'Disable alert' : 'Enable alert'}
              >
                {alert.isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm">{alert.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-2xs px-1.5 py-0.5 rounded font-semibold"
                    style={ALERT_TYPE_COLORS[alert.type] ?? ALERT_TYPE_COLORS.CUSTOM}
                  >
                    {alert.type.replace('_', ' ')}
                  </span>
                  {alert.lastTriggered ? (
                    <span className="text-2xs text-slate-600">
                      Last: {new Date(alert.lastTriggered).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="text-2xs text-slate-700">Never triggered</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => removeMut.mutate(alert.id)}
                className="text-slate-700 hover:text-red-400 transition-colors duration-150 shrink-0"
                aria-label="Delete alert"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Create alert modal ──────────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-backdrop">
          <div
            className="w-full max-w-md rounded-2xl animate-fade-in overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #0d1425 0%, #0a1020 100%)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
            }}
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-gold-400" />
                <h3 className="font-semibold text-white text-sm">Create Alert</h3>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="text-slate-600 hover:text-slate-300 transition-colors duration-150"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-2xs text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                  Alert Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. High EV Alert"
                />
              </div>

              <div>
                <label className="text-2xs text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                  Alert Type
                </label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="input-field"
                >
                  {ALERT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {form.type === 'EV_THRESHOLD' && (
                <div>
                  <label className="text-2xs text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                    Minimum EV (%)
                  </label>
                  <input
                    type="number"
                    value={form.minEV}
                    min={0} max={50} step={0.5}
                    onChange={e => setForm(f => ({ ...f, minEV: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              )}

              {form.type === 'ARBITRAGE' && (
                <div>
                  <label className="text-2xs text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                    Minimum Profit (%)
                  </label>
                  <input
                    type="number"
                    value={form.minProfit}
                    min={0} max={10} step={0.1}
                    onChange={e => setForm(f => ({ ...f, minProfit: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t flex gap-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                Cancel
              </button>
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
