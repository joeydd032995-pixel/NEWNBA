import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { alertsApi, notificationsApi } from '../lib/api'

const ALERT_TYPES = [
  { value: 'EV_THRESHOLD',  label: 'EV Threshold',       iconName: 'bolt',          color: 'text-secondary',        desc: 'Notify when EV% exceeds threshold' },
  { value: 'ARBITRAGE',     label: 'Arbitrage Detected',  iconName: 'balance',       color: 'text-primary',          desc: 'Notify on guaranteed-profit opportunities' },
  { value: 'LINE_MOVEMENT', label: 'Line Movement',       iconName: 'show_chart',    color: 'text-yellow-400',       desc: 'Notify on significant odds shifts' },
  { value: 'INJURY',        label: 'Injury Report',       iconName: 'personal_injury', color: 'text-error',          desc: 'Notify on player OUT/DOUBTFUL reports' },
  { value: 'CONTRARIAN',    label: 'Contrarian Signal',   iconName: 'people',        color: 'text-purple-400',       desc: 'Notify when experts fade public betting' },
  { value: 'CUSTOM',        label: 'Custom',              iconName: 'notifications', color: 'text-on-surface-variant', desc: 'General purpose alert' },
]

export default function AlertsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1, threshold: 3 })

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
      conditions: {
        minEV: form.minEV,
        minProfit: form.minProfit,
        threshold: form.threshold,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      setShowCreate(false)
      setForm({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1, threshold: 3 })
      toast.success('Alert created!')
    },
  })

  const evalMut = useMutation({
    mutationFn: () => notificationsApi.evaluate(),
    onSuccess: (res) => toast.success(res.data.message),
    onError: () => toast.error('Evaluation failed'),
  })

  const selectedTypeMeta = ALERT_TYPES.find(t => t.value === form.type) ?? ALERT_TYPES[ALERT_TYPES.length - 1]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-yellow-400" style={{ fontSize: 20 }}>notifications_active</span>
          </div>
          <div>
            <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface">Alerts</h1>
            <p className="text-sm text-on-surface-variant">Get notified on betting opportunities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => evalMut.mutate()}
            disabled={evalMut.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sensors</span>
            {evalMut.isPending ? 'Evaluating…' : 'Check Now'}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New Alert
          </button>
        </div>
      </div>

      {/* Alert Type Reference Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {ALERT_TYPES.map(t => (
          <div key={t.value} className="card p-3 text-center">
            <span className={`material-symbols-outlined block mx-auto mb-1 ${t.color}`} style={{ fontSize: 20 }}>
              {t.iconName}
            </span>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Alert List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-32 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 24 }}>refresh</span>
          <span className="text-sm">Loading alerts…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.length === 0 && (
            <div className="card p-12 text-center">
              <span className="material-symbols-outlined text-outline-variant block mx-auto mb-3" style={{ fontSize: 40 }}>
                notification_add
              </span>
              <p className="text-on-surface font-semibold mb-1">No alerts yet</p>
              <p className="text-sm text-on-surface-variant mb-4">Create your first alert to get notified on opportunities.</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Create Alert
              </button>
            </div>
          )}
          {alerts.map((alert: any) => {
            const typeMeta = ALERT_TYPES.find(t => t.value === alert.type) ?? ALERT_TYPES[ALERT_TYPES.length - 1]
            return (
              <div
                key={alert.id}
                className={`card flex items-center gap-4 transition-opacity ${!alert.isActive ? 'opacity-50' : ''}`}
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleMut.mutate(alert.id)}
                  className={`shrink-0 transition-colors ${alert.isActive ? 'text-secondary' : 'text-outline-variant'}`}
                  aria-label={alert.isActive ? 'Disable alert' : 'Enable alert'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
                    {alert.isActive ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>

                {/* Type Icon */}
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-high/60`}>
                  <span className={`material-symbols-outlined ${typeMeta.color}`} style={{ fontSize: 18 }}>
                    {typeMeta.iconName}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-on-surface truncate">{alert.name}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full bg-surface-container-high ${typeMeta.color} font-medium`}>
                      {typeMeta.label}
                    </span>
                    <span className="text-xs text-on-surface-variant">{typeMeta.desc}</span>
                    {alert.lastTriggered && (
                      <span className="text-xs text-outline-variant ml-auto shrink-0">
                        Last fired: {new Date(alert.lastTriggered).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeMut.mutate(alert.id)}
                  className="shrink-0 text-outline-variant hover:text-error transition-colors"
                  aria-label="Delete alert"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-container-low border border-outline-variant/15 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>add_alert</span>
                <h3 className="font-headline font-bold text-on-surface">Create Alert</h3>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
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
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                  Alert Type
                </label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="input-field"
                >
                  {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Selected type preview */}
              <div className={`flex items-start gap-3 px-4 py-3 rounded-xl bg-surface-container-high/60 border border-outline-variant/10`}>
                <span className={`material-symbols-outlined mt-0.5 ${selectedTypeMeta.color}`} style={{ fontSize: 18 }}>
                  {selectedTypeMeta.iconName}
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">{selectedTypeMeta.desc}</p>
              </div>

              {/* Conditional fields */}
              {form.type === 'EV_THRESHOLD' && (
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                    Minimum EV (%)
                  </label>
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
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                    Minimum Profit (%)
                  </label>
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
              {form.type === 'LINE_MOVEMENT' && (
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                    Minimum Move (% implied prob shift)
                  </label>
                  <input
                    type="number"
                    value={form.threshold}
                    min={1}
                    max={20}
                    step={0.5}
                    onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              )}
              {form.type === 'INJURY' && (
                <p className="text-xs text-on-surface-variant italic bg-error/8 border border-error/15 rounded-xl px-4 py-3">
                  Fires when a player is listed OUT or DOUBTFUL within the last 30 minutes.
                </p>
              )}
              {form.type === 'CONTRARIAN' && (
                <p className="text-xs text-on-surface-variant italic bg-primary/8 border border-primary/15 rounded-xl px-4 py-3">
                  Fires when &ge;60% of experts back an outcome but &le;40% of public bets agree — a high-value fade signal.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-outline-variant/10 flex gap-3">
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
