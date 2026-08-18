# NEWNBA Opportunity-First Gap Audit

Baseline date: 2026-08-17
Baseline branch: `main`
Baseline commit: `63e2cfe46cf8026e272ccd5790dbbdcfa70f7f45`
Baseline Prisma schema blob: `720c9b91a90d76be2f12a2eb31e5091c11463371`

This audit is the Phase 0 baseline for the Opportunity-First implementation. It records what is already implemented, what is partially implemented, and what remains missing. Existing public API behavior must be preserved while the new system is added.

## Existing relevant Prisma models

- `Player`: team assignment, basic bio, active flag.
- `StatLine`: points, rebounds, assists, steals, blocks, turnovers, minutes, shooting fields, plus-minus, USG%, TS%, eFG%, BPM.
- `Event`: teams, start time, status, scores, period/time remaining, season.
- `Book`: sportsbook metadata.
- `Market`: event/sport/type/player/prop-stat metadata.
- `MarketOdds`: book-specific outcome, odds, line, open status, timestamps.
- `OddsHistory`: historical odds/line snapshots.
- `OddsSnapshot`: periodic persisted snapshots with book/outcome timestamps.
- `EVMetrics`: true probability, implied probability, EV, EV%, Kelly fraction.
- `ArbitrageOpportunity`: multi-book arbitrage legs/profit/expiry.
- `ModelPrediction`: predicted probability, confidence, result resolution.
- `ModelPerformance`: ROI, win rate, Sharpe, calibration, EV, drawdown.
- `BetSlip` / `BetSlipItem`: wager grouping, odds, stake, EV, status.
- `InjuryReport`: injury status, description, return ETA, source, reported time.
- `NewsItem`: source-linked player/team news.
- `PublicBettingSplit`: ticket and money percentages plus source/timestamp.
- `Alert` / `Notification`: includes line-movement and injury alert categories.
- `ExpertPick`: manual/external pick metadata.
- Existing analytics models (`CustomModel`, `EnsembleModel`, optimization and A/B models) are preserved and remain consumers of future Opportunity-First projections.

## Existing relevant services and jobs

- `backend/src/services/odds-api/odds-api.service.ts`
  - Fetches NBA moneyline, spread, total and per-event prop markets from The Odds API.
  - Preserves bookmaker and market `last_update` metadata in the upstream response shape.
- `backend/src/services/nba-data/nba-data.service.ts`
  - Calls the FastAPI sidecar for active rosters, game logs, season stats, current games and player info.
- `nba-data/main.py`
  - Wraps `nba_api` for roster/game-log/season/player data.
  - Also currently fetches injuries and news from unofficial ESPN endpoints.
- `backend/src/services/background-jobs/jobs.service.ts`
  - Runs EV and arbitrage scans every minute.
  - Runs odds sync every 30 minutes.
  - Runs NBA / BallDontLie stat syncs daily.
  - Persists odds history and player prop markets.
- `backend/src/modules/data-ingestion/data-ingestion.service.ts`
  - Creates 15-minute odds snapshots.
  - Detects material recent price movement by implied-probability change.
- `backend/src/modules/data-ingestion/injury-ingest.service.ts`
  - Persists injury status and metadata.
- `backend/src/modules/data-ingestion/news-ingest.service.ts`
  - Persists recent NBA news.
- `backend/src/modules/data-ingestion/public-betting.service.ts`
  - Attempts Action Network public splits.
  - **Integrity blocker:** currently creates random simulated splits when the request fails.
- `backend/src/modules/player-props/player-props.service.ts`
  - Supports points, rebounds, assists, steals, blocks, threes, PRA, PR, PA, RA and minutes stat computation.
  - Provides L5/L10/L15/L20 hit rates, home/away, B2B/rest, H2H and coarse opponent-defense tiers.
  - **Modeling blocker:** recent hit rate is currently used as a probability input for prop EV in the feed.
- `backend/src/modules/analytics/analytics.service.ts`
  - Implements TS%, eFG%, Four Factors, Pythagorean, usage, Net Rating, implied probability, no-vig, EV and Kelly.
  - Includes simplified BPM/RAPTOR/LEBRON proxy calculations and weighted team probability models.
- `backend/src/modules/ev/ev.service.ts`
  - Computes cross-book positive EV.
  - **Modeling blocker:** when no model override is supplied, "true probability" is derived from best-book no-vig market odds rather than an independent projection.
- `backend/src/modules/arbitrage/*`
  - Existing arbitrage scan/feed retained.
- `backend/src/modules/parlay/parlay.service.ts`
  - Existing SGP analysis with pairwise correlation rules.
  - **Modeling blocker:** correlation coefficients are heuristic constants rather than empirical/simulated correlation estimates.
- `backend/src/modules/analytics/performance-tracking.service.ts`
  - Tracks resolved predictions and aggregate performance.
  - **Tracking blocker:** one model-performance path assumes $100 bets at -110 instead of actual wager prices.
- `backend/src/modules/live/*`
  - Existing live-game surface retained.

## Existing relevant API endpoints

### Player props
- `GET /player-props/feed`
- `GET /player-props/players`
- `GET /player-props/players/:playerId/cheat-sheet`
- `GET /player-props/:marketId/analyzer`

### Data ingestion / movement / availability
- `POST /data-ingestion/trigger/full`
- `POST /data-ingestion/trigger/injuries`
- `POST /data-ingestion/trigger/news`
- `POST /data-ingestion/trigger/public-betting`
- `POST /data-ingestion/trigger/snapshot`
- `GET /data-ingestion/line-movements`
- `GET /data-ingestion/injuries/active`
- `GET /data-ingestion/news/recent`

### Existing platform surfaces retained
- EV feed/scan
- Arbitrage feed/scan
- Analytics/custom models
- Optimization
- Ensemble models
- A/B tests
- Performance dashboard
- Parlay/SGP analysis
- Live-game endpoints

## Gap matrix

Legend: `FULL`, `PARTIAL`, `MISSING`, `BLOCKER`.

### Market and price layer

- Current sportsbook moneyline/spread/total: **FULL**.
- Cross-book odds and sportsbook identity: **FULL**.
- Player points/rebounds/assists/threes/steals/blocks: **FULL** for available upstream markets.
- PRA/PR/PA/RA analytical stat types: **FULL** internally; upstream market availability varies.
- Exact market line and odds: **FULL**.
- Historical odds snapshots: **FULL**.
- Opening-vs-current-vs-closing lifecycle: **PARTIAL**; history exists, closing-line semantics do not.
- Material line movement: **PARTIAL**; movement detection exists but is not news-causality aware.
- Team totals: **PARTIAL**; generic `TEAM_PROP` exists but no first-class team-total model.
- First-half markets: **MISSING**.
- First-quarter markets: **MISSING**.
- Turnover prop enum: **MISSING** although turnover box-score data exists.
- Stocks: **MISSING**.
- Double-double/triple-double: **MISSING**.
- Alternate-line probability curves: **MISSING**.

### Availability, lineup and rotation

- Active roster: **PARTIAL/FULL** from NBA sidecar, but season defaults are hard-coded in several paths.
- Injury status: **PARTIAL**.
- Official NBA injury report as Tier 1: **MISSING**.
- Correct injury `reportedAt`: **BLOCKER**; ESPN return date can currently be used as report time.
- Expected availability probability: **MISSING**.
- Official starting lineup: **MISSING**.
- Expected starting lineup: **MISSING**.
- Tonight starter/bench role: **MISSING**.
- Rotation/bench mapping: **MISSING**.
- Closing lineup/stagger/small-ball/double-big units: **MISSING**.
- Coach rotation tendencies: **MISSING**.
- Minutes restriction/load-management/suspension structure: **MISSING**.
- Minutes floor/median/ceiling/uncertainty: **MISSING**.

### Opportunity-first tracking data

- Historical minutes: **FULL**.
- FGA/FTA/3PA and basic usage: **FULL/PARTIAL**.
- Touches and touches/min: **MISSING**.
- Time of possession: **MISSING**.
- Drives and drives/min: **MISSING**.
- Paint/post touches: **MISSING**.
- Passes: **MISSING**.
- Potential assists and rate: **MISSING**.
- Rebound chances and contested rebound rate: **MISSING**.
- Shot quality / expected eFG: **MISSING**.
- Rim/midrange/corner-3/ATB-3 profiles: **MISSING**.
- Catch-and-shoot vs pull-up: **MISSING**.
- PnR/roll-man/isolation/post-up/handoff: **MISSING**.
- Transition/half-court split: **MISSING**.

### Defensive scheme / matchup

- Coarse opponent stat allowance ranking: **PARTIAL**.
- Switch/drop/blitz/trap/zone frequency: **MISSING**.
- Point-of-attack quality/help tendencies: **MISSING**.
- Primary defender assignment/cross-match: **MISSING**.
- Double-team rate: **MISSING**.
- Opponent shot-location allowance: **MISSING**.

### Lineup and on/off

- 5-man lineup ORtg/DRtg/Net/Pace/possessions: **MISSING**.
- Player on/off ORtg/DRtg/Net/Pace: **MISSING** as ingested data.
- Usage/assist/rebound/shot redistribution on/off: **MISSING**.

### Injury replacement

- Replacement-player identification: **MISSING**.
- Minutes redistribution: **MISSING**.
- Usage redistribution: **MISSING**.
- Ball-handling redistribution: **MISSING**.
- Rebound redistribution: **MISSING**.
- Shot-attempt redistribution: **MISSING**.
- Defensive consequence model: **MISSING**.
- Automatic affected-prop recalculation: **MISSING**.

### Projection and simulation

- Independent opportunity-first points model: **MISSING**.
- Rebounds model: **MISSING**.
- Assists model: **MISSING**.
- Threes model: **MISSING**.
- Turnovers model: **MISSING**.
- Steals/blocks distribution models: **MISSING**.
- Possession-adjusted opportunity projection: **MISSING**.
- Expected PPP matchup model: **MISSING**.
- Game-script scenarios: **MISSING**.
- Blowout probability/minutes sensitivity: **MISSING**.
- Foul-risk model: **MISSING**.
- Monte Carlo distributions: **MISSING**.
- Mean/median/percentiles: **MISSING**.
- Seeded/reproducible simulations: **MISSING**.
- Empirical SGP correlation: **MISSING**; current coefficients are heuristic.
- Uncertainty decomposition: **MISSING**.
- Playable-to calculator: **MISSING**.
- BET/WAIT/LEAN/PASS/STRONG BET engine: **MISSING**.
- BET NOW/WAIT/PASS news layer: **MISSING**.
- Data-quality score: **MISSING**.
- Anti-bias/duplicate-evidence/contradiction checks: **MISSING**.
- Role classification/information decay/research stopping: **MISSING**.
- FAST/STANDARD/DEEP modes: **MISSING**.

### Schedule, referee and environment

- B2B detection: **PARTIAL**.
- 3-in-4 / 4-in-6: **MISSING**.
- Prior-game OT/minutes load: **MISSING**.
- Travel distance/time-zone change: **MISSING**.
- Altitude: **MISSING**.
- Rest advantage: **MISSING**.
- Referee assignments and tendencies: **MISSING**.

### Source hierarchy and data integrity

- NBA.com/stats.nba.com player/stat source: **PARTIAL/FULL** through `nba_api`.
- Official NBA injury report: **MISSING**.
- Official team communication feed: **MISSING**.
- National/beat reporter hierarchy: **MISSING**.
- Source credibility tiers: **MISSING**.
- Conflicting-source detection: **MISSING**.
- Simulated public betting prevented from real evidence: **BLOCKER**; must be removed/isolated before agent use.
- Dynamic season handling: **BLOCKER**; `2024-25` defaults remain in nba-data and background sync paths.

### Performance / CLV / learning loop

- Bet result tracking: **PARTIAL/FULL**.
- Actual sportsbook stored per tracked wager: **MISSING** as a first-class bet field.
- Exact recommended line on tracked wager: **MISSING**.
- Closing line/price: **MISSING**.
- CLV and CLV aggregates: **MISSING**.
- Performance by confidence: **PARTIAL**.
- Performance by prop type: **MISSING/PARTIAL**.
- Over-vs-under performance: **MISSING**.
- Regular-season-vs-playoffs performance: **MISSING**.
- Structured post-bet review: **MISSING**.
- Error attribution (minutes/usage/rotation/matchup/pace/timing/variance): **MISSING**.
- Actual-price ROI in all paths: **BLOCKER/PARTIAL**; one prediction performance path assumes -110.

## Phase 0 integrity blockers

The following are not deferred feature gaps; they must be corrected before the new projection system is allowed to claim high data quality:

1. Simulated public-betting percentages must never be surfaced as verified market evidence.
2. Injury `reportedAt` must represent the source report time, never `returnDate`.
3. Hard-coded `2024-25` season defaults must be removed and replaced with a centralized dynamic NBA season resolver.
4. Prop EV cannot continue using recent hit rate as a defensible estimate of true probability once the Opportunity-First projection service is available.
5. Generic EV must accept Opportunity-First model probabilities as the preferred source instead of defaulting to market-derived no-vig probability for recommendations.
6. SGP correlation must migrate from hard-coded coefficients to empirical/simulated correlation estimates.
7. Performance calculations must use actual wager odds, lines and books rather than assumed -110 prices.

## Phase sequencing decision

- Phase 1 adds typed persistence first, including tracking/CLV, source quality, lineups/rotations, tracking opportunities, environment/referee, lineup/on-off and replacement structures.
- Phase 2 introduces a deterministic seeded projection/simulation engine and makes it the source of truth for player-prop probability.
- Phase 3 expands market enums and derivative coverage with migrations.
- Phase 4 replaces/augments ingestion with source-tiered official availability/news pipelines.
- Phase 5 closes the performance/CLV/error-attribution loop.
- Phase 6 exposes the complete API and frontend surfaces.
- Phase 7 validates reproducibility, integration, Docker boot and documentation.

No item in this audit is considered complete merely because a similarly named field exists. `FULL` means the existing implementation already provides the required semantics; `PARTIAL` means it can be reused but requires additional modeling, data or integrity controls.