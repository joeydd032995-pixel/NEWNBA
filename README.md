# NEWNBA — Opportunity-First NBA Betting Intelligence

NEWNBA is a full-stack NBA betting analytics platform built around one governing rule:

> **Price a wager from current minutes, role, opportunity, market price, source quality, and uncertainty before looking at recent outcomes.**

The platform combines verified sportsbook markets, official NBA data adapters, deterministic probabilistic projections, expected value, arbitrage detection, model optimization, empirical same-game correlation, tracked wagers, closing-line value, settlement, and post-bet attribution in a React/Vite + NestJS/Prisma + Python FastAPI monorepo.

> **Production documentation snapshot:** August 18, 2026. This README documents the repository state after the 194-commit change set from `63e2cfe46cf8026e272ccd5790dbbdcfa70f7f45` (`feat: prepare for hybrid Vercel + Railway hosting`) through merged `main` commit `5c81ee70bf13a1c457049c01481222b425fceb9d` (PR #46, Opportunity-First priority hardening II). Provider prices below were checked on August 18, 2026 and can change.

---

## Table of contents

- [Core model and integrity rules](#core-model-and-integrity-rules)
- [Current architecture](#current-architecture)
- [What changed since `63e2cfe`](#what-changed-since-63e2cfe)
- [Opportunity-First projection system](#opportunity-first-projection-system)
- [Market and sportsbook coverage](#market-and-sportsbook-coverage)
- [Data-source hierarchy and ingestion](#data-source-hierarchy-and-ingestion)
- [Tracked wagers, parlays, settlement, CLV, and attribution](#tracked-wagers-parlays-settlement-clv-and-attribution)
- [Frontend surfaces](#frontend-surfaces)
- [Database and migrations](#database-and-migrations)
- [Background jobs](#background-jobs)
- [Production environment variables and secrets](#production-environment-variables-and-secrets)
- [How to obtain every production credential](#how-to-obtain-every-production-credential)
- [Current production service costs](#current-production-service-costs)
- [Vercel production deployment](#vercel-production-deployment)
- [Production blockers and known limitations](#production-blockers-and-known-limitations)
- [Development](#development)
- [Validation and CI](#validation-and-ci)
- [Post-deploy verification](#post-deploy-verification)
- [Safety and betting language](#safety-and-betting-language)

---

## Core model and integrity rules

For player props, the primary production equation is:

```text
Expected Production
= Expected Minutes
× Opportunity Rate
× Conversion Rate
× Context Adjustment
× Pace Adjustment
× PPP Adjustment
```

The execution philosophy is:

```text
VERIFY → PROJECT → PRICE → STRESS-TEST → CLASSIFY → REPORT
```

Historical L5/L10/L15/L20 hit rate is contextual evidence only. It is not the estimate of true probability in the Opportunity-First player-prop feed.

Current integrity invariants:

1. Simulated public-betting or reporting data cannot be returned as verified evidence.
2. If the configured odds provider is unavailable, NEWNBA writes no synthetic sportsbook market data.
3. Player-prop model probability comes from the Opportunity-First projection stack, not recent hit rate.
4. Official NBA injury evidence outranks reporting and aggregator fallback.
5. Missing tracking observations remain missing when the schema can distinguish missing from observed zero.
6. Monte Carlo output is seeded and reproducible for identical inputs.
7. Financial performance uses the actual tracked stake and price.
8. Same-game correlation-adjusted EV is withheld when trustworthy empirical coverage is insufficient.
9. Unverified `StatLine` writes are rejected at the Prisma boundary.
10. Automatic player-prop settlement requires exact event and player linkage.
11. True parlay P&L remains ticket-level; ticket profit is not copied onto each leg.
12. Arena name/city can be sourced from official NBA team profiles, but coordinates, time zone, altitude, and derived travel are not guessed.
13. Unsupported settlement markets remain `PENDING`; the system does not invent a result.
14. Recommendation quality is evaluated at the exact sportsbook, line, and price available at decision time.

Full model definitions are in [`docs/MODELS.md`](docs/MODELS.md). Conservative implementation status is tracked in [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md), and source limitations are recorded in [`docs/SOURCE_LIMITATIONS.md`](docs/SOURCE_LIMITATIONS.md).

---

## Current architecture

```text
NEWNBA/
├── backend/                         # NestJS API + Prisma + schedulers + quant services
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
│       ├── modules/
│       │   ├── analytics/
│       │   ├── arbitrage/
│       │   ├── auth/
│       │   ├── bankoll/            # bankroll workflows
│       │   ├── betslip/
│       │   ├── billing/
│       │   ├── data-ingestion/
│       │   ├── ev/
│       │   ├── parlay/
│       │   ├── player-props/
│       │   └── projection/
│       └── services/
│           ├── background-jobs/
│           ├── balldontlie/
│           ├── nba-data/
│           └── odds-api/
├── frontend/                        # React 18 + Vite + TypeScript + Tailwind
├── nba-data/                        # FastAPI sidecar for official NBA-facing adapters
│   ├── production_app.py
│   ├── opportunity_routes.py
│   ├── official_injury_service.py
│   ├── official_referee_service.py
│   ├── official_shot_profile_service.py
│   └── official_arena_service.py
├── docs/
│   ├── GAP_AUDIT.md
│   ├── IMPLEMENTATION_STATUS.md
│   ├── MODELS.md
│   └── SOURCE_LIMITATIONS.md
├── .github/workflows/
│   ├── opportunity-first-ci.yml
│   └── opportunity-first-frontend-ci.yml
├── docker-compose.yml
└── docker-compose.override.yml
```

> Note: `bankoll/` above refers to the existing bankroll feature area conceptually; use the actual repository path under `backend/src/modules/bankroll/` when navigating the code.

### Runtime topology

The intended production topology is:

```text
Public domain
│
├── /                       → React/Vite frontend
├── /api/*                  → NestJS backend
│                              │
│                              ├── PostgreSQL → Neon
│                              ├── sportsbook markets → The Odds API
│                              ├── optional fallback stats → BALLDONTLIE
│                              └── Stripe → subscriptions/billing
│
└── internal service call   → FastAPI nba-data sidecar
                               └── official NBA / stats.nba.com-facing adapters
```

For a same-domain deployment, the frontend can use the default `VITE_API_URL=/api`, which simplifies cookies and CORS compared with separate frontend/backend domains.

---

# What changed since `63e2cfe`

The GitHub compare from `63e2cfe` to current `main` is **194 commits ahead**. The work is not a small hosting patch; it is a substantial redesign of the data model, projection engine, tracking loop, frontend, data integrity rules, and CI surface.

## 1. Opportunity-First projection architecture added

A dedicated `backend/src/modules/projection/` module was added with deterministic model primitives for:

- seeded Monte Carlo simulation;
- FAST / STANDARD / DEEP analysis modes;
- minutes and rotation modeling;
- injury replacement and role redistribution;
- opportunity-rate and conversion-rate projection;
- possession share and PPP context;
- points, rebounds, assists, threes, turnovers, steals, blocks, stocks, PRA, PR, PA, RA;
- double-double and triple-double probability;
- correlation-aware recombination;
- game-script and blowout sensitivity;
- uncertainty decomposition;
- source-quality and freshness scoring;
- duplicate-evidence / anti-narrative bias controls;
- decision classification;
- alternate-line probability curves;
- playable-to line and price calculation;
- milestone probabilities;
- referee and environment context.

New projection files include `bias-control.engine.ts`, `correlation.engine.ts`, `decision.engine.ts`, `environment.engine.ts`, `injury-replacement.engine.ts`, `milestone.engine.ts`, `opportunity-projection.engine.ts`, `projection.math.ts`, `projection.service.ts`, `projection.types.ts`, `referee.engine.ts`, `rotation.engine.ts`, `source-quality.engine.ts`, controller/module/DTO wiring, and corresponding unit/integration tests.

## 2. Player Props moved to Opportunity-First pricing

The player-prop feed now assembles current market data, opportunity inputs, availability, rotations, source quality, and projection distributions through `player-prop-projection.assembler.ts` instead of treating recent hit rate as true probability.

```http
GET /api/player-props/feed?mode=STANDARD
```

The feed supports distribution outputs such as mean, median, p05/p10/p25/p50/p75/p90/p95, uncertainty decomposition, data quality, decision class, confidence, source/availability context, primary risk, contrarian case, and playable-to thresholds while keeping recent-hit windows contextual.

## 3. Expanded NBA market schema and mapping

The Prisma market model and provider mapping were expanded to support first-class NBA categories including:

### Game markets

- Moneyline
- Spread
- Game total
- Team total

### First half

- Moneyline
- Spread
- Total
- Team total

### First quarter

- Moneyline
- Spread
- Total
- Team total

### Player props

- Points
- Rebounds
- Assists
- Threes
- Steals
- Blocks
- Turnovers
- Stocks
- PRA
- PR
- PA
- RA
- Double Double
- Triple Double
- Alternate player lines

`DERIVATIVE` remains available for additive derivative support. Provider market-key mapping was centralized in `nba-market-map.ts` and expanded market ingestion was separated into `nba-market-ingestion.job.ts`.

A remaining model-quality limitation is that team totals still do not have a dedicated first-class team-subject relation everywhere; provider description/outcome identity can remain the fallback.

## 4. Sportsbook data integrity hardened

The Odds API integration now preserves exact sportsbook, line, American price, open/active state, odds history, and snapshots. Event-specific odds fetching follows the provider's single-event response shape.

Most importantly, the former synthetic fallback behavior was removed: an unavailable or unauthenticated odds provider produces no fabricated production markets.

Player-prop ingestion currently requests the provider's NBA points/rebounds/assists/threes/blocks/steals markets in the legacy recurring job, while the newer NBA market ingestion layer carries the expanded market model. Production quota sizing therefore needs to account for event-level player-prop requests, not only one slate-level core-market call.

## 5. Prisma data model substantially expanded

`backend/prisma/schema.prisma` received a major additive expansion covering typed persistence for:

- exact wager provenance;
- wager structure (`SINGLE_BATCH` vs `PARLAY`);
- recommendation-time model snapshots;
- settlement status and actual result per leg;
- ticket-level parlay stake/payout/P&L;
- closing line/price and CLV;
- confidence, decision, direction, prop type, and season phase;
- player availability projections;
- expected/official lineups and rotations;
- injury replacement projections;
- opportunity/tracking data;
- shot profiles and play types;
- five-man lineup and player on/off data;
- referee assignments/metrics;
- game environment and schedule-density context;
- post-bet reviews and attribution;
- raw injury/news source credibility metadata.

Indexes, relations, enums, and nullable semantics were updated accordingly.

## 6. Formal migration history introduced for Opportunity-First work

The following committed migrations were added:

```text
backend/prisma/migrations/
├── 20260818000000_baseline_main/
├── 20260818033000_opportunity_first_phase1/
├── 20260818033100_remove_simulated_public_betting/
├── 20260818040000_wager_projection_snapshots/
├── 20260818050000_expand_nba_markets/
├── 20260818103000_priority_hardening_2/
└── migration_lock.toml
```

The baseline/migration CI flow was hardened so additive migrations are exercised against the frozen current-main schema rather than assuming an empty database.

## 7. Simulated public betting removed from verified production evidence

Legacy simulated public-betting rows are purged by migration and the runtime no longer returns simulated betting data as verified evidence. `PublicBettingService` was changed to fail closed where a trustworthy source does not exist.

This means contrarian/public-betting features must tolerate unavailable data rather than inventing percentages.

## 8. Official NBA injury ingestion added and ranked above fallback reporting

The FastAPI sidecar gained an official NBA injury-report adapter that discovers/parses timestamped official injury reports. Backend ingestion now uses official evidence first and degrades to ESPN/reporting fallback only when official data is unavailable.

Additional integrity work includes:

- publication/report time is kept separate from return ETA;
- `returnEta` can never populate `reportedAt`;
- source tier and data quality are persisted;
- simulated sources are rejected;
- current availability is stored probabilistically for upcoming events;
- freshness and conflicting reports affect data quality.

## 9. News/reporting hierarchy made deterministic

`news-source-registry.ts` and associated tests were added. Raw news records can persist `sourceKey`, `sourceTier`, `sourceClass`, and `dataQuality`.

The runtime recognizes classes such as official NBA/team/coach, national reporter, beat reporter, aggregator, and unknown. Unknown sources cannot self-promote into Tier 1 merely by claiming to be official. Same-tier conflicts can remain unresolved; higher-tier evidence can override lower-tier evidence.

Actual ingestion coverage for official team communications, coaching announcements, and attributable beat/national reporters is still incomplete.

## 10. Official tracking/opportunity adapters expanded

The FastAPI sidecar and backend ingestion were expanded for official NBA-facing data such as:

- player tracking;
- drives;
- passing;
- rebounding;
- catch-and-shoot;
- pull-up shooting;
- post touches;
- paint touches;
- play types;
- five-man lineups;
- player on/off;
- shot-location profiles.

`nba-shot-data.service.ts`, `official_shot_profile_service.py`, shot-profile ingestion jobs, and tests were added.

Missing catch-and-shoot/pull-up observations now persist as `null` instead of being silently converted to observed zero. Historical rows that already contain ambiguous zeros are not rewritten without a trustworthy re-ingestion source.

## 11. Rotations and injury replacement became persisted execution paths

The data model and jobs now support expected/official lineups, starter/bench state, rotation order, minutes floor/median/ceiling, minutes standard deviation, restrictions, load management, suspension context, closing lineups, and lineup archetypes.

The rotation/replacement system redistributes separately across minutes, usage, ball handling, rebound chances, FGA, 3PA, and defensive impact. Those opportunity deltas are consumed by projection logic rather than being stored as dead metadata.

## 12. Schedule and environment context added

Schedule-derived context now includes rest hours, back-to-backs, three games in four nights, four games in six nights, prior overtime, previous-game minute load, and rest advantage.

The environment model has fields/logic for travel distance, time-zone change, and altitude, but these are intentionally not treated as verified evidence until trustworthy arena coordinates/time-zone/altitude inputs are populated.

## 13. Official NBA arena identity ingestion added

The sidecar gained `official_arena_service.py` and routes for current official NBA team-profile arena data. Backend persistence can populate official arena name and city.

Coordinates, IANA time zone, and altitude remain intentionally unset until independently verified. The system does not geocode or approximate them silently.

## 14. Official referee assignment ingestion added

The sidecar gained an official referee assignment adapter and route. The backend can persist current NBA game crews through `referee-assignment.job.ts`.

The deterministic referee model supports sample-controlled foul rate, free-throw tendency, pace impact, and interruption rate, but trustworthy historical tendency estimates still require sufficient exact referee↔game historical linkage before they should influence recommendations materially.

## 15. Exact `StatLine` identity and write guard added

A major integrity hardening pass added an exact game-log event resolver, exact StatLine sync path, and a central Prisma write guard.

Unverified/generic-anchor `StatLine` writes are rejected. This protects downstream projections and settlement from player stats being attached to the wrong event.

A legacy generic-anchor fetch routine still exists in `JobsService` for compatibility/efficiency cleanup, but the central write guard prevents that legacy path from silently corrupting newly protected StatLines. The preferred path is the exact resolver.

## 16. Recommendation-time projection snapshots added

Tracked wagers can now persist an immutable projection snapshot at the moment the recommendation is added. This enables later review against what the model actually knew/projected at decision time rather than reconstructing state after the game.

Snapshots include typed model/provenance context needed for CLV and post-bet attribution.

## 17. Player Props → tracked wager handoff implemented

The frontend and backend now preserve exact wager provenance from Player Props into the betslip/tracking system, including event, market, player, sportsbook, line, price, direction, EV, confidence, and decision context.

Tracked slip submission is transactional and exposed through an explicit API client rather than remaining browser-only state.

## 18. Singles and parlays now have explicit semantics

The prior ambiguity between a list of independent singles and a true parlay was removed.

`SINGLE_BATCH` means independent wagers with independent stake/return accounting. `PARLAY` means one ticket stake, ticket-level payout/P&L, and zero duplicated leg stakes for financial reporting.

The frontend and API have separate persistence paths for those semantics.

## 19. Empirical SGP correlation replaced heuristic coefficients

Legacy hard-coded same-game correlation coefficients were removed from runtime.

For supported same-game player props, the new empirical SGP engine uses aligned trustworthy historical observations, an empirical Pearson correlation matrix, and a Gaussian copula. Minimum aligned-history coverage is enforced.

When a same-game combination cannot be modeled honestly, the result is `UNMODELED` and correlation-adjusted probability/EV is withheld. Standard parlay analysis also refuses to assume independence for same-event legs.

## 20. Deterministic parlay settlement engine added

A push/void-aware deterministic settlement engine was added. True parlay accounting uses one ticket stake and ticket-level result; independent singles are aggregated independently.

Automatic tracked-wager settlement currently supports **exact player-prop legs only**, resolved from the exact final event/player `StatLine`. Supported stat logic includes over/under props, stocks, combinations, double-double, and triple-double.

**Game/team markets such as moneyline, spread, total, team total, period markets, and generic derivatives do not yet have a verified automatic settlement adapter and remain `PENDING` after a final event rather than being guessed.**

## 21. Automatic closing-line capture and CLV added

A scheduled closing-line job can capture pre-tip closing line/price for tracked wagers. CLV math was extracted/tested and both line CLV and price CLV can be persisted.

Price CLV uses:

```text
Recommended Decimal Odds / Closing Decimal Odds - 1
```

## 22. Performance tracking corrected for actual wager economics

Performance analytics were rewritten to use actual tracked price and stake instead of a fixed `$100 at -110` assumption.

Metrics/slices include ROI, win rate, P&L, CLV rate, average CLV, average line CLV, Sharpe ratio, max drawdown, calibration, confidence, prop type, direction, season phase, market type, and sportsbook.

Per-leg settlement can be consumed for independent singles without double-counting. Parlay ticket P&L remains ticket-level and is not attributed to every leg.

## 23. Post-bet attribution/review added

`post-bet-attribution.ts` and `post-bet-review.service.ts` were added. Review can classify observed process errors such as minutes projection error, usage error, rotation error, pace error, market timing error, foul trouble, blowout, in-game injury, and unexpected coaching decisions.

The review system uses exact event linkage and recommendation-time snapshots where available. It does not automatically excuse a miss as variance when the required pregame evidence was never stored.

## 24. Frontend Opportunity-First workspace added and integrated

The frontend now includes an `/opportunity` PRO-gated workspace with views for:

- decision board;
- projection distributions/percentiles;
- lineup and rotation context;
- referee/environment context;
- CLV/performance/post-bet context;
- source hierarchy/data quality.

`OpportunityFirstPage.tsx` and `opportunityApi.ts` were added. Player Props, Parlay Builder, Expert Picks, the betslip store, layout, and app routing were changed to support the new flows. The old README statement that route/navigation integration still needed to be completed is obsolete; the route is now part of the merged frontend.

## 25. New CI workflows and hardening tests added

Two GitHub Actions workflows were added:

```text
.github/workflows/opportunity-first-ci.yml
.github/workflows/opportunity-first-frontend-ci.yml
```

Validation covers Prisma schema/client generation, migration behavior, backend Jest tests, Nest build, Python sidecar compile/import, React build, merged Docker Compose configuration, exact StatLine behavior, empirical SGP behavior, settlement accounting, source classification, projection snapshots, schedule density, rotations/replacement, referee assignments, shot profiles, CLV, and projection/source/bias engines.

## 26. New engineering documentation added

The following documents were added or substantially expanded:

```text
docs/GAP_AUDIT.md
docs/IMPLEMENTATION_STATUS.md
docs/MODELS.md
docs/SOURCE_LIMITATIONS.md
PROJECT_PLAN.md
CLAUDE.md
```

These documents establish conservative completion criteria, source limitations, model definitions, and remaining production gaps.

## 27. Production sidecar path hardened

The Python service gained `production_app.py`, `Dockerfile.prod`, `app_extensions.py`, official adapters, and Opportunity-First routes. Docker Compose override wiring selects the production Opportunity-First sidecar path for merged local configuration.

## 28. Changed-file map for the `63e2cfe..5c81ee70` span

Major changed paths from the GitHub compare are:

```text
.github/workflows/opportunity-first-ci.yml
.github/workflows/opportunity-first-frontend-ci.yml
CLAUDE.md
PROJECT_PLAN.md
README.md

backend/prisma/schema.prisma
backend/prisma/migrations/20260818000000_baseline_main/migration.sql
backend/prisma/migrations/20260818033000_opportunity_first_phase1/migration.sql
backend/prisma/migrations/20260818033100_remove_simulated_public_betting/migration.sql
backend/prisma/migrations/20260818040000_wager_projection_snapshots/migration.sql
backend/prisma/migrations/20260818050000_expand_nba_markets/migration.sql
backend/prisma/migrations/20260818103000_priority_hardening_2/migration.sql
backend/prisma/migrations/migration_lock.toml

backend/src/app.module.ts
backend/src/modules/analytics/clv.ts
backend/src/modules/analytics/clv.spec.ts
backend/src/modules/analytics/performance-tracking.service.ts
backend/src/modules/analytics/post-bet-attribution.ts
backend/src/modules/analytics/post-bet-attribution.spec.ts
backend/src/modules/analytics/post-bet-review.service.ts

backend/src/modules/betslip/betslip.controller.ts
backend/src/modules/betslip/betslip.module.ts
backend/src/modules/betslip/betslip.service.ts
backend/src/modules/betslip/betslip.service.spec.ts
backend/src/modules/betslip/closing-line.job.ts
backend/src/modules/betslip/closing-line.job.spec.ts
backend/src/modules/betslip/dto/betslip.dto.ts
backend/src/modules/betslip/tracked-wager-settlement.job.ts
backend/src/modules/betslip/tracked-wager-settlement.job.spec.ts
backend/src/modules/betslip/wager-projection-snapshot.service.ts
backend/src/modules/betslip/wager-projection-snapshot.service.spec.ts

backend/src/modules/data-ingestion/data-ingestion.module.ts
backend/src/modules/data-ingestion/injury-ingest.service.ts
backend/src/modules/data-ingestion/news-ingest.service.ts
backend/src/modules/data-ingestion/news-source-registry.ts
backend/src/modules/data-ingestion/news-source-registry.spec.ts
backend/src/modules/data-ingestion/public-betting.service.ts

backend/src/modules/ev/ev.service.ts

backend/src/modules/parlay/empirical-sgp.service.ts
backend/src/modules/parlay/empirical-sgp.service.spec.ts
backend/src/modules/parlay/parlay.controller.ts
backend/src/modules/parlay/parlay.module.ts
backend/src/modules/parlay/parlay.service.ts
backend/src/modules/parlay/parlay.service.spec.ts
backend/src/modules/parlay/settlement.engine.ts
backend/src/modules/parlay/settlement.engine.spec.ts

backend/src/modules/player-props/player-prop-projection.assembler.ts
backend/src/modules/player-props/player-prop-projection.assembler.spec.ts
backend/src/modules/player-props/player-props.controller.ts
backend/src/modules/player-props/player-props.module.ts
backend/src/modules/player-props/player-props.service.ts
backend/src/modules/player-props/player-props.service.spec.ts

backend/src/modules/projection/*
backend/src/modules/prisma/prisma.service.ts

backend/src/services/background-jobs/exact-statline-sync.job.ts
backend/src/services/background-jobs/exact-statline-sync.job.spec.ts
backend/src/services/background-jobs/jobs.module.ts
backend/src/services/background-jobs/jobs.service.ts
backend/src/services/background-jobs/nba-market-ingestion.job.ts
backend/src/services/background-jobs/opportunity-data-ingestion.job.ts
backend/src/services/background-jobs/referee-assignment.job.ts
backend/src/services/background-jobs/referee-assignment.job.spec.ts
backend/src/services/background-jobs/rotation-replacement.job.ts
backend/src/services/background-jobs/rotation-replacement.job.spec.ts
backend/src/services/background-jobs/schedule-environment.job.ts
backend/src/services/background-jobs/schedule-environment.job.spec.ts
backend/src/services/background-jobs/shot-profile-ingestion.job.ts
backend/src/services/background-jobs/shot-profile-ingestion.job.spec.ts
backend/src/services/background-jobs/statline-event-resolver.ts
backend/src/services/background-jobs/statline-event-resolver.spec.ts

backend/src/services/nba-data/nba-data.service.ts
backend/src/services/nba-data/nba-shot-data.service.ts
backend/src/services/odds-api/nba-market-map.ts
backend/src/services/odds-api/nba-market-map.spec.ts
backend/src/services/odds-api/odds-api.service.ts

docker-compose.override.yml

docs/GAP_AUDIT.md
docs/IMPLEMENTATION_STATUS.md
docs/MODELS.md
docs/SOURCE_LIMITATIONS.md

frontend/src/App.tsx
frontend/src/components/Layout.tsx
frontend/src/lib/betslipApi.ts
frontend/src/lib/opportunityApi.ts
frontend/src/pages/ExpertPicksPage.tsx
frontend/src/pages/OpportunityFirstPage.tsx
frontend/src/pages/ParlayBuilderPage.tsx
frontend/src/pages/PlayerPropsPage.tsx
frontend/src/stores/betslip.ts

nba-data/Dockerfile
nba-data/Dockerfile.prod
nba-data/app_extensions.py
nba-data/main.py
nba-data/official_arena_service.py
nba-data/official_injuries.py
nba-data/official_injury_service.py
nba-data/official_referee_service.py
nba-data/official_shot_profile_service.py
nba-data/opportunity_routes.py
nba-data/production_app.py
nba-data/requirements.txt
nba-data/test_official_arena_service.py
```

---

## Opportunity-First projection system

### Analysis modes

| Mode | Intended use | Behavior |
|---|---|---|
| `FAST` | Slate screening | Lowest-cost deterministic screening path |
| `STANDARD` | Default decision workflow | Balanced simulation depth and context |
| `DEEP` | High-value / ambiguous candidates | Larger simulation/deeper stress test |

### Decision classes

The projection/decision layer supports `PASS`, `WAIT`, `LEAN`, `BET`, and `STRONG_BET`, plus news timing states such as `BET_NOW`, `WAIT`, and `PASS`.

`PASS` and `WAIT` are valid outputs. The system is not required to manufacture a pick for every market.

### Probability and uncertainty

The projection response can carry point estimates, quantiles, source quality, uncertainty decomposition, game-script sensitivity, alternate-line curves, and playable-to thresholds. Identical seeded inputs produce identical simulation samples.

### Correlation

Combination props and SGP analysis use explicit correlation handling. Same-game adjusted EV is not shown when the empirical engine cannot support the dependence structure with sufficient aligned history.

---

## Market and sportsbook coverage

The production sportsbook integration uses **The Odds API** (`https://api.the-odds-api.com/v4` by default).

Core recurring sportsbook behavior:

- NBA core markets: moneyline, spread, total;
- event-level player-prop requests for supported player markets;
- exact book identity;
- exact line and price;
- odds history when a line/price changes;
- snapshots for market-movement/CLV workflows;
- no synthetic fallback when provider access fails.

Expanded schema/mapping additionally supports team totals, 1H/1Q markets, alternate player lines, combinations, milestones, and derivative market types where provider inputs are available.

---

## Data-source hierarchy and ingestion

### Tiering

| Tier | Intended source class | Examples in current implementation |
|---|---|---|
| Tier 1 | Official | NBA injury reports, official NBA/stats endpoints, official assignment/team-profile data |
| Tier 2 | High-quality provider | Professional structured providers when configured |
| Tier 3 | Reporting | ESPN fallback, attributable professional reporting |
| Low priority | Weak/unverified | Aggregated or unattributed evidence |
| Simulated | Never verified | Rejected for production evidence |

### Official NBA sidecar

`nba-data/production_app.py` is the production FastAPI entrypoint. It exposes adapters/routes for current season/player data plus official injury reports, referee assignments, shot profiles, arena identity, opportunity/tracking, lineup/on-off, and related NBA data paths.

The sidecar does not require an API key for the official NBA-facing adapters currently in this repository. It is still an external-data dependency: network failures, endpoint changes, rate limiting, or source changes must degrade data quality or fail closed instead of causing fabricated data.

### BALLDONTLIE

BALLDONTLIE remains an **optional secondary/fallback integration** behind `BALLDONTLIE_API_KEY`. The backend logs that its sync is disabled when the key is absent.

Do not treat the current legacy BALLDONTLIE generic-anchor StatLine routine as the preferred production truth path. Exact NBA event resolution and the central StatLine write guard are the authoritative integrity path.

---

## Tracked wagers, parlays, settlement, CLV, and attribution

### Exact recommendation provenance

Tracked items can persist sportsbook, event, market, player, exact recommended line, exact recommended American price, stake, EV, confidence, decision, prop type, direction, season phase, and recommendation-time projection context.

### `SINGLE_BATCH`

Multiple independent wagers. Each item retains its own stake, odds, settlement, and return. Batch return is the sum of the independent outcomes.

### `PARLAY`

One ticket with one ticket stake. Legs carry market identity and settlement state but do not receive duplicated ticket stake/P&L.

### Settlement

Automatic settlement currently requires a final event and an exact `eventId + playerId` `StatLine`. Supported player-prop calculations include points, rebounds, assists, steals, blocks, threes, turnovers, stocks, minutes, PRA, PR, PA, RA, double-double, and triple-double.

Non-player markets remain pending until a verified adapter is implemented.

### CLV

Closing line/price can be captured pre-tip by scheduled logic. Both line CLV and price CLV are persisted where exact comparable close data exists.

### Post-bet review

The post-bet loop compares the recommendation-time state against observed outcomes to identify process errors rather than relying only on win/loss results.

---

## Frontend surfaces

The existing platform capabilities are preserved, including EV feed, cross-book arbitrage, custom and preset models, optimization, ensemble models, A/B testing, alerts, betslips, bankroll workflows, live-game infrastructure, and performance dashboards.

Opportunity-First additions include:

- `/opportunity` PRO-gated workspace;
- decision board;
- projection distribution/percentile views;
- lineup/rotation/availability views;
- referee/environment views;
- CLV/attribution views;
- source/data-quality views;
- exact Player Props → betslip tracking handoff;
- independent singles accounting;
- true parlay persistence;
- empirical SGP modeled/unmodeled state display;
- multi-game leg accumulation.

The frontend API client is centralized and uses credentials/cookies automatically. Its API base is:

```ts
const API_BASE = import.meta.env.VITE_API_URL || '/api'
```

---

## Database and migrations

Production uses PostgreSQL through Prisma.

### Required production command

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start:prod
```

### Critical production warning

**Do not use `prisma db push --accept-data-loss` for production deployment.**

The current local Docker Compose development command still contains `db push --accept-data-loss`, and the current production stage in `backend/Dockerfile` must also be reviewed/corrected before final production sign-off if it still invokes `db push`. Production must apply committed migrations with:

```bash
npx prisma migrate deploy
```

The database is part of the audit trail for tracked wagers, projection snapshots, source provenance, and settlement. Destructive schema synchronization is not an acceptable production migration strategy.

---

## Background jobs

The Nest backend currently uses `@nestjs/schedule`. Important jobs include:

| Approx. cadence | Purpose |
|---|---|
| Every minute | EV scan |
| Every minute | Arbitrage scan |
| Every 5 min | Expired-opportunity cleanup / alert-related workflows |
| Every 15 min | Pending tracked player-prop settlement |
| Every 30 min | Core live odds synchronization |
| Daily / scheduled | NBA stats, optional BALLDONTLIE, tracking/opportunity, rotations, schedule context, shot profiles, referee assignments |
| Pre-tip scheduled logic | Closing-line capture |

### Vercel scheduler warning

Do not assume an in-process Nest cron scheduler will execute reliably on a runtime that can scale to zero, suspend, or create multiple replicas. Before declaring a Vercel deployment production-complete, either:

1. verify the selected Vercel Services/container runtime provides the lifecycle guarantees needed for these schedulers; or
2. move critical scheduled operations behind authenticated/idempotent endpoints and invoke them with Vercel Cron or another durable scheduler.

Duplicate execution must be considered when horizontally scaling scheduled workers.

---

# Production environment variables and secrets

Do not commit production values to Git. Store secrets in the hosting platform's secret/environment-variable manager. On Vercel, use **Project → Settings → Environment Variables** and mark sensitive production values as sensitive where supported. Environment changes require a redeploy before they affect an existing deployment.

## Production variable matrix

| Variable | Secret? | Production status | Where used / purpose | How to obtain | Service / current cost |
|---|---:|---|---|---|---|
| `NODE_ENV` | No | Required | Set backend production behavior | Set to `production` | No cost |
| `PORT` | No | Runtime-dependent | Nest listener port | Usually supplied by hosting runtime; otherwise set e.g. `3000` | No cost |
| `FRONTEND_URL` | No | Required | CORS, origin guard, Stripe success/cancel URLs | Production public site origin, e.g. your Vercel/custom-domain URL | Included with hosting; custom domain registration varies |
| `DATABASE_URL` | **Yes** | **Required** | Prisma/PostgreSQL connection | Provision Neon and copy/inject its Postgres connection string | Neon Free $0; Launch usage-based, typical ~$15/mo |
| `JWT_SECRET` | **Yes** | **Required** | Access-token signing | Generate a high-entropy random secret locally | $0 |
| `JWT_REFRESH_SECRET` | **Yes** | **Required** | Refresh-token signing | Generate a separate high-entropy random secret locally | $0 |
| `JWT_EXPIRES_IN` | No | Defaulted | Access-token TTL | App config; default `15m` | $0 |
| `JWT_REFRESH_EXPIRES_IN` | No | Defaulted | Refresh-token TTL | App config; default `7d` | $0 |
| `NBA_DATA_URL` | No if internal URL | **Required for official NBA sidecar workflows** | Nest → FastAPI sidecar | Internal service binding/URL for `nba-data` | Included in hosting compute; no external API-key fee |
| `ODDS_API_KEY` | **Yes** | **Required for live sportsbook markets** | Live NBA odds/player props | Create The Odds API account and copy API key | Current paid start: $30/mo for 20K credits |
| `ODDS_API_BASE_URL` | No | Defaulted | Odds provider base URL | Default `https://api.the-odds-api.com/v4` | No separate cost |
| `BALLDONTLIE_API_KEY` | **Yes** | Optional fallback | Secondary player/stat integration | BALLDONTLIE account/dashboard API key | Free $0; All-Star $9.99/mo; GOAT $39.99/mo per sport |
| `BALLDONTLIE_BASE_URL` | No | Defaulted | BALLDONTLIE API base | Default `https://api.balldontlie.io/v1` | No separate cost |
| `STRIPE_SECRET_KEY` | **Yes** | Required only when billing is enabled | Server-side Stripe API | Stripe live mode API keys | No fixed Payments monthly fee; transaction fees apply |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Required only when billing is enabled | Verify Stripe webhook signatures | Create live webhook endpoint, then reveal signing secret | Included with Stripe integration; Billing/Payments fees apply |
| `STRIPE_PRO_PRICE_ID` | No, but server config | Required for PRO checkout | Stripe recurring Price ID | Create PRO product + recurring price in Stripe Product catalogue | No fee to create; Billing/payment fees apply on transactions |
| `STRIPE_PREMIUM_PRICE_ID` | No, but server config | Required for PREMIUM checkout | Stripe recurring Price ID | Create PREMIUM product + recurring price in Stripe Product catalogue | Same as above |
| `VITE_API_URL` | No | Recommended/defaultable | Frontend build-time API base | For same-domain deployment use `/api` or omit to use default | $0 |
| `THROTTLE_TTL` | No | Optional/defaulted | API rate-limit window | App config; default `60` seconds | $0 |
| `THROTTLE_LIMIT` | No | Optional/defaulted | API request limit | App config; default `100` | $0 |
| `LOG_LEVEL` | No | Optional | Logging verbosity | App config | $0 |
| `ACTION_NETWORK_ENABLED` | No | Declared operational flag | Retained network-ingestion configuration | Set intentionally; audit actual job enforcement before relying on it as a kill switch | $0 |
| `INJURY_SYNC_ENABLED` | No | Declared operational flag | Retained injury-sync configuration | Set intentionally; current injury service also depends on sidecar availability | $0 |
| `NEWS_SYNC_ENABLED` | No | Declared operational flag | Retained news-sync configuration | Set intentionally; do not assume every scheduler is gated unless code path confirms it | $0 |
| `ODDS_SNAPSHOT_INTERVAL_MIN` | No | Declared operational config | Intended odds snapshot cadence | Common value `15`; verify against actual scheduler behavior | $0 |
| `NODE_OPTIONS` | No | Optional | Node memory/runtime options | Host/runtime config; Compose uses `--max-old-space-size=1024` | $0 |
| `PYTHONUNBUFFERED` | No | Optional | Sidecar log buffering | Set to `1` in container runtime if desired | $0 |
| `REDIS_HOST` | No | **Not required by current production cache path** | Legacy/local Compose Redis configuration | Only provision if Redis-backed features are re-enabled | $0 if unused; provider-specific if re-enabled |
| `REDIS_PORT` | No | Not currently required | Legacy/local Redis port | Usually `6379` if Redis is used | Provider-specific if re-enabled |
| `REDIS_PASSWORD` | **Yes if Redis used** | Not currently required | Redis authentication | Supplied by chosen Redis provider | Provider-specific if re-enabled |

### Why Redis is not a current production requirement

`AppModule` currently registers Nest's compatible built-in in-memory cache because the prior Redis cache-store package is incompatible with the active cache-manager version. Redis is still present in local `docker-compose.yml`, but the current cache path does not require a production Redis service. Do not pay for Redis solely because the legacy environment variables exist.

### Suggested production values that are not secrets

```env
NODE_ENV=production
FRONTEND_URL=https://your-production-domain.example
VITE_API_URL=/api
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ODDS_API_BASE_URL=https://api.the-odds-api.com/v4
BALLDONTLIE_BASE_URL=https://api.balldontlie.io/v1
THROTTLE_TTL=60
THROTTLE_LIMIT=100
LOG_LEVEL=info
```

Do **not** place real `DATABASE_URL`, JWT secrets, Odds API keys, BALLDONTLIE keys, Stripe secret keys, or webhook signing secrets in this file or README.

---

# How to obtain every production credential

## 1. Vercel hosting and environment-variable storage

**Site:** https://vercel.com/

**Pricing:** https://vercel.com/pricing

Recommended path for a commercial SaaS deployment:

1. Sign in to Vercel.
2. Import `joeydd032995-pixel/NEWNBA` from GitHub.
3. Use repository root `./` / leave Root Directory at repository root for a multi-service deployment.
4. Open **Project → Settings → Environment Variables**.
5. Add production variables there rather than committing `.env`.
6. Mark secret values as sensitive where available.
7. Redeploy after changing environment variables.
8. Use **Settings → Domains** for the custom domain.
9. Use **Settings → Deployment Protection** to ensure the public production deployment is not accidentally account-login protected.

As of August 18, 2026, Vercel's public documentation still describes **Vercel Services as Private Beta/access-by-request**. Do not assume a new account/project has Services enabled. If Services is unavailable, deploy the frontend/backend/sidecar as separate projects/services or retain a hybrid host for the long-running backend/worker.

**Current Vercel pricing:** Hobby is $0/month. Pro is $20/month and includes $20 in monthly usage credit. For a commercial production SaaS, budget for Pro + any usage beyond included credit rather than assuming Hobby is the production target.

## 2. Neon PostgreSQL → `DATABASE_URL`

**Site:** https://neon.com/

**Pricing:** https://neon.com/pricing

**Vercel Marketplace:** https://vercel.com/marketplace/neon

Recommended Vercel-managed path:

1. In Vercel, open the Marketplace/Storage integration flow.
2. Choose **Neon**.
3. Install the integration and create/connect a Neon database.
4. Connect the database resource to the NEWNBA project.
5. Vercel Marketplace storage can inject database credentials as environment variables.
6. Ensure the connection string used by Prisma is available to the backend specifically as `DATABASE_URL`; if the integration injects a differently named connection variable, map/copy the correct Postgres URL into `DATABASE_URL`.
7. Run `npx prisma migrate deploy` against the production database.

If the Neon organization is managed by Vercel, provision the Neon project through the Vercel Marketplace integration rather than trying to create it independently through a separately managed Neon organization flow.

**Current Neon pricing:** Free is $0 and currently includes per-project compute/storage allowances. Launch is usage-based at approximately `$0.106/CU-hour` plus `$0.35/GB-month`; Neon's pricing page gives a representative typical spend around `$15/month` for an intermittent 1 GB workload. Actual production cost is workload-dependent.

## 3. JWT signing secrets → `JWT_SECRET`, `JWT_REFRESH_SECRET`

No external service is required.

Generate **two different** high-entropy secrets. Examples:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

or with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use the first output for `JWT_SECRET` and the second for `JWT_REFRESH_SECRET`. Never reuse one value for both. Store them as sensitive production environment variables. Cost: **$0**.

## 4. The Odds API → `ODDS_API_KEY`

**Site:** https://the-odds-api.com/

**API base configured by NEWNBA:** `https://api.the-odds-api.com/v4`

Steps:

1. Create an account with The Odds API.
2. Open the account/API-key area provided after signup.
3. Copy the API key into Vercel/your backend host as `ODDS_API_KEY`.
4. Keep `ODDS_API_BASE_URL=https://api.the-odds-api.com/v4` unless the provider changes its API contract.
5. Monitor credit consumption carefully. NEWNBA does slate/core-market requests plus event-level player-prop requests, so props can consume materially more quota than a single game-lines poll.

Current provider pricing shown on August 18, 2026:

| Monthly credits | Current price |
|---:|---:|
| 20,000 | $30 USD/month |
| 100,000 | $59 USD/month |
| 5,000,000 | $119 USD/month |
| 15,000,000 | $249 USD/month |

The provider currently advertises all sports, bookmakers, betting markets, and historical odds on these paid tiers. Confirm current pricing/market entitlement before purchasing because provider plans can change.

## 5. BALLDONTLIE → `BALLDONTLIE_API_KEY` (optional)

**Site:** https://www.balldontlie.io/

**Docs:** https://docs.balldontlie.io/

Steps:

1. Create a BALLDONTLIE account.
2. Open the account/dashboard and obtain the API key.
3. Store it as `BALLDONTLIE_API_KEY`.
4. Keep `BALLDONTLIE_BASE_URL=https://api.balldontlie.io/v1` unless the provider changes the endpoint.

Current NBA plan pricing:

| Tier | Rate limit | Current price | Relevant NBA access |
|---|---:|---:|---|
| Free | 5 req/min | $0 | Teams, players, games |
| All-Star | 60 req/min | $9.99 USD/month per sport | Adds game player stats, active players, injuries |
| GOAT | 600 req/min | $39.99 USD/month per sport | Adds season/advanced stats, box scores, lineups, betting odds, player props, and more |
| All-Access | 600 req/min | $299.99 USD/month | Full supported sports portfolio |

Because NEWNBA's primary opportunity path uses the official NBA sidecar and The Odds API, BALLDONTLIE is not a hard requirement for the current core production stack. Use it intentionally as a secondary source/fallback and choose the tier based on the endpoints you actually call.

## 6. Stripe → billing secrets and Price IDs

**Dashboard:** https://dashboard.stripe.com/

**Pricing (Norway):** https://stripe.com/en-no/pricing

**Billing pricing:** https://stripe.com/en-no/billing/pricing

### `STRIPE_SECRET_KEY`

1. Open Stripe Dashboard.
2. Switch from sandbox/test mode to **Live mode** before copying production credentials.
3. Open **Developers / Workbench → API keys** (Stripe UI naming can evolve; Stripe documents the API keys tab in the developer area).
4. Reveal/copy the live secret key beginning with `sk_live_`.
5. Store it only as a backend secret named `STRIPE_SECRET_KEY`.

NEWNBA currently does not require a Stripe publishable key in the frontend because Checkout is created server-side and returns a hosted Checkout URL.

### `STRIPE_PRO_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID`

1. In Stripe Dashboard, open **More → Product catalogue**.
2. Create the PRO product and a recurring subscription price.
3. Copy that live Price object's ID (`price_...`) to `STRIPE_PRO_PRICE_ID`.
4. Create the PREMIUM product and recurring subscription price.
5. Copy that live Price object's ID to `STRIPE_PREMIUM_PRICE_ID`.
6. Do not use sandbox Price IDs with a live secret key.

### `STRIPE_WEBHOOK_SECRET`

The application webhook route is:

```text
POST https://YOUR_PRODUCTION_DOMAIN/api/billing/webhook
```

Create a live Stripe webhook/event destination for that URL and subscribe at minimum to the event types currently handled by the backend:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
```

Open the endpoint in Stripe's Webhooks/Workbench area and reveal the signing secret beginning with `whsec_`. Store it as `STRIPE_WEBHOOK_SECRET`.

### Current Stripe cost for a Norway-based standard account

Stripe Payments currently lists no setup/monthly fee for standard pay-as-you-go Payments. Current card pricing includes approximately:

- `2.4% + 2.00 NOK` for Norwegian and EEA cards;
- `3.25% + 2.00 NOK` for UK/international cards;
- an additional currency-conversion fee can apply when conversion is required.

Stripe Billing's pay-as-you-go plan is currently `0.7% of Billing volume`, with no recurring Billing platform fee on that usage-based option. A fixed monthly Billing contract currently starts around `6,800 NOK/month` and is not necessary for an early low-volume launch.

## 7. `NBA_DATA_URL`

This is not purchased from an API provider. It is the internal URL/service binding from the Nest backend to the `nba-data` FastAPI service.

Examples by deployment style:

```text
Local Docker: http://nba-data:8000
Separate service: https://internal-or-protected-nba-data-service.example
Vercel Services: use a service binding/internal URL when available
```

Do not expose internal-only endpoints publicly unless necessary. If the sidecar must be public, protect administrative/internal surfaces appropriately.

## 8. `FRONTEND_URL` and `VITE_API_URL`

For a same-domain deployment:

```env
FRONTEND_URL=https://yourdomain.com
VITE_API_URL=/api
```

`FRONTEND_URL` must be the exact production origin accepted by the backend CORS/origin guard and used by Stripe return URLs. `VITE_API_URL` is a public build-time frontend setting, not a secret.

---

# Current production service costs

Pricing checked August 18, 2026. Always re-check provider pricing before purchase.

| Service | Required? | Recommended launch tier | Current recurring estimate |
|---|---|---|---:|
| Vercel | Yes for proposed Vercel deployment | Pro | **$20/mo + usage beyond included credit** |
| Neon Postgres | Yes | Free initially or Launch | **$0/mo Free** or typical **~$15/mo Launch**, usage-based |
| The Odds API | Yes for live sportsbook data | 20K credits minimum starting point | **$30/mo** |
| Official NBA-facing sidecar sources | Yes for core official-data path | Public/official endpoints | **$0 API-key fee** |
| BALLDONTLIE | No | Free unless fallback requirements demand paid data | **$0 / $9.99 / $39.99 per month per sport** |
| Stripe Payments | Only if monetization enabled | Standard pay as you go | **$0 fixed monthly Payments fee; transaction fees** |
| Stripe Billing | Only if subscriptions enabled | Pay as you go | **0.7% of Billing volume** |
| Redis | No, current cache is in-memory | None | **$0** |
| JWT secret generation | Yes | Local crypto | **$0** |
| Custom domain | Recommended | Registrar-dependent | Varies by TLD/registrar |

### Practical baseline budget

A reasonable early commercial production baseline before transaction fees is approximately:

```text
Vercel Pro                   $20/mo
Neon Free                     $0/mo
The Odds API 20K             $30/mo
JWT / official NBA API keys    $0/mo
Redis                          $0/mo
BALLDONTLIE optional           $0/mo
-------------------------------------
Baseline                     ~$50/mo
```

Using Neon Launch at its representative ~$15/month workload moves that baseline to roughly **$65/month**. Adding BALLDONTLIE GOAT for full NBA endpoints would add **$39.99/month**. Real cost can be higher from Vercel compute/traffic, database workload, Odds API quota requirements, payment volume, custom-domain fees, and any future source/provider additions.

---

# Vercel production deployment

## Important Vercel Services status

Vercel's current documentation describes Services as a **Private Beta available by request**. Services are designed to deploy multiple frontend/backend applications from one repository under one project/domain, which matches NEWNBA's React + Nest + FastAPI monorepo well, but access must be confirmed first.

### Repository import

Use:

```text
Repository: joeydd032995-pixel/NEWNBA
Production branch: main
Root Directory: ./   (repository root; leaving it blank also means repo root)
```

Do **not** set the whole project root to only `frontend/` if the goal is a single multi-service deployment.

Conceptual service roots:

```text
frontend   → frontend/
backend    → backend/
nba-data   → nba-data/
```

Conceptual public routing:

```text
/api/*  → backend
/*      → frontend
```

The backend should receive an internal `NBA_DATA_URL` binding/URL for the sidecar.

### Required Vercel settings

1. **Git** — connect the GitHub repository and use `main` as production branch.
2. **Environment Variables** — add production secrets/config from the matrix above.
3. **Marketplace / Storage** — install/connect Neon and ensure `DATABASE_URL` reaches the backend.
4. **Domains** — attach production custom domain when ready.
5. **Deployment Protection** — production login/pricing/public pages must be publicly reachable; keep preview protection separately if desired.
6. **Services access** — confirm Vercel Services is enabled before relying on a one-project multi-service config.
7. **Scheduler design** — confirm lifecycle behavior or move critical schedulers to durable Cron-triggered endpoints.

### Same-domain API recommendation

Prefer:

```env
VITE_API_URL=/api
FRONTEND_URL=https://your-production-domain.com
```

This avoids maintaining a separate public API origin and reduces cross-origin cookie/CORS complexity.

### Vercel environment-variable scopes

Secrets such as `DATABASE_URL`, JWT secrets, `ODDS_API_KEY`, `BALLDONTLIE_API_KEY`, and Stripe secrets should be scoped to **Production** and marked sensitive. Add separate preview/test values only when preview deployments genuinely need external providers; do not reuse live billing credentials in untrusted preview environments.

Vercel applies environment-variable changes only to new deployments, so redeploy after updates.

---

# Production blockers and known limitations

The Opportunity-First foundation is large and validated, but the following items must not be misrepresented as complete:

## Deployment blockers / operational work

1. **Production Prisma command:** replace/review any production `prisma db push --accept-data-loss` path and use `prisma migrate deploy`.
2. **Vercel Services access:** Services is Private Beta/access-by-request as of this documentation snapshot.
3. **Schedulers:** verify long-running/persistent scheduler guarantees or externalize critical cron execution.
4. **Full-stack deployment verification:** a frontend-only preview is not proof that backend, sidecar, database, auth, billing, jobs, and ingestion are production-ready.
5. **Production protection:** ensure the public production deployment is not unintentionally Vercel-auth protected.
6. **Secret configuration:** live odds, billing, JWT, database, and sidecar configuration must be present before the related features are considered live.

## Data/model gaps

1. Verified arena coordinates, IANA time zones, altitude, and derived travel distance are still missing.
2. Granular defensive switch/drop/blitz/trap/zone frequencies and primary-defender assignments are not yet backed by a trustworthy in-repo source.
3. Referee tendency history still needs trustworthy exact historical referee↔event linkage and sample-size controls.
4. Spread → blowout/minutes-loss effects require exact historical calibration.
5. Foul-risk modeling needs richer trustworthy foul/opponent context.
6. Automated role classification can be improved beyond current rotation/opportunity inputs.
7. Team-total identity still lacks a fully first-class team-subject relationship in all market paths.
8. Official team communications, coaching announcements, and attributable beat/national reporter ingestion remain partial.
9. Richer on/off redistribution deltas remain unavailable where the official source does not expose the necessary inputs directly.
10. Historical ambiguous tracking zeros require source-backed re-ingestion; they cannot safely be mass-rewritten.

## Settlement gaps

Automatic tracked settlement is currently complete for exact player props only. Verified adapters are still needed for moneyline, spread, game total, team total, first-half, first-quarter, and generic derivative markets. Operator-specific rules such as dead heats, void policies, and later sportsbook resettlement require sportsbook-aware adapters rather than generic assumptions.

## Legacy cleanup

Some older scheduler/stat routines remain for compatibility but are no longer trusted to create exact StatLines. The central Prisma write guard protects new writes; those legacy generic-anchor fetch paths should still be removed/disabled for efficiency and clarity.

---

## Development

### Docker

```bash
cp .env.example .env
docker compose up --build
```

Docker Compose automatically merges `docker-compose.override.yml`, which selects the production Opportunity-First sidecar configuration.

> Local Compose still contains development conveniences that are **not** production deployment guidance, including `db push --accept-data-loss` and seeded development behavior.

### Backend

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm test -- --runInBand
npm run build
npm run start:dev
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Production sidecar locally

```bash
cd nba-data
pip install -r requirements.txt
uvicorn production_app:app --host 0.0.0.0 --port 8000
```

### Local URLs

```text
Frontend:     http://localhost:5173
Backend API:  http://localhost:3000/api
Swagger:      http://localhost:3000/api/docs
NBA sidecar:  http://localhost:8000
```

---

## Validation and CI

The Opportunity-First GitHub Actions workflows validate the major build/runtime boundaries. A production-affecting PR should observe actual green checks rather than assuming correctness from workflow presence.

Expected validation includes:

```bash
# Backend
cd backend
npx prisma validate
npx prisma generate
npm test -- --runInBand
npm run build

# Migrations
npx prisma migrate deploy

# Frontend
cd ../frontend
npm ci
npm run build

# Sidecar
cd ../nba-data
python -m compileall .
python -c "from production_app import app; print(app)"

# Compose
cd ..
docker compose config
```

Hardening tests cover empirical SGP modeled/unmodeled behavior, same-event independence refusal, exact tracked settlement, singles vs parlay accounting, source credibility, exact StatLine resolution, recommendation snapshots, schedule density, shot-profile matching, CLV, rotation/replacement, referee, milestone, projection, source-quality, and bias controls.

---

## Post-deploy verification

A deployment is not production-complete until all of the following are verified against the real production URL and production database:

- public frontend loads without Vercel account authentication;
- `/api` routing reaches Nest;
- `/api/docs` is reachable only according to intended security posture;
- signup/login/logout/refresh cookies work on the production domain;
- JWT secrets are production-only and not default placeholders;
- Prisma migrations completed successfully;
- database writes persist across deployments;
- Nest can reach `NBA_DATA_URL`;
- official injury sync succeeds or degrades explicitly;
- live odds sync succeeds with a valid `ODDS_API_KEY`;
- no synthetic odds/public-betting evidence appears when providers are unavailable;
- Player Props loads exact book/line/price provenance;
- Opportunity-First `/opportunity` route respects plan gating;
- tracked single submission persists correctly;
- true parlay submission stores one ticket stake and correct leg provenance;
- exact player-prop settlement works on a completed known event;
- unsupported non-player settlement remains pending instead of guessed;
- closing-line capture writes comparable close data;
- performance reporting does not double-count parlay legs;
- Stripe Checkout opens with live Price IDs when billing is enabled;
- Stripe live webhook signature verification succeeds;
- subscription update/delete events update plan state;
- critical background jobs actually execute in the chosen production runtime;
- logs contain no secrets or full database credentials;
- production, preview, and development secret scopes are separated.

---

## Safety and betting language

NEWNBA is probabilistic decision software. It does not label wagers as guaranteed, locks, sure things, or free money. A positive-EV estimate can lose and a negative-EV wager can win. Model quality must be judged over calibrated samples, price sensitivity, source quality, CLV, and long-run decision quality—not whether one ticket won.

The application should continue to prefer `PASS` or `WAIT` when required evidence, price quality, empirical coverage, or uncertainty calibration does not support a defensible wager.
