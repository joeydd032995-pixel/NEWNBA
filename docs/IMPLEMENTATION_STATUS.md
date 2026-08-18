# Opportunity-First Implementation Status

Branch: `agent/opportunity-first`  
Draft PR: #45  
Baseline: `main` at `63e2cfe46cf8026e272ccd5790dbbdcfa70f7f45`

This file is deliberately conservative: a requirement is marked complete only when code exists in the execution path, not merely when a Prisma field or placeholder exists.

## Phase 0 — Audit & Baseline

**Status: COMPLETE**

- Gap audit: `docs/GAP_AUDIT.md`
- Baseline schema mapped and frozen before additive migrations.
- Existing EV, arbitrage, optimizer, ensemble and A/B modules preserved.

## Phase 1 — Core Data Model & Ingestion

**Status: PARTIAL / MAJOR FOUNDATION COMPLETE**

Completed typed persistence:

- exact wager line/book/closing line/closing price/CLV
- confidence, decision, prop type and season phase tracking
- referee assignments/metrics
- game environment
- official/expected lineups
- rotation projections and minutes ranges
- coach rotation tendencies
- player availability projections
- player opportunity tracking
- shot profiles
- play-type statistics
- defensive scheme and matchup assignments
- five-man lineups
- player on/off
- injury replacement projections
- post-bet reviews
- performance slices

Completed ingestion/integrity work:

- official stats.nba.com tracking adapters in `nba-data`
- official team lineup/on-off adapters
- scheduled Opportunity-First tracking/play-type/lineup/on-off ingestion
- official NBA injury PDF Tier-1 adapter
- ESPN injury fallback demoted to Tier 3
- injury report timestamp can no longer be populated from return date
- simulated public-betting persistence removed and legacy rows purged
- synthetic odds persistence removed in every environment
- dynamic season resolution replaces 2024-25 defaults

Still partial:

- shot-location rim/midrange/corner/ATB fields require a dedicated official shot-location adapter; current tracking ingestion populates catch-and-shoot and pull-up fields only.
- defensive scheme switch/drop/blitz/trap/zone and primary defender assignment still need a verified granular provider feed.
- on/off usage/assist/rebound/shot redistribution fields are typed but official ingestion currently fills ORtg/DRtg/Net/Pace first; redistribution deltas remain pending.
- current rotation projection engine exists as a pure tested model, but automated persistence for every scheduled player is not yet wired.
- referee assignment ingestion and arena/geography source ingestion remain pending; the deterministic calculation engines are complete.

## Phase 2 — Projection & Simulation Engine

**Status: FUNCTIONAL CORE COMPLETE / CALIBRATION PARTIAL**

Completed:

- deterministic seeded Monte Carlo
- FAST / STANDARD / DEEP modes
- independent Points/Rebounds/Assists/Threes/Turnovers/Steals/Blocks models
- Opportunity Equation
- possession-share opportunity mode
- expected PPP adjustment
- game scripts
- blowout/minutes sensitivity primitive
- distribution mean/median/percentiles
- alternate-line probability curves
- uncertainty decomposition
- empirical-correlation Gaussian-copula engine
- PRA/PR/PA/RA independent component recombination
- stocks distribution
- double-/triple-double joint threshold simulation
- playable-to calculator
- PASS/WAIT/LEAN/BET/STRONG_BET decision gate
- BET NOW / WAIT / PASS news layer
- LOW/MEDIUM/HIGH data quality
- source freshness/conflict engine
- anti-bias / duplicate-evidence control
- contradiction detector
- player-prop feed now uses Opportunity-First probability rather than historical hit rate

Still partial:

- spread-to-blowout mapping is transparent but requires historical calibration.
- foul-risk inputs require personal-foul ingestion before the model can be considered complete.
- role classification enum exists; automated classifier from tracking/usage profiles remains pending.
- research stopping rule exists in the standalone projection service; feed-level orchestration can be tightened further.

## Phase 3 — Market Coverage

**Status: SUBSTANTIALLY COMPLETE**

Added first-class market types:

- TEAM_TOTAL
- first-half ML/spread/total/team total
- first-quarter ML/spread/total/team total
- PLAYER_PROP_ALTERNATE
- DERIVATIVE

Added prop types:

- TURNOVERS
- STOCKS
- DOUBLE_DOUBLE
- TRIPLE_DOUBLE

Completed:

- documented The Odds API NBA market-key mapping
- scheduled expanded-market ingestion
- alternate lines preserved individually
- event-odds API parsing fixed to handle the provider's single-event response contract

Remaining:

- add typed `teamId` identity directly on team-total markets rather than relying on market description/outcome subject identifiers.

## Phase 4 — Injury, Lineup & News Hierarchy

**Status: PARTIAL**

Completed:

- Tier-1 official NBA injury-report PDF discovery/parser
- Eastern-time publication timestamp normalization to UTC
- official-first / ESPN-fallback ingestion
- expected availability probability
- source tier hierarchy
- freshness decay
- conflict detection

Remaining:

- official team communications feed
- national/beat reporter registry and ingestion
- dedicated coaching-announcement feed
- source tier fields should be added directly to raw `InjuryReport`/`NewsItem` records in a later additive migration; current availability projections already persist the resolved tier.

## Phase 5 — Performance, Attribution & Post-Bet Loop

**Status: MAJOR CORE COMPLETE / AUTOMATION PARTIAL**

Completed:

- exact wager sportsbook/line/price persistence
- closing line/price persistence endpoint
- deterministic line and price CLV
- CLV rate and average CLV dashboard calculations
- performance slices by confidence/prop/direction/season phase/market type/sportsbook
- removal of fake fixed -110 ROI calculations
- automatic conservative post-bet review job
- structured minutes/usage/pace/market-timing attribution rules

Remaining:

- automatic pre-tip closing-line capture from the final verified sportsbook snapshot
- store pregame projected statistic/minutes/usage/pace directly on the wager so post-bet attribution never needs to reconstruct them
- leg-level settlement for parlays before multi-leg category performance can be attributed honestly

## Phase 6 — Frontend & API Surface

**Status: NOT COMPLETE**

Backend API additions already present:

- Opportunity-First projection endpoint
- expanded player-prop feed
- exact closing-market capture endpoint
- Swagger DTOs for simulation modes and distribution inputs

Frontend pages still required:

- projection distributions / alternate curves
- lineup / rotation explorer
- referee / environment impact
- CLV / error attribution analytics
- decision engine
- source hierarchy / data-quality viewer

## Phase 7 — Tests, Docs & Hardening

**Status: PARTIAL**

Completed:

- projection reproducibility tests
- decision-gate tests
- source-quality tests
- anti-bias tests
- CLV tests
- market-mapping tests
- milestone tests
- rotation/replacement tests
- environment/referee tests
- post-bet attribution tests
- `docs/MODELS.md`
- CI workflow added for Prisma validation, migrations, backend tests/build and Python compile

Not yet independently verified in this environment:

- GitHub Actions completion status is not visible through the current connector response surface.
- Docker Compose end-to-end boot has not been demonstrated from this tool environment.
- Frontend build/test gate remains to be added to CI once Phase 6 code is wired.

## Current Integrity Invariants

1. Simulated public betting cannot be returned as verified evidence.
2. No synthetic odds are persisted when the odds provider is unavailable.
3. Player-prop `trueProb` is Opportunity-First model probability, not hit rate.
4. Official NBA injury information outranks ESPN fallback.
5. Missing tracking/rotation information lowers data quality instead of generating fake source data.
6. Every Monte-Carlo result is seeded/reproducible.
7. Model financial performance does not assume a universal -110 price.

## Blocking Work Before Merge

1. Phase 6 frontend surfaces.
2. Automatic rotation persistence / injury replacement recalculation pipeline.
3. Official referee assignments + arena/environment source ingestion.
4. Raw source-tier persistence improvements for injury/news.
5. Automatic closing-line capture and pregame projection snapshot on wagers.
6. Full CI/Docker verification.
7. README.md, CLAUDE.md and PROJECT_PLAN.md final architecture updates.
