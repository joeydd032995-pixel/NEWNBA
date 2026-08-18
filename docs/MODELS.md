# NEWNBA Opportunity-First Models

This document is the mathematical contract for the Opportunity-First NBA betting system. Code is authoritative only when it matches these equations and the associated tests.

## 1. Core Player-Prop Equation

Every player-stat projection begins with playing time, then opportunity, then conversion:

```text
Expected Production
= Expected Minutes
× Opportunity Rate
× Conversion Rate
× Context Adjustment
× Pace Adjustment
× PPP Adjustment
```

Implementation: `backend/src/modules/projection/opportunity-projection.engine.ts`.

### Minutes

Minutes are represented as a distribution, not a single deterministic number:

- floor
- median
- ceiling
- standard deviation

`rotation.engine.ts` derives these from recent minutes and current role, then applies explicit role, injury/restriction, back-to-back and spread-environment adjustments. A prop model must never substitute season-average minutes when the current role has changed.

### Opportunity rate

Preferred inputs are event-generating opportunities, such as:

- scoring: `(FGA + 0.44 × FTA) / minute`
- rebounds: rebound chances / minute
- assists: potential assists / minute
- threes: 3PA / minute
- turnovers: touches / minute with turnover conversion
- steals/blocks: event rate / minute until a richer opportunity feed is available

When expected possessions and player opportunity share are supplied:

```text
Opportunity Rate per Minute
= Expected Possessions × Player Opportunity Share / Expected Minutes
```

The projection output records whether `PER_MINUTE` or `POSSESSION_SHARE` was used.

### Conversion rate

Conversion is separated from opportunity so short-term outcome variance does not masquerade as sustainable volume. Examples:

```text
Points conversion = Points / (FGA + 0.44 × FTA)
Assist conversion = Assists / Potential Assists
Rebound conversion = Rebounds / Rebound Chances
Three conversion = 3PM / 3PA
Turnover conversion = Turnovers / Touches
```

## 2. Pace and Matchup PPP

```text
Pace Adjustment = Expected Pace / Baseline Pace
PPP Adjustment = Expected PPP / Baseline PPP
```

Both are bounded to prevent a single noisy contextual estimate from dominating the projection. Missing inputs produce a neutral multiplier of `1.0`; the system does not invent a number.

## 3. Simulation Modes

Default Monte-Carlo trial counts:

| Mode | Trials | Intended use |
|---|---:|---|
| FAST | 2,500 | slate screening |
| STANDARD | 10,000 | default analysis |
| DEEP | 40,000 | high-confidence/complex analysis |

All simulations require a seed. Equal inputs + equal seed must produce identical samples.

## 4. Game Scripts

The simulation supports four explicit scripts:

1. `COMPETITIVE`
2. `FAVORITE_CONTROL`
3. `UNDERDOG_LEADS`
4. `DISRUPTION`

Each script can alter minutes, opportunity, conversion and context. The live player-prop assembler currently uses a transparent spread-derived blowout proxy when a verified spread exists. This proxy is model inference, not source data, and must be recalibrated against historical fourth-quarter starter-minute loss before being considered a final production calibration.

## 5. Distribution Outputs

Every projection exposes:

- mean
- median
- standard deviation
- p05 / p10 / p25 / p50 / p75 / p90 / p95
- full simulation samples internally
- uncertainty decomposition for minutes, opportunity, conversion, context and pace

Pricing uses threshold probability from the distribution, not mean projection alone.

## 6. Combination Props

PRA / PR / PA / RA are not season-average sums. Each component is projected independently, then recombined with an empirical correlation matrix from aligned player game logs.

Implementation: `correlation.engine.ts`.

The system uses a Gaussian copula to impose empirical correlation while preserving the independently simulated marginal distributions. If a usable historical matrix is unavailable, the system falls back to an identity matrix and the associated data quality must remain reduced.

## 7. Stocks, Double-Doubles and Triple-Doubles

Stocks are a correlated Steals + Blocks distribution.

Double-/triple-double markets are modeled as joint threshold events:

```text
Double-double = P(at least 2 stat categories >= 10)
Triple-double = P(at least 3 stat categories >= 10)
```

The milestone engine simulates correlated Points, Rebounds, Assists, Steals and Blocks. It does not recommend milestones because a player merely "gets close often."

## 8. Market Probability and Vig

American odds are converted to raw implied probability. For two-way markets:

```text
No-vig P(A) = rawP(A) / (rawP(A) + rawP(B))
No-vig P(B) = rawP(B) / (rawP(A) + rawP(B))
```

Model disagreement is measured against the no-vig probability when both sides are present.

## 9. Expected Value

```text
EV per unit = Estimated Probability × Decimal Odds - 1
```

Historical hit rate is never accepted as the source of `Estimated Probability` in the player-prop feed. Hit rates remain contextual display/screening data only.

## 10. Decision Gate

The unified decision engine emits:

- PASS
- WAIT
- LEAN
- BET
- STRONG_BET

It separately emits the news decision:

- BET_NOW
- WAIT
- PASS

The decision compares probability edge and EV against a data-quality-dependent uncertainty margin. LOW-quality data must clear a larger margin than HIGH-quality data. Unresolved availability, lineup or minute restrictions prevent STRONG BET classification and normally force WAIT/PASS.

## 11. Playable-To Price and Line

For threshold props, the engine walks half-point line changes until the wager no longer meets the configured minimum EV. Price cutoffs are calculated from the model probability and required minimum EV rather than hardcoded juice limits.

## 12. CLV

Implementation: `backend/src/modules/analytics/clv.ts`.

Price CLV:

```text
Price CLV = Recommended Decimal Odds / Closing Decimal Odds - 1
```

Line CLV is normalized so positive is favorable:

- Over: `closing line - recommended line`
- Under: `recommended line - closing line`
- selected-side signed spread: `recommended line - closing line`

No generic line CLV is invented for Yes/No markets.

## 13. Source Hierarchy and Information Decay

Implementation: `source-quality.engine.ts`.

Order:

1. TIER_1_OFFICIAL
2. TIER_2_HIGH_QUALITY
3. TIER_3_REPORTING
4. LOW_PRIORITY
5. SIMULATED

`SIMULATED` is never eligible as real evidence.

Availability data decays rapidly. Older or lower-tier information regresses toward uncertainty rather than retaining stale confidence. Recent credible source conflicts lower the data-quality classification.

## 14. Rotation Minutes

Implementation: `rotation.engine.ts`.

Conceptually:

```text
Projected Minutes
= Base Rotation Minutes
+ Role Adjustment
+ Injury/Restriction Adjustment
+ Game Environment Adjustment
```

The result is always a distribution. Coach volatility and unknown-role state increase uncertainty.

## 15. Injury Replacement

Implementation: `injury-replacement.engine.ts`.

Missing-player role components are redistributed independently:

- minutes
- usage possessions
- ball-handling touches
- rebound chances
- FGA
- 3PA
- defensive impact

A replacement player can inherit minutes without inheriting the same percentage of creation or rebounding responsibility.

## 16. Environment

Implementation: `environment.engine.ts`.

The pure environment model calculates:

- rest hours
- back-to-back
- 3-in-4
- 4-in-6
- travel distance (Haversine)
- time-zone change
- venue altitude
- prior-game overtime load
- prior-game minutes load
- rest advantage

Venue/location facts must come from a verified data source; the calculator itself does not invent geography.

## 17. Referee Context

Implementation: `referee.engine.ts`.

Confirmed referee samples can produce foul, FT, pace and interruption rates. Effects are shrunk by sample reliability:

```text
Reliability = min(1, sqrt(games / 50))
```

Referee data is supplementary and must never become a primary handicap without adequate sample size and plausible basketball mechanism.

## 18. Anti-Bias and Duplicate Evidence

Implementation: `bias-control.engine.ts`.

Evidence can be assigned a `correlatedGroup`. Multiple metrics describing the same underlying shooting-efficiency signal count as one independent confirmation. The engine flags excessive dependence on:

- recent results
- historical hit rate
- narrative
- a single evidence category

A separate consistency detector flags contradictory wagers sharing the same thesis.

## 19. Post-Bet Attribution

Implementation: `post-bet-attribution.ts`.

Observed errors are classified before variance:

- minutes projection
- usage projection
- pace
- market timing
- foul trouble
- blowout
- in-game injury

Missing pregame inputs remain `unavailable`; they are not silently marked correct. Outcome alone never causes a loss to be labeled variance.

## 20. Model Integrity Rules

- No hard-coded season defaults.
- No synthetic odds or public-betting splits in market evidence.
- No hit-rate-to-true-probability substitution.
- No recommendation without an exact line and price.
- No projection may be reported as verified fact.
- Missing structural data lowers quality; it does not trigger made-up replacements.
- Any future formula change requires a deterministic unit test and this document must be updated.
