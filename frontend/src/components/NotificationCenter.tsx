import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, X, CheckCheck, TrendingUp, AlertTriangle, Activity, Zap, Users, ChevronRight } from 'lucide-react'
import { notificationsApi } from '../lib/api'
import toast from 'react-hot-toast'

const TYPE_META: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  EV_THRESHOLD:   { icon: TrendingUp,   color: 'text-green-400',  label: 'EV Alert' },
  ARBITRAGE:      { icon: Zap,          color: 'text-blue-400',   label: 'Arbitrage' },
  LINE_MOVEMENT:  { icon: Activity,     color: 'text-yellow-400', label: 'Line Move' },
  INJURY:         { icon: AlertTriangle,color: 'text-red-400',    label: 'Injury' },
  CONTRARIAN:     { icon: Users,        color: 'text-purple-400', label: 'Contrarian' },
  CUSTOM:         { icon: Bell,         color: 'text-slate-400',  label: 'Alert' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  // Poll unread count every 30s
  const { data: countData } = useQuery({
    queryKey: ['notification-count'],
    queryFn: () => notificationsApi.getCount().then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: notifs, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll().then(r => r.data),
    enabled: open,
    staleTime: 15_000,
  })

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: (res) => {
      toast.success(`Cleared ${res.data.marked} notification(s)`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unreadCount: number = countData?.count ?? 0
  const notifList: any[] = Array.isArray(notifs) ? notifs : []

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-dark-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-slate-400" />
              <span className="font-semibold text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-primary-600/30 text-primary-400 text-xs rounded-full">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                  title="Mark all read"
                >
                  <CheckCheck size={13} />
                  All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
            ) : notifList.length === 0 ? (
              <div className="p-6 text-center">
                <Bell size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No notifications yet</p>
                <p className="text-slate-600 text-xs mt-1">Create alerts to get notified on opportunities</p>
              </div>
            ) : (
              notifList.map(n => {
                const meta = TYPE_META[n.type] ?? TYPE_META.CUSTOM
                const Icon = meta.icon
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer ${
                      !n.isRead ? 'bg-primary-600/5' : ''
                    }`}
                    onClick={() => !n.isRead && markReadMut.mutate(n.id)}
                  >
                    <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${n.isRead ? 'text-slate-300' : 'text-white'}`}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                        <span className="text-xs text-slate-600">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifList.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800 flex justify-end">
              <a href="/alerts" className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                Manage alerts <ChevronRight size={12} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
