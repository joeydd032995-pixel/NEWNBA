import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuthStore } from '../stores/auth'

type Plan = 'FREE' | 'PRO' | 'PREMIUM'

const PLAN_RANK: Record<Plan, number> = { FREE: 0, PRO: 1, PREMIUM: 2 }

interface PlanGateProps {
  requiredPlan: 'PRO' | 'PREMIUM'
  featureName?: string
  children: React.ReactNode
}

export default function PlanGate({ requiredPlan, featureName, children }: PlanGateProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const userPlan = (user?.planType ?? 'FREE') as Plan
  const hasAccess = PLAN_RANK[userPlan] >= PLAN_RANK[requiredPlan]

  if (hasAccess) return <>{children}</>

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-10 max-w-md w-full shadow-card">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700 border border-gold/30 mx-auto mb-6">
          <Lock className="w-7 h-7 text-gold" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">
          {featureName ?? 'This Feature'} Requires {requiredPlan}
        </h2>

        <p className="text-slate-400 text-sm mb-8">
          {requiredPlan === 'PRO'
            ? 'Upgrade to PRO to unlock EV Feed, Arbitrage, Player Props, Live Betting, Parlay Builder, Bankroll, Alerts, and Expert Picks.'
            : 'Upgrade to PREMIUM to unlock Custom Models, Optimization, Ensemble, A/B Testing, and Performance Tracking.'}
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/pricing')}
            className="flex-1 bg-gold hover:bg-amber-500 text-navy-900 font-semibold py-2.5 rounded-lg transition-colors"
          >
            View Pricing
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-navy-700 hover:bg-navy-600 text-slate-300 font-semibold py-2.5 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
