import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { useAuthStore } from '../stores/auth'
import { useBetSlipStore } from '../stores/betslip'
import NotificationCenter from './NotificationCenter'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/ev-feed', label: 'EV Feed', icon: 'bolt' },
  { to: '/live', label: 'Live Betting', icon: 'sensors' },
  { to: '/parlay', label: 'Parlay Builder', icon: 'layers' },
  { to: '/bankroll', label: 'Bankroll', icon: 'account_balance_wallet' },
  { to: '/player-props', label: 'Player Props', icon: 'person_search' },
  { to: '/expert-picks', label: 'Expert Picks', icon: 'star' },
  { to: '/arbitrage', label: 'Arbitrage', icon: 'balance' },
  { to: '/models', label: 'Custom Models', icon: 'architecture' },
  { to: '/performance', label: 'Performance', icon: 'show_chart' },
  { to: '/formulas', label: 'Formulas', icon: 'calculate' },
  { to: '/optimization', label: 'GA Optimizer', icon: 'genetics' },
  { to: '/ensemble', label: 'Ensemble', icon: 'merge' },
  { to: '/ab-testing', label: 'A/B Testing', icon: 'science' },
  { to: '/alerts', label: 'Alerts', icon: 'notifications_active' },
]

interface LayoutProps { children: React.ReactNode }

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore()
  const { items, toggleBetSlip } = useBetSlipStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out')
    navigate('/login')
  }

  const initials = user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen">
      {/* Top Nav */}
      <nav className="fixed top-0 w-full h-16 flex items-center justify-between px-6 z-50 bg-[#0c0e10]/60 backdrop-blur-xl shadow-2xl shadow-black/40 border-b border-outline-variant/10">
        <div className="flex items-center gap-8">
          <span className="text-2xl font-black text-purple-400 tracking-tighter font-headline">NEWNBA</span>
          <div className="hidden md:flex gap-6 items-center">
            <span className="font-headline font-bold tracking-tight text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer text-sm">Models</span>
            <span className="font-headline font-bold tracking-tight text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer text-sm">Analytics</span>
            <span className="font-headline font-bold tracking-tight text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer text-sm">Alerts</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-outline-variant/20">
            <span className="text-primary font-bold font-headline text-sm">$2,450.00</span>
          </div>
          <NotificationCenter />
          <button
            onClick={toggleBetSlip}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-outline-variant/20 text-on-surface-variant hover:text-on-surface transition-colors text-sm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shopping_cart</span>
            {items.length > 0 && (
              <span className="w-5 h-5 bg-primary text-on-primary-container rounded-full text-xs flex items-center justify-center font-bold">
                {items.length}
              </span>
            )}
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden border border-primary/20 flex items-center justify-center text-primary text-sm font-bold font-headline cursor-pointer">
            {initials}
          </div>
        </div>
      </nav>

      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-64 bg-[#111416] z-40 pt-16 border-r border-outline-variant/10">
        {/* User card */}
        <div className="px-4 pt-4 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/50">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-headline font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-headline font-bold text-sm truncate text-on-surface">{user?.email}</p>
              <p className="text-xs text-on-surface-variant capitalize">{user?.planType?.toLowerCase()} plan</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-purple-500/10 text-purple-400 font-bold border-r-4 border-purple-500'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
              <span className="font-medium truncate">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-auto px-4 pt-4 border-t border-outline-variant/10 pb-6 space-y-3">
          <button className="w-full py-2.5 bg-primary text-on-primary-container font-headline font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm">
            Upgrade Plan
          </button>
          <div className="space-y-0.5">
            <button className="flex items-center gap-3 px-4 py-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors w-full text-sm">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>help</span>
              <span>Support</span>
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors w-full text-sm">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 pt-16 min-h-screen">
        <TrialBanner />
        <div className="p-6 pb-24 lg:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full h-20 bg-[#111416]/95 backdrop-blur-lg flex justify-around items-center px-4 z-50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-outline-variant/10">
        <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-purple-400' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>dashboard</span>
          <span className="font-body font-bold text-[10px] uppercase tracking-widest">Home</span>
        </NavLink>
        <NavLink to="/ev-feed" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-purple-400' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>bolt</span>
          <span className="font-body font-bold text-[10px] uppercase tracking-widest">EV Feed</span>
        </NavLink>
        <NavLink to="/expert-picks" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-purple-400 bg-purple-500/10' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>star</span>
          <span className="font-body font-bold text-[10px] uppercase tracking-widest">Experts</span>
        </NavLink>
        <NavLink to="/bankroll" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-purple-400' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>account_balance_wallet</span>
          <span className="font-body font-bold text-[10px] uppercase tracking-widest">Wallet</span>
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-purple-400' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>person</span>
          <span className="font-body font-bold text-[10px] uppercase tracking-widest">Account</span>
        </NavLink>
      </nav>

      {/* Bet Slip Drawer */}
      <BetSlipDrawer />
    </div>
  )
}

function TrialBanner() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const daysLeft = useMemo(() => {
    if (user?.subscriptionStatus !== 'TRIALING' || !user.trialEndsAt) return null
    const msLeft = new Date(user.trialEndsAt).getTime() - Date.now()
    if (msLeft <= 0) return null
    return Math.ceil(msLeft / (1000 * 60 * 60 * 24))
  }, [user?.subscriptionStatus, user?.trialEndsAt])

  if (daysLeft === null) return null

  return (
    <div className="flex items-center justify-between px-6 py-2 bg-primary/10 border-b border-primary/20 text-sm">
      <span className="text-primary font-body">
        {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial
      </span>
      <button onClick={() => navigate('/pricing')} className="text-primary font-headline font-bold hover:brightness-110 transition-all">
        Upgrade now →
      </button>
    </div>
  )
}

function BetSlipDrawer() {
  const { isOpen, items, removeItem, updateStake, clearAll, potentialReturn, totalStake } = useBetSlipStore()

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-16 bottom-0 w-80 bg-surface-container-low border-l border-outline-variant/10 flex flex-col z-40 shadow-2xl animate-slide-in">
      <div className="h-14 flex items-center justify-between px-4 border-b border-outline-variant/10">
        <span className="font-headline font-bold text-on-surface">Bet Slip ({items.length})</span>
        <button onClick={clearAll} className="text-xs text-on-surface-variant hover:text-error transition-colors">Clear All</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-on-surface-variant text-sm gap-2">
            <span className="material-symbols-outlined opacity-30" style={{ fontSize: '32px' }}>shopping_cart</span>
            No bets added yet
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-surface-container-high rounded-xl p-4 border border-outline-variant/10">
              <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="font-headline font-bold text-sm text-on-surface truncate">{item.outcome}</p>
                  <p className="text-on-surface-variant text-xs mt-0.5 truncate">{item.eventName}</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-on-surface-variant hover:text-error transition-colors shrink-0">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-headline font-bold text-sm ${item.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>
                  {item.odds > 0 ? '+' : ''}{item.odds}
                </span>
                <input
                  type="number"
                  value={item.stake}
                  onChange={e => updateStake(item.id, Number(e.target.value))}
                  className="flex-1 input-field py-1.5 text-sm"
                  min={1}
                />
              </div>
            </div>
          ))
        )}
      </div>
      {items.length > 0 && (
        <div className="p-4 border-t border-outline-variant/10">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-on-surface-variant">Total Stake</span>
            <span className="text-on-surface font-bold">${totalStake().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span className="text-on-surface-variant">Potential Return</span>
            <span className="text-secondary font-headline font-bold">${potentialReturn().toFixed(2)}</span>
          </div>
          <button className="w-full py-3 bg-primary text-on-primary-container font-headline font-bold rounded-xl hover:brightness-110 transition-all">
            Place Bets
          </button>
        </div>
      )}
    </div>
  )
}
