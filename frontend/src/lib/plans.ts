export type Plan = 'FREE' | 'PRO' | 'PREMIUM'

export const PLAN_RANK: Record<Plan, number> = { FREE: 0, PRO: 1, PREMIUM: 2 }

export const PLAN_UPGRADE_MESSAGE: Record<'PRO' | 'PREMIUM', string> = {
  PRO: 'Upgrade to PRO to unlock EV Feed, Arbitrage, Player Props, Live Betting, Parlay Builder, Bankroll, Alerts, and Expert Picks.',
  PREMIUM: 'Upgrade to PREMIUM to unlock Custom Models, Optimization, Ensemble, A/B Testing, and Performance Tracking.',
}
