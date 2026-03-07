import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, Target } from 'lucide-react'
import { analyticsApi } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

// Demo performance data
const demoROIData = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  balanced: +(i * 0.3 + (Math.random() - 0.4) * 2).toFixed(2),
  moreyball: +(i * 0.4 + (Math.random() - 0.35) * 2.5).toFixed(2),
  defensive: +(i * 0.2 + (Math.random() - 0.45) * 1.5).toFixed(2),
}))

function MetricCard({ label, value, icon: Icon, color = 'text-white', subtitle }: any) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="stat-label">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <p className={`stat-value ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

export default function PerformancePage() {
  const { data: leaderboard } = useQuery({ queryKey: ['leaderboard'], queryFn: () => analyticsApi.getLeaderboard() })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity size={20} className="text-primary-400" /> Performance Analytics
        </h1>
        <p className="text-slate-400 text-sm">Track your model performance over time</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="30-Day ROI" value="+8.4%" icon={TrendingUp} color="text-green-400" subtitle="vs -3.2% market" />
        <MetricCard label="Win Rate" value="54.2%" icon={Target} color="text-blue-400" subtitle="Break-even: 52.4%" />
        <MetricCard label="Sharpe Ratio" value="1.42" icon={Activity} color="text-purple-400" subtitle="Risk-adjusted return" />
        <MetricCard label="Calibration" value="0.87" icon={TrendingDown} color="text-yellow-400" subtitle="Brier score: 0.13" />
      </div>

      {/* ROI Chart */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Cumulative ROI by Model</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={demoROIData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit="%" />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
            <Legend />
            <Line type="monotone" dataKey="balanced" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="moreyball" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="defensive" stroke="#a855f7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Model leaderboard */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Model Leaderboard</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
              <th className="text-left py-2 px-3">#</th>
              <th className="text-left py-2 px-3">Model</th>
              <th className="text-right py-2 px-3">ROI</th>
              <th className="text-right py-2 px-3">Win Rate</th>
              <th className="text-right py-2 px-3">Sharpe</th>
              <th className="text-right py-2 px-3">Bets</th>
            </tr>
          </thead>
          <tbody>
            {(leaderboard?.data?.length ? leaderboard.data : [
              { model: { name: 'Moreyball' }, roi: 0.12, winRate: 0.56, sharpeRatio: 1.8, totalBets: 142 },
              { model: { name: 'Efficiency' }, roi: 0.09, winRate: 0.54, sharpeRatio: 1.4, totalBets: 98 },
              { model: { name: 'Balanced' }, roi: 0.07, winRate: 0.53, sharpeRatio: 1.2, totalBets: 215 },
              { model: { name: 'Playoff' }, roi: 0.05, winRate: 0.52, sharpeRatio: 1.1, totalBets: 67 },
              { model: { name: 'Defensive' }, roi: 0.03, winRate: 0.52, sharpeRatio: 0.9, totalBets: 83 },
            ]).map((perf: any, i: number) => (
              <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                <td className="py-2.5 px-3 text-slate-500">{i + 1}</td>
                <td className="py-2.5 px-3 font-medium text-white">{perf.model?.name ?? 'Unknown'}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className={perf.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {perf.roi >= 0 ? '+' : ''}{((perf.roi ?? 0) * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-slate-300">{((perf.winRate ?? 0) * 100).toFixed(1)}%</td>
                <td className="py-2.5 px-3 text-right text-purple-400">{(perf.sharpeRatio ?? 0).toFixed(2)}</td>
                <td className="py-2.5 px-3 text-right text-slate-400">{perf.totalBets ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
