import { useState } from 'react'
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import toast from 'react-hot-toast'

const DEMO_ALERTS = [
  { id: '1', name: 'EV > 5%', type: 'EV_THRESHOLD', isActive: true, conditions: { minEV: 5 }, lastTriggered: new Date(Date.now() - 3600000) },
  { id: '2', name: 'Arbitrage Detected', type: 'ARBITRAGE', isActive: true, conditions: { minProfit: 1 }, lastTriggered: null },
  { id: '3', name: 'Line Move > 3pts', type: 'LINE_MOVEMENT', isActive: false, conditions: { points: 3 }, lastTriggered: new Date(Date.now() - 86400000) },
]

const ALERT_TYPES = [
  { value: 'EV_THRESHOLD', label: 'EV Threshold', desc: 'Trigger when EV exceeds a percentage' },
  { value: 'ARBITRAGE', label: 'Arbitrage Detected', desc: 'Notify on arbitrage opportunities' },
  { value: 'LINE_MOVEMENT', label: 'Line Movement', desc: 'Alert on significant odds changes' },
  { value: 'INJURY', label: 'Injury Report', desc: 'Monitor player injury updates' },
  { value: 'CUSTOM', label: 'Custom', desc: 'Define your own conditions' },
]

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(DEMO_ALERTS)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'EV_THRESHOLD', minEV: 5, minProfit: 1 })

  const toggle = (id: string) => {
    setAlerts(a => a.map(alert => alert.id === id ? { ...alert, isActive: !alert.isActive } : alert))
  }
  const remove = (id: string) => {
    setAlerts(a => a.filter(alert => alert.id !== id))
    toast.success('Alert deleted')
  }
  const create = () => {
    setAlerts(a => [...a, { id: Date.now().toString(), name: form.name, type: form.type, isActive: true, conditions: { minEV: form.minEV, minProfit: form.minProfit }, lastTriggered: null }])
    setShowCreate(false)
    toast.success('Alert created!')
  }

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

      <div className="grid gap-3">
        {alerts.map(alert => (
          <div key={alert.id} className={`card flex items-center gap-4 ${!alert.isActive ? 'opacity-60' : ''}`}>
            <button onClick={() => toggle(alert.id)} className={alert.isActive ? 'text-green-400' : 'text-slate-500'}>
              {alert.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </button>
            <div className="flex-1">
              <p className="font-medium text-white">{alert.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{alert.type.replace('_', ' ')}</span>
                {alert.lastTriggered ? (
                  <span className="text-xs text-slate-500">Last: {new Date(alert.lastTriggered).toLocaleTimeString()}</span>
                ) : (
                  <span className="text-xs text-slate-600">Never triggered</span>
                )}
              </div>
            </div>
            <button onClick={() => remove(alert.id)} className="text-slate-500 hover:text-red-400">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Create Alert</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Alert Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="EV Alert" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Alert Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                  {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.type === 'EV_THRESHOLD' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Minimum EV (%)</label>
                  <input type="number" value={form.minEV} min={0} max={50} step={0.5} onChange={e => setForm(f => ({ ...f, minEV: Number(e.target.value) }))} className="input-field" />
                </div>
              )}
              {form.type === 'ARBITRAGE' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Minimum Profit (%)</label>
                  <input type="number" value={form.minProfit} min={0} max={10} step={0.1} onChange={e => setForm(f => ({ ...f, minProfit: Number(e.target.value) }))} className="input-field" />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={create} disabled={!form.name} className="btn-primary flex-1">Create Alert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
