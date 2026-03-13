import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, ArrowLeftRight, Sliders, Activity,
  FlaskConical, GitBranch, TestTube2, Calculator, Bell,
  ShoppingCart, LogOut, Menu, X, Dumbbell, UserCheck, Zap
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/ev-feed', label: 'EV Feed', icon: TrendingUp },
  { to: '/player-props', label: 'Player Props', icon: UserCheck },
  { to: '/arbitrage', label: 'Arbitrage', icon: ArrowLeftRight },
  { to: '/models', label: 'Custom Models', icon: Sliders },
  { to: '/performance', label: 'Performance', icon: Activity },
  { to: '/formulas', label: 'Formulas', icon: Calculator },
  { to: '/optimization', label: 'GA Optimizer', icon: GitBranch },
  { to: '/ensemble', label: 'Ensemble', icon: FlaskConical },
  { to: '/ab-testing', label: 'A/B Testing', icon: TestTube2 },
  { to: '/alerts', label: 'Alerts', icon: Bell },
]

interface LayoutProps { children: React.ReactNode }

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, logout } = useAuthStore()
  const { items, toggleBetSlip } = useBetSlipStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out')
    navigate('/login')
  }

  const initials = (user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-navy-950">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`
          ${sidebarOpen ? 'w-56' : 'w-14'}
          flex flex-col shrink-0 transition-all duration-200
          border-r border-white/[0.06]
          relative overflow-hidden
        `}
        style={{
          background: 'linear-gradient(180deg, #080d1a 0%, #0a1020 60%, #080d1a 100%)',
        }}
      >
        {/* Subtle left-edge gold accent line */}
        <div className="absolute left-0 top-16 bottom-16 w-px bg-gradient-to-b from-transparent via-gold-500/30 to-transparent" />

        {/* Logo / header */}
        <div className="h-14 flex items-center px-3 border-b border-white/[0.06] shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          {sidebarOpen && (
            <div className="ml-2.5 flex items-center gap-2 animate-fade-in">
              <div className="w-6 h-6 rounded-md flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>
                <Dumbbell size={13} className="text-navy-950" />
              </div>
              <div>
                <span className="font-bold text-white text-sm leading-none tracking-tight">NEWNBA</span>
                <span className="block text-2xs text-gold-500/70 tracking-widest uppercase leading-none mt-0.5">Analytics</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 relative group
                ${isActive
                  ? 'nav-link-active'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-gold-400" />
                  )}
                  <Icon
                    size={15}
                    className={`shrink-0 transition-colors duration-150 ${isActive ? 'text-gold-400' : 'text-slate-600 group-hover:text-slate-300'}`}
                  />
                  {sidebarOpen && (
                    <span className="truncate">{label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-2.5 border-t border-white/[0.06] shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 px-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(245,158,11,0.12))', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200 font-medium truncate leading-tight">{user?.email}</p>
                <p className="text-2xs text-slate-600 capitalize tracking-wide">{user?.planType?.toLowerCase() ?? 'free'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors duration-150"
                aria-label="Log out"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-1.5 text-slate-600 hover:text-red-400 transition-colors duration-150"
              aria-label="Log out"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header
          className="h-14 flex items-center justify-between px-5 shrink-0 border-b border-white/[0.05]"
          style={{ background: 'rgba(8,13,26,0.9)', backdropFilter: 'blur(12px)' }}
        >
          <div />

          <div className="flex items-center gap-2.5">
            {/* Bet Slip button */}
            <button
              onClick={toggleBetSlip}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                color: '#fbbf24',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.18)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.4)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.1)'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.25)'
              }}
            >
              <ShoppingCart size={13} />
              <span>Bet Slip</span>
              {items.length > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-2xs flex items-center justify-center font-bold"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#040812' }}
                >
                  {items.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </main>

      {/* ── Bet Slip drawer ────────────────────────────────────────────── */}
      <BetSlipDrawer />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function BetSlipDrawer() {
  const { isOpen, items, removeItem, updateStake, clearAll, potentialReturn, totalStake } = useBetSlipStore()

  if (!isOpen) return null

  return (
    <div
      className="w-72 flex flex-col shrink-0 animate-slide-in border-l border-white/[0.06]"
      style={{ background: 'linear-gradient(180deg, #080d1a 0%, #0a1020 100%)' }}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-gold-400" />
          <span className="font-semibold text-white text-sm">Bet Slip</span>
          {items.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-2xs font-bold"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
            >
              {items.length}
            </span>
          )}
        </div>
        <button
          onClick={clearAll}
          className="text-2xs text-slate-600 hover:text-red-400 transition-colors duration-150 font-medium"
        >
          Clear All
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <ShoppingCart size={24} className="text-slate-700" />
            <p className="text-slate-600 text-xs text-center">No bets added yet</p>
          </div>
        ) : (
          items.map(item => (
            <div
              key={item.id}
              className="rounded-xl p-3 text-sm space-y-2"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white text-xs leading-tight truncate">{item.outcome}</p>
                  <p className="text-slate-600 text-2xs mt-0.5 truncate">{item.eventName}</p>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-slate-700 hover:text-red-400 transition-colors duration-150 shrink-0"
                  aria-label="Remove bet"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm font-mono ${(item.odds ?? 0) > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                  {(item.odds ?? 0) > 0 ? '+' : ''}{item.odds}
                </span>
                <input
                  type="number"
                  value={item.stake}
                  onChange={e => updateStake(item.id, Number(e.target.value))}
                  className="input-field py-1 text-xs flex-1"
                  min={1}
                  aria-label="Stake amount"
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div
          className="p-4 border-t border-white/[0.06] space-y-3"
        >
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total Stake</span>
              <span className="text-slate-200 font-medium">${totalStake().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Potential Return</span>
              <span className="text-green-400 font-semibold">${potentialReturn().toFixed(2)}</span>
            </div>
          </div>
          <button className="btn-primary w-full text-xs py-2.5">
            Place {items.length} Bet{items.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
