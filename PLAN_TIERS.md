# NEWNBA Feature Tiers

This document defines which features belong to each subscription plan.

| Plan | Price | Features |
|---|---|---|
| **FREE** | $0/mo | Dashboard, Formulas |
| **PRO** | $29/mo | Everything in FREE + EV Feed, Arbitrage, Player Props, Expert Picks, Live Betting, Parlay Builder, Bankroll, Alerts |
| **PREMIUM** | $79/mo | Everything in PRO + Custom Models, Optimization, Ensemble, A/B Testing, Performance |

## Page → Tier Mapping

| Page | Route | Required Tier |
|---|---|---|
| Dashboard | `/` | FREE |
| Formulas | `/formulas` | FREE |
| EV Feed | `/ev-feed` | PRO |
| Arbitrage | `/arbitrage` | PRO |
| Player Props | `/player-props` | PRO |
| Expert Picks | `/expert-picks` | PRO |
| Live Betting | `/live` | PRO |
| Parlay Builder | `/parlay` | PRO |
| Bankroll | `/bankroll` | PRO |
| Alerts | `/alerts` | PRO |
| Custom Models | `/models` | PREMIUM |
| Optimization | `/optimization` | PREMIUM |
| Ensemble | `/ensemble` | PREMIUM |
| A/B Testing | `/ab-testing` | PREMIUM |
| Performance | `/performance` | PREMIUM |

## Trial

All new signups receive a **14-day free trial** of PREMIUM (all features unlocked).
After trial expiry with no active subscription, the account reverts to FREE.
