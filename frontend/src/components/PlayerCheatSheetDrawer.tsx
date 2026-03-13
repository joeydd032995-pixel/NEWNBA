import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from 'recharts'
import { X, AlertTriangle, Newspaper, TrendingUp } from 'lucide-react'
import { playerPropsApi } from '../lib/api'

interface Props {
  isOpen: boolean
  onClose: () => void
  playerId: string
  playerName: string
  statType: string
  line: number
}

interface Split {
  hits: number
  total: number
  rate: number | null
}

interface CheatSheetData {
  player: { id: string; name: string; position: string; team: string; teamName: string }
  injury: { status: string; description: string | null; reportedAt: string } | null
  news: Array<{ id: string; headline: string; summary: string | null; url: string | null; publishedAt: string }>
  trend: Array<{
    gameDate: string
    matchup: string
    isHome: boolean
    isB2B: boolean
    statValue: number
    hitOver: boolean
    opponentTeamAbbr: string
    defRankTier: 'easy' | 'medium' | 'hard'
  }>
  splits: {
    home: Split; away: Split
    b2b: Split; rest: Split
    vsEasyDef: Split; vsMedDef: Split; vsHardDef: Split
  }
  seasonAvg: number
  line: number
  statType: string
}

function splitColor(rate: number | null): string {
  if (rate === null) return 'bg-slate-700 text-slate-400'
  if (rate >= 65) return 'bg-green-900/60 text-green-300 border border-green-700'
  if (rate >= 50) return 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
  return 'bg-red-900/60 text-red-300 border border-red-700'
}

function injuryBadgeColor(status: string): string {
  switch (status) {
    case 'OUT':        return 'bg-red-900 border-red-600 text-red-200'
    case 'DOUBTFUL':   return 'bg-red-800 border-red-500 text-red-200'
    case 'GTD':        return 'bg-orange-900 border-orange-600 text-orange-200'
    case 'QUESTIONABLE': return 'bg-yellow-900 border-yellow-600 text-yellow-200'
    case 'PROBABLE':   return 'bg-green-900 border-green-600 text-green-200'
    default:           return 'bg-slate-700 border-slate-500 text-slate-300'
  }
}

function SplitTile({ label, split }: { label: string; split: Split }) {
  return (
    <div className={`rounded-lg p-3 text-center ${splitColor(split.rate)}`}>
      <div className="text-xs font-medium opacity-75 mb-1">{label}</div>
      {split.total === 0 ? (
        <div className="text-lg font-bold opacity-50">—</div>
      ) : (
        <>
          <div className="text-lg font-bold">
            {split.rate !== null ? `${split.rate}%` : '—'}
          </div>
          <div className="text-xs opacity-60">
            {split.hits}/{split.total} games
          </div>
        </>
      )}
    </div>
  )
}

// Custom dot for the trend chart: green = hit, red = miss
function CustomDot(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={payload.hitOver ? '#22c55e' : '#ef4444'}
      stroke={payload.isB2B ? '#f59e0b' : 'transparent'}
      strokeWidth={payload.isB2B ? 2 : 0}
    />
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-800 border border-slate-600 rounded p-2 text-xs">
      <div className="font-semibold text-white">{d.matchup}</div>
      <div className="text-slate-300">{d.gameDate}</div>
      <div className={d.hitOver ? 'text-green-400' : 'text-red-400'}>
        {d.statValue} {d.hitOver ? '✓ Over' : '✗ Under'}
      </div>
      {d.isB2B && <div className="text-yellow-400">Back-to-Back</div>}
      <div className="text-slate-400 capitalize">vs {d.defRankTier} def</div>
    </div>
  )
}

export function PlayerCheatSheetDrawer({
  isOpen,
  onClose,
  playerId,
  playerName,
  statType,
  line,
}: Props) {
  const { data, isLoading } = useQuery<CheatSheetData>({
    queryKey: ['cheat-sheet', playerId, statType, line],
    queryFn: async () => {
      const res = await playerPropsApi.getCheatSheet(playerId, statType, line)
      return res.data
    },
    enabled: isOpen && !!playerId,
    staleTime: 5 * 60 * 1000,
  })

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!isOpen) return null

  // Reverse trend so chart shows oldest → newest (left → right)
  const chartData = data ? [...data.trend].reverse() : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{playerName}</h2>
            {data && (
              <div className="text-sm text-slate-400">
                {data.player.position} · {data.player.teamName} · Line: {line} {statType}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-slate-400">
              Loading cheat sheet…
            </div>
          )}

          {data && (
            <>
              {/* Injury banner */}
              {data.injury && (
                <div className={`rounded-lg border p-3 flex gap-3 items-start ${injuryBadgeColor(data.injury.status)}`}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm">
                      {data.injury.status.replace('_', ' ')}
                    </div>
                    {data.injury.description && (
                      <div className="text-xs opacity-80 mt-0.5">{data.injury.description}</div>
                    )}
                  </div>
                </div>
              )}

              {/* News items */}
              {data.news.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <Newspaper className="h-3 w-3" />
                    Recent News
                  </div>
                  {data.news.map((item) => (
                    <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="text-sm font-medium text-white leading-snug">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="hover:text-blue-400 transition-colors">
                            {item.headline}
                          </a>
                        ) : item.headline}
                      </div>
                      {item.summary && (
                        <div className="text-xs text-slate-400 mt-1 line-clamp-2">{item.summary}</div>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Trend chart */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  <TrendingUp className="h-3 w-3" />
                  Last {data.trend.length} Games — Season avg: {data.seasonAvg}
                </div>
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  {chartData.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm py-6">No game data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="matchup"
                          tick={{ fontSize: 9, fill: '#94a3b8' }}
                          interval={Math.floor(chartData.length / 5)}
                        />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine
                          y={line}
                          stroke="#f59e0b"
                          strokeDasharray="4 4"
                          label={{ value: line, position: 'right', fill: '#f59e0b', fontSize: 10 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="statValue"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={<CustomDot />}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  <div className="flex gap-4 justify-center mt-2 text-xs text-slate-500">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Over</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Under</span>
                    <span><span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-500 mr-1" />B2B</span>
                  </div>
                </div>
              </div>

              {/* Splits grid */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Situational Splits (Last {data.trend.length} Games)
                </div>

                {/* Home / Away / B2B / Rest */}
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <SplitTile label="Home"  split={data.splits.home} />
                  <SplitTile label="Away"  split={data.splits.away} />
                  <SplitTile label="B2B"   split={data.splits.b2b} />
                  <SplitTile label="Rest"  split={data.splits.rest} />
                </div>

                {/* Defense tier splits */}
                <div className="grid grid-cols-3 gap-2">
                  <SplitTile label="vs Easy Def"   split={data.splits.vsEasyDef} />
                  <SplitTile label="vs Med Def"    split={data.splits.vsMedDef} />
                  <SplitTile label="vs Hard Def"   split={data.splits.vsHardDef} />
                </div>

                <div className="text-xs text-slate-500 mt-2 text-center">
                  Defense tiers based on avg {statType.toLowerCase()} allowed this season
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
