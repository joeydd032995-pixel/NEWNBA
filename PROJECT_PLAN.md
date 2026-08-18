# NEWNBA Opportunity-First Project Plan

## Mission

Transform NEWNBA into a production-grade NBA betting intelligence platform in which every actionable player-prop recommendation is produced from current minutes, role, opportunity, conversion, game context, uncertainty and exact sportsbook price.

The system is not complete merely because a metric exists in Prisma. A requirement is complete only when:

1. verified data can reach the model,
2. the model calculation is deterministic/testable,
3. uncertainty is exposed,
4. the API exposes the result,
5. the UI can communicate the result when required,
6. validation gates pass.

## Success criteria

- Opportunity Equation is the player-prop source of truth.
- Historical hit rates are contextual only.
- Exact sportsbook, recommendation line/price, closing line/price and CLV are first-class.
- PASS / WAIT / LEAN / BET / STRONG BET are generated from model-vs-market disagreement after uncertainty.
- Official NBA sources outrank ESPN/reporting.
- No simulated public-betting values are treated as evidence.
- No synthetic odds are created on provider failure.
- Every simulation is seeded and reproducible.
- A new engineer can trace a recommendation from source data to final decision.

## Phase 0 — Audit & baseline

**State: complete**

Deliverables:

- `docs/GAP_AUDIT.md`
- current schema/service/endpoint map
- baseline frozen before additive migrations
- existing EV/arbitrage/optimizer/ensemble/A-B functionality preserved

Identified critical baseline issues included simulated betting fallback, stale season defaults, injury timestamp misuse, hit-rate-as-probability, fixed -110 performance assumptions and hardcoded SGP correlations.

## Phase 1 — Core typed data model and ingestion

**State: major foundation complete; source coverage partial**

### Completed typed models

- Referee / assignment / metrics
- GameEnvironment
- GameLineup / players
- RotationProjection
- CoachRotationTendency
- PlayerAvailabilityProjection
- PlayerOpportunityStat
- PlayerShotProfile
- PlayerPlayTypeStat
- TeamDefensiveSchemeStat
- DefensiveMatchupAssignment
- FiveManLineup / players / stats
- PlayerOnOffStat
- InjuryReplacementProjection
- PostBetReview
- PerformanceSlice

### Completed wager fields

- sportsbook
- recommendation line
- recommendation price
- closing line
- closing price
- price CLV
- line CLV
- direction
- confidence bucket
- decision class
- prop type
- season phase

### Completed integrity work

- simulated public-betting fallback removed
- legacy simulated rows purged by migration
- synthetic sportsbook fallback removed
- dynamic NBA season resolution
- official-first injury ingestion
- injury report timestamp no longer accepts return date
- official tracking/play-type/lineup/on-off adapters
- scheduled typed opportunity ingestion

### Remaining Phase 1 source work

- official shot-location feed for rim / midrange / corner-3 / above-break-3
- verified granular switch/drop/blitz/trap/zone feed
- primary defender assignments
- automated referee assignments
- arena/geography ingestion
- automated RotationProjection persistence for every scheduled player
- automated injury-replacement persistence/recalculation after availability changes
- richer on/off redistribution deltas

## Phase 2 — Projection and simulation

**State: functional core complete; calibration ongoing**

### Completed

- FAST / STANDARD / DEEP modes
- deterministic seeded RNG
- Points / Rebounds / Assists / Threes / Turnovers / Steals / Blocks
- possession-share opportunity path
- expected PPP adjustment
- game scripts
- blowout/minutes sensitivity primitive
- mean / median / standard deviation
- p05 / p10 / p25 / p50 / p75 / p90 / p95
- uncertainty decomposition
- alternate-line curves
- empirical correlation matrix
- Gaussian-copula correlated recombination
- PRA / PR / PA / RA independent components
- Stocks distribution
- Double Double / Triple Double joint simulation
- playable-to line/price
- no-vig market probability
- EV
- PASS / WAIT / LEAN / BET / STRONG BET
- BET NOW / WAIT / PASS
- source freshness/credibility/conflict
- duplicate-evidence control
- anti-bias flags
- recommendation contradiction detector
- live player-prop feed uses Opportunity-First probability

### Calibration backlog

- empirically fit blowout probability vs spread and starter-minute loss
- personal foul / foul-trouble calibration
- player-role automatic classifier
- context multipliers from tracked defensive scheme once provider coverage exists

## Phase 3 — Market coverage

**State: substantially complete**

### Added

- TEAM_TOTAL
- first-half ML / spread / total / team total
- first-quarter ML / spread / total / team total
- PLAYER_PROP_ALTERNATE
- DERIVATIVE
- TURNOVERS
- STOCKS
- DOUBLE_DOUBLE
- TRIPLE_DOUBLE

### Completed ingestion work

- explicit NBA provider-key mapping
- event-market client contract corrected
- scheduled expanded-market ingestion
- alternate-line identity preserved

### Remaining

- add typed team subject identity directly to team-total markets in a future additive schema revision instead of relying on description/outcome subject encoding.

## Phase 4 — Availability, lineups, news and source hierarchy

**State: partial**

### Completed

- Tier-1 official NBA injury PDF discovery/parser
- Eastern publication timestamp normalization
- ESPN fallback only
- source hierarchy
- information decay
- source conflict detection
- expected availability probability
- upcoming-event availability persistence

### Remaining

- official team communication ingestion
- coaching announcement feed
- national/beat reporter registry
- raw source-tier fields on injury/news rows
- automated official lineup feed
- confirmed referee assignment feed

## Phase 5 — CLV, performance and post-bet loop

**State: major core complete; automation partial**

### Completed

- exact tracked recommendation market
- closing-market capture endpoint
- deterministic price and line CLV
- financial performance from actual stake/price
- fixed -110 assumption removed
- slices by confidence / prop / direction / season phase / market / book
- post-bet review model
- conservative deterministic error attribution
- scheduled process-review job

### Remaining

- automatic final pre-tip closing snapshot
- snapshot model projection/minutes/usage/pace directly on wager at recommendation time
- leg-level parlay settlement
- richer post-bet matchup/rotation comparison from fully persisted pregame context

## Phase 6 — Frontend and API surface

**State: components added; exact route integration pending**

### Added

- `frontend/src/pages/OpportunityFirstPage.tsx`
- `frontend/src/lib/opportunityApi.ts`

Workspace views:

- Decision Board
- Distribution Explorer
- Lineup & Rotation
- Referee & Environment
- CLV & Attribution
- Data Quality / Source Hierarchy

### Existing API enhancements

- projection endpoint
- Opportunity-First player-prop feed
- FAST / STANDARD / DEEP feed modes
- closing-market capture
- projection metadata and decision fields

### Remaining before merge

- integrate page into exact existing router/navigation tree without removing existing routes
- add direct environment/referee/rotation detail endpoints as source ingestion matures
- expose recent post-bet review records through an additive controller
- complete responsive visual QA after route integration

## Phase 7 — Tests, docs and hardening

**State: substantial test/documentation assets added; execution verification pending**

### Test coverage added

- Monte-Carlo reproducibility
- distribution / alternate-line behavior
- decision gate
- source hierarchy / freshness / conflict
- duplicate evidence / contradiction
- CLV
- NBA market mapping
- milestone simulation
- rotation minutes
- injury replacement
- environment / travel / schedule
- referee effect shrinkage
- post-bet attribution
- full Opportunity Equation pipeline integration

### Documentation

- `README.md`
- `CLAUDE.md`
- `PROJECT_PLAN.md`
- `docs/GAP_AUDIT.md`
- `docs/MODELS.md`
- `docs/IMPLEMENTATION_STATUS.md`

### CI assets

- backend/Prisma/test/build workflow
- frontend build workflow
- production sidecar compile/import workflow
- Docker Compose config validation

### Docker

`docker-compose.override.yml` selects `nba-data/Dockerfile.prod`, which runs the production sidecar with the official injury and Opportunity-First routers.

### Required final validation

Before merge:

1. observe Prisma migration job green
2. observe backend tests green
3. observe backend build green
4. observe frontend build green
5. observe production sidecar import green
6. observe Docker Compose config/build green
7. run visual QA on the routed Opportunity-First workspace
8. validate representative live-data ingestion with real provider credentials

## Priority execution queue

### P0 — merge blockers

1. exact frontend route/nav integration
2. automated rotation projection persistence
3. availability-triggered injury replacement recalculation
4. official referee assignment + arena/environment ingestion
5. automatic closing line capture
6. recommendation-time pregame projection snapshots
7. CI/Docker run verification

### P1 — model completeness

1. shot-location ingestion
2. defensive scheme / primary defender data
3. empirical blowout calibration
4. foul-risk calibration
5. on/off redistribution deltas
6. team-total typed team subject

### P2 — operational polish

1. direct source-quality admin viewer
2. richer post-bet diagnostics
3. multi-leg settlement attribution
4. performance slices by playoffs/regular season when schedule phase is fully tagged
5. visual QA and accessibility pass

## Engineering rules

- Additive migrations.
- Pure functions for math.
- Seed all stochastic work.
- Do not invent provider data.
- Do not promote fallback reporting above official sources.
- Do not use hit rate as model probability.
- Do not report financial ROI without exact stake/price.
- Do not call a phase complete because the schema exists.
- Keep the draft PR unmerged until validation is observed green.

## Reference documents

- Mathematical contract: `docs/MODELS.md`
- Current conservative status: `docs/IMPLEMENTATION_STATUS.md`
- Baseline gap map: `docs/GAP_AUDIT.md`
- Agent engineering rules: `CLAUDE.md`
