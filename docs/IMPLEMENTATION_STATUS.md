# Opportunity-First Implementation Status

Branch: `agent/opportunity-priority-2`  
Draft PR: #46  
Baseline: merged `main` at `b90192e12cd2ed712d6f39fc996411e3d3f9faff`

This status is deliberately conservative: a requirement is complete only when it exists in an execution path and has passed the repository validation matrix. Fields or standalone helpers alone do not count.

## Phase 0 — Audit & Baseline

**Status: COMPLETE**

- Gap audit completed in `docs/GAP_AUDIT.md`.
- Existing EV, arbitrage, optimizer, ensemble and A/B functionality preserved.
- Post-merge CI now materializes the current `main` schema and marks current-main migrations applied before exercising only PR-additive migrations.

## Phase 1 — Core Data Model & Ingestion

**Status: MAJOR FOUNDATION COMPLETE / EXTERNAL DATA GAPS REMAIN**

Completed persistence and execution paths include:

- exact wager market/event/book/line/price provenance
- closing price/line and CLV
- confidence, decision, direction, prop type and season phase
- explicit `SINGLE_BATCH` versus `PARLAY` wager structure
- per-leg settlement status, actual value, source and settlement time
- ticket-level parlay stake/payout/P&L
- immutable wager projection snapshots
- referee assignments/metrics
- game environment and schedule-density context
- official/expected lineups and rotations
- availability and injury replacement projections
- opportunity tracking, shot profiles and play types
- five-man lineup/on-off data
- post-bet reviews and performance slices
- raw injury/news source tier and data-quality metadata

Completed ingestion/integrity work:

- official NBA injury-report adapter with ESPN fallback demoted below official evidence
- official stats.nba.com tracking, play-type, lineup/on-off and shot-location adapters
- official NBA referee assignments
- current NBA team-profile arena identity adapter for `arenaName` and `arenaCity`
- dynamic season resolution
- simulated public-betting evidence removed
- synthetic odds persistence removed
- catch-and-shoot/pull-up missing values now persist as `null`, not observed zero
- exact StatLine resolver registered
- central Prisma boundary rejects unverified StatLine mutations

Still incomplete because a verified granular source is not yet available in-repo:

- arena coordinates, IANA time zone and altitude
- travel-distance ingestion based on verified arena coordinates
- granular defensive switch/drop/blitz/trap/zone frequencies and primary-defender assignments
- referee tendency history calculated from trustworthy exact historical event linkage
- richer on/off redistribution deltas where the official endpoint does not expose the required fields directly

Historical catch-and-shoot/pull-up zeros are not rewritten because the prior schema cannot distinguish an actual zero from unavailable data. Re-ingestion from a known source is required to repair those rows honestly.

## Phase 2 — Projection & Simulation Engine

**Status: FUNCTIONAL CORE COMPLETE / CALIBRATION REMAINS**

Completed:

- deterministic seeded Monte Carlo
- FAST / STANDARD / DEEP modes
- Points/Rebounds/Assists/Threes/Turnovers/Steals/Blocks
- PRA/PR/PA/RA correlation-aware recombination
- stocks and DD/TD joint simulation
- Minutes × Opportunity × Conversion × Context equation
- possession-share and PPP adjustment
- game scripts and uncertainty decomposition
- alternate-line curves
- playable-to price/line
- PASS/WAIT/LEAN/BET/STRONG_BET
- BET_NOW/WAIT/PASS news decision layer
- source freshness/conflict and data-quality controls
- anti-duplication/anti-narrative bias checks
- historical hit rate remains context only

SGP hardening in PR #46:

- legacy hard-coded SGP correlation coefficients removed from runtime
- same-game player-prop dependence uses aligned trustworthy historical observations + empirical Pearson matrix + Gaussian copula
- minimum aligned-history coverage is enforced
- mixed/unmodeled same-game legs return `UNMODELED` and withhold correlation-adjusted probability/EV instead of substituting a heuristic
- standard parlay analysis refuses same-event independence assumptions

Remaining calibration work:

- spread → blowout/minutes-loss mapping needs exact historical calibration
- foul-risk layer needs trustworthy personal-foul/opponent context ingestion
- automated role classifier can be improved beyond current rotation/opportunity inputs

## Phase 3 — Market Coverage

**Status: SUBSTANTIALLY COMPLETE**

Implemented:

- moneyline/spread/game totals
- team totals
- first-half ML/spread/total/team total
- first-quarter ML/spread/total/team total
- player props and alternate player props
- points/rebounds/assists/threes/turnovers/steals/blocks/stocks
- PRA/PR/PA/RA
- double-double/triple-double
- derivatives enum/mapping support
- exact alternate lines/books preserved

Remaining model-quality gap:

- team-total markets still lack a dedicated first-class team subject relation; provider description/outcome identity remains the fallback.

## Phase 4 — Injury, Lineup & News Hierarchy

**Status: SOURCE HIERARCHY ACTIVE / FEED COVERAGE PARTIAL**

Completed:

- Tier-1 official NBA injury reports
- correct publication-time handling
- official-first availability resolution
- raw `InjuryReport.sourceTier` and `dataQuality`
- raw `NewsItem.sourceKey`, `sourceTier`, `sourceClass`, `dataQuality`
- explicit reporting classes for official NBA/team/coach, national reporter, beat reporter, aggregator and unknown
- unnamed ESPN headline feed remains aggregator/Tier 3
- unknown sources cannot self-promote by claiming Tier 1
- simulated reporting is rejected
- same-tier conflicts remain unresolved; higher-tier evidence can override lower-tier conflict

Remaining:

- actual official team communications ingestion
- dedicated coaching-announcement ingestion
- populated attributable national/beat reporter feed/registry across all teams

The hierarchy is wired; the missing work is source acquisition, not ranking logic.

## Phase 5 — Performance, Settlement, Attribution & Post-Bet Loop

**Status: CORE LOOP COMPLETE FOR EXACT PLAYER-PROP SETTLEMENT**

Completed:

- exact tracked wager persistence from Player Props UI
- explicit tracked-parlay persistence from Parlay Builder
- one ticket stake for parlays; zero leg stakes to prevent double counting
- automatic pre-tip closing-line capture
- deterministic price/line CLV
- immutable recommendation-time projection snapshot
- exact player-prop leg settlement from `eventId + playerId` StatLine only
- OVER/UNDER, stocks, combinations, DD and TD settlement
- push/void-aware parlay settlement
- independent-single payout aggregation
- unsupported final markets stay pending instead of being guessed
- performance dashboard consumes per-leg settlement for singles and ticket-level P&L for parlays
- parlay ticket P&L is never copied onto individual legs
- category ROI slices use independent settled wagers only
- post-bet review uses exact event linkage and recommendation-time snapshot minutes
- fixed-price assumptions such as universal -110 are not used for tracked financial performance

Remaining:

- verified automatic settlement adapters for non-player markets before they can leave `PENDING`
- operator-specific settlement exceptions such as dead-heats/resettlement require sportsbook adapters rather than generic assumptions

## Phase 6 — Frontend & API Surface

**Status: FUNCTIONAL CORE COMPLETE**

Implemented:

- `/opportunity` PRO-gated route
- decision board
- distribution/percentile view
- lineup/rotation view
- referee/environment view
- CLV/attribution view
- source/data-quality view
- Player Props exact tracked-wager handoff
- tracked singles drawer with independent-return accounting
- Parlay Builder exact leg/book/line provenance
- empirical SGP modeled/unmodeled state display
- multi-game leg accumulation
- true one-stake parlay persistence

Minor cleanup remaining:

- Player Props table markup can be simplified to avoid nested table-body fragments; builds currently pass.

## Phase 7 — Tests, Docs & Hardening

**Status: GREEN ON PR #46 CURRENT HEAD**

Current validation on commit `6351dfbebd5ff4f15dc64f8cbe5e499667dc219a`:

- Prisma schema validation — PASS
- Prisma client generation — PASS
- current-main baseline materialization — PASS
- PR additive migration deploy — PASS
- backend Jest suite — PASS
- Nest backend build — PASS
- Python sidecar compile — PASS
- production sidecar compile/import — PASS
- React frontend build — PASS
- merged Docker Compose configuration — PASS

Additional hardening tests cover:

- empirical SGP modeled/unmodeled behavior
- standard-parlay same-event refusal
- exact tracked settlement
- single-batch versus parlay accounting
- source credibility classification
- exact StatLine resolution
- recommendation snapshots
- schedule density
- shot-profile matching
- existing projection/source/bias/CLV/rotation/replacement/referee/milestone paths

## Current Integrity Invariants

1. Simulated public betting/reporting cannot be returned as verified evidence.
2. No synthetic odds are persisted when the odds provider is unavailable.
3. Player-prop model probability comes from Opportunity-First projection, not historical hit rate.
4. Official NBA injury evidence outranks reporting/aggregator fallback.
5. Missing tracking values are represented as missing when the schema can distinguish them.
6. Monte Carlo output is seeded/reproducible.
7. Financial performance uses actual tracked price/stake.
8. Same-game correlation-adjusted EV is withheld when empirical coverage is insufficient.
9. Unverified StatLine mutations are rejected at the Prisma boundary.
10. Automatic player-prop settlement requires exact event/player linkage.
11. True parlay P&L remains ticket-level; leg-level ROI is never invented.
12. Arena name/city may come from current official NBA team profiles; coordinates/time zone/altitude remain unset until independently verified.

## Remaining Priority Work Before Final Production Sign-Off

1. Add verified arena coordinates, IANA time zones, altitude and derived travel distance from an attributable source; do not infer or approximate them silently.
2. Add official team/coaching communications and attributable national/beat reporter ingestion.
3. Add verifiable granular defensive-scheme and primary-defender ingestion; otherwise leave those fields unpopulated.
4. Build empirical referee-tendency history only from trustworthy exact game/referee/event linkage.
5. Calibrate spread→blowout/minute-loss only after a sufficient exact-linked historical sample is available.
6. Add verified settlement adapters for remaining non-player markets.
7. Remove/disable legacy generic-anchor StatLine fetch routines in `JobsService` for efficiency; the central write guard already prevents them from corrupting new data.
8. Re-ingest historical tracking rows where missing-vs-zero provenance can be recovered from a known source.
