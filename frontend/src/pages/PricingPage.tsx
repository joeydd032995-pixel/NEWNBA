import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/auth'
import { billingApi } from '../lib/api'

const plans = [
  {
    id: 'FREE' as const,
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with core analytics.',
    features: [
      'Dashboard & live scores',
      'NBA stat formulas',
      'Basic game data',
    ],
    highlight: false,
  },
  {
    id: 'PRO' as const,
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'Everything you need to beat the books.',
    features: [
      'EV Feed & positive EV alerts',
      'Arbitrage scanner',
      'Player props',
      'Live betting feed',
      'Parlay builder',
      'Bankroll tracker',
      'Custom alerts',
      'Expert picks',
    ],
    highlight: false,
  },
  {
    id: 'PREMIUM' as const,
    name: 'Premium',
    price: '$79',
    period: '/month',
    description: 'Full quant toolkit for serious bettors.',
    features: [
      'Everything in Pro',
      'Custom model builder',
      'Genetic algorithm optimizer',
      'Ensemble models',
      'A/B testing framework',
      'Performance analytics',
      'Priority support',
    ],
    highlight: true,
  },
]

const redirectToStripe = (url: string) => { window.location.href = url }

export default function PricingPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const checkoutMutation = useMutation({
    mutationFn: (plan: 'PRO' | 'PREMIUM') => billingApi.createCheckout(plan),
    onSuccess: (data) => { if (data.url) redirectToStripe(data.url) },
    onError: () => toast.error('Failed to start checkout. Please try again.'),
  })

  const portalMutation = useMutation({
    mutationFn: () => billingApi.createPortal(),
    onSuccess: (data) => { if (data.url) redirectToStripe(data.url) },
    onError: () => toast.error('Failed to open billing portal.'),
  })

  const handleCta = (planId: 'FREE' | 'PRO' | 'PREMIUM') => {
    if (planId === 'FREE') return
    if (!user) { navigate('/signup'); return }
    checkoutMutation.mutate(planId)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white mb-3">Simple, transparent pricing</h1>
        <p className="text-slate-400">Start free. Upgrade when you're ready to go pro.</p>
        {user?.subscriptionStatus === 'TRIALING' && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm mx-auto">
            You're on a free trial — all Premium features unlocked.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isLoading = checkoutMutation.isPending && checkoutMutation.variables === plan.id
          const isCurrent = user?.planType === plan.id

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.highlight
                  ? 'border-amber-500/50 bg-amber-500/5 shadow-gold-sm'
                  : 'border-slate-700 bg-navy-800'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 text-navy-900 text-xs font-bold rounded-full">
                  MOST POPULAR
                </span>
              )}

              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-slate-400 text-sm">{plan.period}</span>
                </div>
                <p className="mt-2 text-slate-400 text-sm">{plan.description}</p>
              </div>

              <ul className="flex-1 space-y-2 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-center py-2 rounded-lg border border-slate-600 text-slate-400 text-sm">
                  Current plan
                </div>
              ) : plan.id === 'FREE' ? (
                <div className="text-center py-2 rounded-lg border border-slate-700 text-slate-500 text-sm">
                  Free forever
                </div>
              ) : (
                <button
                  onClick={() => handleCta(plan.id)}
                  disabled={isLoading}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? 'bg-amber-500 hover:bg-amber-400 text-navy-900 disabled:opacity-60'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-60'
                  }`}
                >
                  {isLoading ? 'Redirecting…' : plan.id === 'PRO' ? 'Upgrade to Pro' : 'Upgrade to Premium'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {user?.subscriptionId && (
        <div className="mt-10 text-center">
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="text-sm text-slate-400 underline hover:text-white transition-colors"
          >
            {portalMutation.isPending ? 'Opening portal…' : 'Manage or cancel subscription →'}
          </button>
        </div>
      )}
    </div>
  )
}
