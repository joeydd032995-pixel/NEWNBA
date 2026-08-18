import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { useAuthStore } from '../stores/auth'
import { useBetSlipStore } from '../stores/betslip'
import { betslipApi } from '../lib/betslipApi'
import NotificationCenter from './NotificationCenter'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/ev-feed', label: 'EV Feed', icon: 'bolt' },
  { to: '/live', label: 'Live Betting', icon: 'sensors' },
  { to: '/parlay', label: 'Parlay Builder', icon: 'layers' },
  { to: '/bankroll', label: 'Bankroll', icon: 'account_balance_wallet' },
  { to: '/player-props', label: 'Player Props', icon: 'person_search' },
  { to: '/opportunity', label: 'Opportunity', icon: 'query_stats' },
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
      <nav className="fixed top-0 w-full h-14 flex items-center justify-between px-6 z-50 bg-[#0f0906]/80 backdrop-blur-xl shadow-2xl shadow-black/40 border-b border-outline-variant/10">
        <div className="flex items-center gap-8">
          <span className="text-xl font-black text-primary tracking-widest uppercase font-headline">Neon Observatory</span>
          <div className="hidden md:flex gap-6 items-center">
            <NavLink to="/models" className={({ isActive }) => `font-headline font-bold tracking-tight transition-colors text-sm ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>Models</NavLink>
            <NavLink to="/opportunity" className={({ isActive }) => `font-headline font-bold tracking-tight transition-colors text-sm ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>Intelligence</NavLink>
            <NavLink to="/performance" className={({ isActive }) => `font-headline font-bold tracking-tight transition-colors text-sm ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>Analytics</NavLink>
            <NavLink to="/alerts" className={({ isActive }) => `font-headline font-bold tracking-tight transition-colors text-sm ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>Alerts</NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/20">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px' }}>account_balance_wallet</span>
            <span className="text-primary font-bold font-headline text-sm">$2,450.00</span>
          </div>
          <NotificationCenter />
          <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-full transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
          </button>
          <button onClick={toggleBetSlip} className="relative p-2 text-on-surface-variant hover:text-primary hover:bg-white/5 rounded-full transition-all" aria-label="Open tracked bet slip">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>receipt_long</span>
            {items.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">{items.length}</span>}
          </button>
          <div className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden border border-primary/20 flex items-center justify-center text-primary text-sm font-bold font-headline cursor-pointer">{initials}</div>
        </div>
      </nav>

      <aside className="hidden lg:flex flex-col items-center fixed left-0 top-0 h-full w-16 bg-[#0f0906] z-40 pt-16 border-r border-outline-variant/10">
        <div className="pt-4 pb-2"><div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-headline font-bold text-sm cursor-pointer">{initials}</div></div>
        <div className="flex-1 flex flex-col items-center gap-1 py-2 overflow-y-auto no-scrollbar w-full px-1.5">
          {navItems.map(({ to, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center w-12 py-2 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all duration-150 relative ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container-high'}`}>
              {({ isActive }) => <>{isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />}<span className="material-symbols-outlined" style={{ fontSize: '22px', fontVariationSettings: isActive ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : undefined }}>{icon}</span></>}
            </NavLink>
          ))}
        </div>
        <div className="pb-4 flex flex-col items-center gap-2">
          <button className="p-2.5 text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>help</span></button>
          <button onClick={handleLogout} className="p-2.5 text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span></button>
        </div>
      </aside>

      <main className="lg:ml-16 pt-14 min-h-screen"><TrialBanner /><div className="p-6 pb-24 lg:pb-8">{children}</div></main>

      <nav className="lg:hidden fixed bottom-0 left-0 w-full h-20 bg-[#0f0906]/95 backdrop-blur-lg flex justify-around items-center px-4 z-50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-outline-variant/10">
        <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}><span className="material-symbols-outlined" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>grid_view</span><span className="font-body font-bold text-[10px] uppercase tracking-widest">Home</span></NavLink>
        <NavLink to="/ev-feed" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}><span className="material-symbols-outlined" style={{ fontSize: '22px' }}>bolt</span><span className="font-body font-bold text-[10px] uppercase tracking-widest">EV Feed</span></NavLink>
        <button onClick={toggleBetSlip} className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors text-on-surface-variant relative"><span className="material-symbols-outlined" style={{ fontSize: '22px' }}>receipt_long</span><span className="font-body font-bold text-[10px] uppercase tracking-widest">Slip</span>{items.length > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">{items.length}</span>}</button>
        <NavLink to="/bankroll" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}><span className="material-symbols-outlined" style={{ fontSize: '22px' }}>account_balance_wallet</span><span className="font-body font-bold text-[10px] uppercase tracking-widest">Wallet</span></NavLink>
        <NavLink to="/alerts" className={({ isActive }) => `flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant'}`}><span className="material-symbols-outlined" style={{ fontSize: '22px' }}>person</span><span className="font-body font-bold text-[10px] uppercase tracking-widest">Account</span></NavLink>
      </nav>

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
  return <div className="flex items-center justify-between px-6 py-2 bg-primary/10 border-b border-primary/20 text-sm"><span className="text-primary font-body">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial</span><button onClick={() => navigate('/pricing')} className="text-primary font-headline font-bold hover:brightness-110 transition-all">Upgrade now →</button></div>
}

function BetSlipDrawer() {
  const { isOpen, items, removeItem, updateStake, clearAll, potentialReturn, totalStake } = useBetSlipStore()
  const [submitting, setSubmitting] = useState(false)

  const submitTrackedSlip = async () => {
    if (!items.length || submitting) return
    if (items.some((item) => !item.marketId || !item.eventId)) {
      toast.error('Every tracked wager must resolve to a market and event before submission')
      return
    }
    setSubmitting(true)
    try {
      const name = `Tracked wagers ${new Date().toISOString()}`
      await betslipApi.submitTrackedSlip(name, items)
      clearAll()
      toast.success('Wagers persisted to performance tracker')
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? 'Failed to persist tracked wagers')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-14 bottom-0 w-80 bg-surface-container-low border-l border-outline-variant/20 flex flex-col z-40 shadow-2xl animate-slide-in">
      <div className="h-14 flex items-center justify-between px-4 border-b border-outline-variant/10"><span className="font-headline font-bold text-on-surface">Tracked Slip ({items.length})</span><button onClick={clearAll} disabled={submitting} className="text-xs text-on-surface-variant hover:text-error transition-colors disabled:opacity-50">Clear All</button></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-on-surface-variant text-sm gap-2"><span className="material-symbols-outlined opacity-30" style={{ fontSize: '32px' }}>shopping_cart</span>No wagers added yet</div>
        ) : items.map(item => (
          <div key={item.id} className="bg-surface-container-high rounded-xl p-4 border border-outline-variant/20">
            <div className="flex justify-between items-start mb-3">
              <div className="min-w-0 flex-1 mr-2"><p className="font-headline font-bold text-sm text-on-surface truncate">{item.displayOutcome ?? item.outcome}</p><p className="text-on-surface-variant text-xs mt-0.5 truncate">{item.eventName}</p>{(item.bookName || item.recommendedLine !== undefined) && <p className="text-[10px] text-on-surface-variant mt-1">{item.bookName ?? 'Book unresolved'}{item.recommendedLine !== undefined ? ` · line ${item.recommendedLine}` : ''}</p>}</div>
              <button onClick={() => removeItem(item.id)} disabled={submitting} className="text-on-surface-variant hover:text-error transition-colors shrink-0 disabled:opacity-50"><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span></button>
            </div>
            <div className="flex items-center gap-2"><span className={`font-headline font-bold text-sm ${item.odds > 0 ? 'text-secondary' : 'text-on-surface'}`}>{item.odds > 0 ? '+' : ''}{item.odds}</span><input type="number" value={item.stake} onChange={e => updateStake(item.id, Number(e.target.value))} disabled={submitting} className="flex-1 input-field py-1.5 text-sm" min={0} /></div>
            {(item.decisionClass || item.confidenceBucket) && <div className="flex gap-1.5 mt-2 text-[9px] uppercase font-black"><span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{item.decisionClass ?? 'UNCLASSIFIED'}</span><span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">{item.confidenceBucket ?? 'NO CONF'}</span></div>}
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="p-4 border-t border-outline-variant/10">
          <div className="flex justify-between text-sm mb-1.5"><span className="text-on-surface-variant">Recorded Stake</span><span className="text-on-surface font-bold">${totalStake().toFixed(2)}</span></div>
          <div className="flex justify-between text-sm mb-2"><span className="text-on-surface-variant">Legacy combined return</span><span className="text-secondary font-headline font-bold">${potentialReturn().toFixed(2)}</span></div>
          <p className="text-[10px] text-on-surface-variant mb-3">This records wagers for CLV/performance tracking. It does not place an order with a sportsbook.</p>
          <button onClick={submitTrackedSlip} disabled={submitting} className="w-full py-3 bg-primary text-on-primary-container font-headline font-bold rounded-xl hover:brightness-110 transition-all uppercase tracking-wider disabled:opacity-50">{submitting ? 'Saving…' : 'Track Wagers'}</button>
        </div>
      )}
    </div>
  )
}
