import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, ArrowLeftRight, Sliders, Activity,
  FlaskConical, GitBranch, TestTube2, Calculator, Bell,
  ShoppingCart, LogOut, ChevronRight, Menu, X, Dumbbell, UserCheck, Users, Radio, Layers, Wallet
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../stores/auth'
import { useBetSlipStore } from '../stores/betslip'
import NotificationCenter from './NotificationCenter'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/ev-feed', label: 'EV Feed', icon: TrendingUp },
  { to: '/live', label: 'Live Betting', icon: Radio },
  { to: '/parlay', label: 'Parlay Builder', icon: Layers },
  { to: '/bankroll', label: 'Bankroll', icon: Wallet },
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
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-dark-900 border-r border-dark-600 flex flex-col transition-all duration-200 shrink-0`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-dark-600">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 text-dark-200 hover:text-white">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {sidebarOpen && (
            <div className="ml-2 flex items-center gap-2">
              <Dumbbell size={20} className="text-neon-blue-500" style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.7))' }} />
              <span className="font-bold text-white text-sm tracking-wide">NBA Analytics</span>
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
                `flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'nav-link-active'
                    : 'text-dark-200 hover:text-white hover:bg-dark-600'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-dark-600">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-neon-purple-500/20 border border-neon-purple-500/30 flex items-center justify-center text-neon-purple-400 text-xs font-bold"
                style={{ boxShadow: '0 0 8px rgba(191,0,255,0.3)' }}>
                {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{user?.email}</p>
                <p className="text-xs text-dark-200 capitalize">{user?.planType?.toLowerCase()}</p>
              </div>
              <button onClick={handleLogout} className="text-dark-300 hover:text-neon-red-400 transition-colors">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center text-dark-300 hover:text-neon-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-dark-900 border-b border-dark-600 flex items-center justify-between px-4 shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <NotificationCenter />
            <button
              onClick={toggleBetSlip}
              className="relative flex items-center gap-2 px-3 py-1.5 bg-neon-blue-500/10 border border-neon-blue-500/30 text-neon-blue-400 rounded-lg text-sm hover:bg-neon-blue-500/20 hover:border-neon-blue-500/50 transition-all duration-150"
              style={{ boxShadow: '0 0 8px rgba(0,212,255,0.1)' }}
            >
              <ShoppingCart size={15} />
              <span>Bet Slip</span>
              {items.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-neon-blue-500 rounded-full text-black text-xs flex items-center justify-center font-bold"
                  style={{ boxShadow: '0 0 6px rgba(0,212,255,0.7)' }}>
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
    <div className="w-72 bg-dark-900 border-l border-dark-600 flex flex-col shrink-0">
      <div className="h-14 flex items-center justify-between px-4 border-b border-dark-600">
        <span className="font-semibold text-white">Bet Slip ({items.length})</span>
        <button onClick={clearAll} className="text-xs text-dark-200 hover:text-neon-red-400 transition-colors">Clear All</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-dark-300 text-sm text-center mt-8">No bets added yet</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="card p-3 text-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-white">{item.outcome}</p>
                  <p className="text-dark-300 text-xs">{item.eventName}</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-dark-300 hover:text-neon-red-400 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${item.odds > 0 ? 'text-neon-green-400' : 'text-dark-100'}`}
                  style={item.odds > 0 ? { textShadow: '0 0 8px rgba(57,255,20,0.6)' } : {}}>
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
        <div className="p-4 border-t border-dark-600">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-dark-200">Total Stake</span>
            <span className="text-white">${totalStake().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-dark-200">Potential Return</span>
            <span className="text-neon-green-400" style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>${potentialReturn().toFixed(2)}</span>
          </div>
          <button className="btn-primary w-full">Place Bets</button>
        </div>
      )}
    </div>
  )
}
