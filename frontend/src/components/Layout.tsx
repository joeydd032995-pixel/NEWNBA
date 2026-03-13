import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, ArrowLeftRight, Sliders, Activity,
  FlaskConical, GitBranch, TestTube2, Calculator, Bell,
  ShoppingCart, LogOut, ChevronRight, Menu, X, Dumbbell, UserCheck, Users
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { useBetSlipStore } from '../stores/betslip'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/ev-feed', label: 'EV Feed', icon: TrendingUp },
  { to: '/player-props', label: 'Player Props', icon: UserCheck },
  { to: '/expert-picks', label: 'Expert Picks', icon: Users },
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-dark-900 border-r border-slate-800 flex flex-col transition-all duration-200 shrink-0`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-slate-800">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 text-slate-400 hover:text-white">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {sidebarOpen && (
            <div className="ml-2 flex items-center gap-2">
              <Dumbbell size={20} className="text-primary-500" />
              <span className="font-bold text-white text-sm">NBA Analytics</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-600/30 flex items-center justify-center text-primary-400 text-xs font-bold">
                {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{user?.email}</p>
                <p className="text-xs text-slate-500 capitalize">{user?.planType?.toLowerCase()}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-red-400">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center text-slate-500 hover:text-red-400">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-dark-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <button
              onClick={toggleBetSlip}
              className="relative flex items-center gap-2 px-3 py-1.5 bg-primary-600/20 border border-primary-500/30 text-primary-400 rounded-lg text-sm hover:bg-primary-600/30 transition-colors"
            >
              <ShoppingCart size={15} />
              <span>Bet Slip</span>
              {items.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary-600 rounded-full text-white text-xs flex items-center justify-center">
                  {items.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </main>

      {/* Betslip drawer */}
      <BetSlipDrawer />
    </div>
  )
}

function BetSlipDrawer() {
  const { isOpen, items, removeItem, updateStake, clearAll, potentialReturn, totalStake } = useBetSlipStore()

  if (!isOpen) return null

  return (
    <div className="w-72 bg-dark-900 border-l border-slate-800 flex flex-col shrink-0">
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
        <span className="font-semibold text-white">Bet Slip ({items.length})</span>
        <button onClick={clearAll} className="text-xs text-slate-500 hover:text-red-400">Clear All</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-slate-500 text-sm text-center mt-8">No bets added yet</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="card p-3 text-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-white">{item.outcome}</p>
                  <p className="text-slate-500 text-xs">{item.eventName}</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-slate-500 hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${item.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                  {item.odds > 0 ? '+' : ''}{item.odds}
                </span>
                <input
                  type="number"
                  value={item.stake}
                  onChange={e => updateStake(item.id, Number(e.target.value))}
                  className="flex-1 input-field py-1 text-sm"
                  min={1}
                />
              </div>
            </div>
          ))
        )}
      </div>
      {items.length > 0 && (
        <div className="p-4 border-t border-slate-800">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">Total Stake</span>
            <span className="text-white">${totalStake().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-slate-400">Potential Return</span>
            <span className="text-green-400">${potentialReturn().toFixed(2)}</span>
          </div>
          <button className="btn-primary w-full">Place Bets</button>
        </div>
      )}
    </div>
  )
}
