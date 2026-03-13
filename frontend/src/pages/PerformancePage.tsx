import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, Target, Award } from 'lucide-react'
import { analyticsApi } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

// Demo performance data
const demoROIData = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  balanced:  +(i * 0.3  + (Math.random() - 0.4)  * 2).toFixed(2),
  moreyball: +(i * 0.4  + (Math.random() - 0.35) * 2.5).toFixed(2),
  defensive: +(i * 0.2  + (Math.random() - 0.45) * 1.5).toFixed(2),
}))

interface MetricCardProps {
  label: string
  value: string
  icon: React.ElementType
  accent: 'gold' | 'cyan' | 'green' | 'purple'
  subtitle?: string
}

function MetricCard({ label, value, icon: Icon, accent, subtitle }: MetricCardProps) {
  const styles = {
    gold:   { iconBg: 'rgba(245,158,11,0.12)', iconBorder: 'rgba(245,158,11,0.25)', iconColor: '#fbbf24', valueColor: 'text-gold-300',  cardClass: 'card-gold' },
    cyan:   { iconBg: 'rgba(6,182,212,0.12)',  iconBorder: 'rgba(6,182,212,0.25)',  iconColor: '#22d3ee', valueColor: 'text-cyan-300',  cardClass: 'card-cyan' },
    green:  { iconBg: 'rgba(74,222,128,0.12)', iconBorder: 'rgba(74,222,128,0.25)', iconColor: '#4ade80', valueColor: 'text-green-400', cardClass: 'card' },
    purple: { iconBg: 'rgba(168,85,247,0.12)', iconBorder: 'rgba(168,85,247,0.25)', iconColor: '#c084fc', valueColor: 'text-purple-400', cardClass: 'card' },
  }
  const s = styles[accent]

  return (
    <div className={s.cardClass}>
      <div className="flex items-center justify-between mb-3">
        <p className="stat-label">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
             style={{ background: s.iconBg, border: `1px solid ${s.iconBorder}` }}>
          <Icon size={13} style={{ color: s.iconColor }} />
        </div>
      </div>
      <p className={`stat-value ${s.valueColor}`}>{value}</p>
      {subtitle && <p className="text-2xs text-slate-600 mt-1.5">{subtitle}</p>}
    </div>
  )
}

export default function PerformancePage() {
  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => analyticsApi.getLeaderboard(),
  })

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
          <Activity size={18} className="text-cyan-400" />
          Performance Analytics
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">Track model performance and betting metrics over time</p>
      </div>

      {/* ── Summary stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="30-Day ROI"
          value="+8.4%"
          icon={TrendingUp}
          accent="green"
          subtitle="vs -3.2% market avg"
        />
        <MetricCard
          label="Win Rate"
          value="54.2%"
          icon={Target}
          accent="cyan"
          subtitle="Break-even: 52.4%"
        />
        <MetricCard
          label="Sharpe Ratio"
          value="1.42"
          icon={Activity}
          accent="gold"
          subtitle="Risk-adjusted return"
        />
        <MetricCard
          label="Calibration"
          value="0.87"
          icon={TrendingDown}
          accent="purple"
          subtitle="Brier score: 0.13"
        />
      </div>

      {/* ── ROI line chart ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Cumulative ROI by Model</h2>
            <p className="text-2xs text-slate-600 mt-0.5">30-day rolling performance</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={demoROIData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                background: '#0d1425',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#f1f5f9',
                fontSize: '11px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
              cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
              formatter={(value) => <span style={{ color: '#64748b' }}>{value}</span>}
            />
            <Line type="monotone" dataKey="moreyball" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="balanced"  stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="defensive" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Model leaderboard ───────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Award size={15} className="text-gold-400" />
          <h2 className="text-sm font-semibold text-white">Model Leaderboard</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="px-3 py-3 w-8">#</th>
                <th className="px-3 py-3">Model</th>
                <th className="px-3 py-3 text-right">ROI</th>
                <th className="px-3 py-3 text-right">Win Rate</th>
                <th className="px-3 py-3 text-right">Sharpe</th>
                <th className="px-3 py-3 text-right">Bets</th>
              </tr>
            </thead>
            <tbody>
              {(leaderboard?.data?.length ? leaderboard.data : [
                { model: { name: 'Moreyball' },  roi: 0.12, winRate: 0.56, sharpeRatio: 1.8, totalBets: 142 },
                { model: { name: 'Efficiency' }, roi: 0.09, winRate: 0.54, sharpeRatio: 1.4, totalBets: 98  },
                { model: { name: 'Balanced' },   roi: 0.07, winRate: 0.53, sharpeRatio: 1.2, totalBets: 215 },
                { model: { name: 'Playoff' },    roi: 0.05, winRate: 0.52, sharpeRatio: 1.1, totalBets: 67  },
                { model: { name: 'Defensive' },  roi: 0.03, winRate: 0.52, sharpeRatio: 0.9, totalBets: 83  },
              ]).map((perf: any, i: number) => (
                <tr key={i}>
                  <td className="py-3 px-3">
                    {i === 0 ? (
                      <span className="text-gold-400 font-bold text-xs">1</span>
                    ) : (
                      <span className="text-slate-600 text-xs">{i + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-medium text-white text-xs">{perf.model?.name ?? 'Unknown'}</td>
                  <td className="py-3 px-3 text-right">
                    <span className={`text-xs font-semibold ${perf.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {perf.roi >= 0 ? '+' : ''}{((perf.roi ?? 0) * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-xs text-slate-300 font-mono">{((perf.winRate ?? 0) * 100).toFixed(1)}%</td>
                  <td className="py-3 px-3 text-right text-xs font-mono" style={{ color: '#c084fc' }}>{(perf.sharpeRatio ?? 0).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-xs text-slate-500">{perf.totalBets ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
