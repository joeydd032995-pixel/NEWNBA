# CLAUDE.md — NEWNBA Engineering Contract

This repository is an **Opportunity-First NBA betting intelligence platform**. Any coding agent working here must preserve the integrity rules in this file.

## Non-negotiable architecture

Monorepo boundaries:

- `backend/` — NestJS, Prisma, deterministic projection/decision models, schedulers
- `frontend/` — React + TypeScript + Tailwind
- `nba-data/` — FastAPI adapters for official NBA data and explicitly ranked fallbacks

Do not create a second backend, separate database, or competing projection source of truth.

## Governing player-prop equation

All player-prop projections must reduce to:

```text
Expected Production
= Expected Minutes
× Opportunity Rate
× Conversion Rate
× Context Adjustment
× Pace Adjustment
× PPP Adjustment
```

Rules:

1. Minutes are projected before statistics.
2. Opportunity is preferred over recent outcome.
3. Conversion is modeled separately from opportunity.
4. Current role overrides stale season-average role.
5. Projection distributions are required; means alone are insufficient.
6. Exact sportsbook line and price are required for actionable EV.
7. Historical hit rate is context only and must never become `trueProb`.

See `docs/MODELS.md`.

## Source hierarchy

Use this order for material information:

1. `TIER_1_OFFICIAL`
   - official NBA injury reports
   - stats.nba.com / NBA API data
   - official team communications
2. `TIER_2_HIGH_QUALITY`
3. `TIER_3_REPORTING`
   - ESPN and reputable reporters
4. `LOW_PRIORITY`
5. `SIMULATED`

### Absolute data-integrity rules

- Simulated public-betting percentages are never valid evidence.
- Synthetic sportsbook lines/odds must never be written when a provider fails.
- Missing provider data must degrade to `LOW` quality or unresolved; never invent a plausible number.
- An injury `returnEta` must never populate `reportedAt`.
- Official injury information outranks ESPN fallback.
- If credible current sources conflict, expose the conflict and lower quality.
- Every decisive source should retain source identity and update time where the schema supports it.

## Information decay

Treat information by stability:

### Very fast decay

- injury status
- starting lineup
- minutes restriction
- spread / total
- prop line / price

### Moderate decay

- rotation
- role
- usage
- minutes trend

### Slow decay

- player archetype
- team scheme
- long-run efficiency
- coaching philosophy

Do not allow old fast-decay information to override a current lower-level projection silently.

## Analysis modes

Every projection path must support:

- `FAST` — screening
- `STANDARD` — default analysis
- `DEEP` — high-confidence/complex candidates

Current seeded Monte-Carlo defaults:

- FAST: 2,500 trials
- STANDARD: 10,000 trials
- DEEP: 40,000 trials

All randomized calculations require an explicit deterministic seed.

## Projection outputs

Every supported stat projection should expose:

- point estimate
- mean
- median
- standard deviation
- p05 / p10 / p25 / p50 / p75 / p90 / p95
- probability above/below an offered line
- uncertainty decomposition
- data-quality classification
- model/source provenance

When alternate lines are available, price the probability curve rather than assuming lower lines are automatically better.

## Current supported projection categories

Independent base models:

- Points
- Rebounds
- Assists
- Threes
- Turnovers
- Steals
- Blocks

Correlated/composite models:

- Stocks
- PRA
- PR
- PA
- RA
- Double Double
- Triple Double

PRA/PR/PA/RA must project components independently before empirical correlation recombination.

Double-/triple-double markets are joint threshold simulations, not hit-rate shortcuts.

## Decision engine

Allowed classifications:

- PASS
- WAIT
- LEAN
- BET
- STRONG_BET

News timing layer:

- BET_NOW
- WAIT
- PASS

`STRONG_BET` must require both meaningful modeled edge and sufficiently high data quality. Unresolved availability/lineup/minute restrictions must downgrade the decision.

Every actionable recommendation should have when supported:

- exact line
- exact price
- sportsbook
- model probability
- no-vig market probability
- EV
- fair line
- playable-to line/price
- confidence
- primary risk
- contrarian failure case

## Anti-bias rules

Do not count correlated statistics as independent evidence.

Examples that may share one signal:

- ORtg
- TS%
- eFG%

Evidence should be grouped by causal category where possible:

- minutes
- role
- opportunity
- usage
- matchup
- environment
- efficiency
- market price

Flag overreliance on:

- recent results
- historical hit rate
- narrative
- one evidence category

Run recommendation consistency checks before surfacing multiple bets from one game.

## Prisma rules

- Additive migrations only unless an explicit migration path is supplied.
- Every durable analytical field belongs in typed Prisma columns/models, not opaque JSON solely for convenience.
- Add indexes for event/player/team/time dimensions used in production queries.
- Keep existing public models and APIs compatible.
- Never use `prisma db push` as a substitute for committed production migrations.
- Preserve existing EV/arbitrage/optimizer/ensemble/A-B data.

## Market rules

Current first-class markets include:

- ML / spread / total / team total
- first-half ML / spread / total / team total
- first-quarter ML / spread / total / team total
- player props
- alternate player props
- derivative markets

Current prop enum includes:

- Points
- Rebounds
- Assists
- Steals
- Blocks
- Threes
- Turnovers
- Stocks
- Double Double
- Triple Double
- Minutes
- PRA / PR / PA / RA

If a provider adds a market key, map it explicitly and test the mapping. Unknown keys should be ignored rather than coerced incorrectly.

## Odds integrity

`OddsApiService.getOdds()` returns an event array.

`OddsApiService.getEventOdds()` returns one event object.

Do not regress this distinction.

Every market record used for a wager must retain:

- book
- outcome
- line if applicable
- odds
- open/closed state
- timestamps/history

## CLV

Tracked wagers must preserve their exact recommendation market before the close.

Price CLV:

```text
recommended decimal / closing decimal - 1
```

Line CLV is normalized so positive means favorable movement.

Do not infer a closing line after the fact if no verified close was captured.

## Financial performance

Never assume every prediction was `$100 at -110`.

Model predictions without exact price/stake may report calibration/win rate, but financial ROI/CLV must be calculated only from actual tracked wagers.

For multi-leg wagers, do not attribute leg-level performance unless individual leg settlement is explicitly stored.

## Post-bet review

Prioritize process error before variance.

Supported attribution categories include:

- minutes
- usage
- injury information
- rotation
- matchup
- pace
- efficiency
- market timing
- price
- variance
- foul trouble
- blowout
- in-game injury
- unexpected coaching decision

Missing pregame inputs remain unavailable; they are not silently marked correct.

## Environment and referee context

Pure deterministic models exist for:

- B2B
- 3-in-4
- 4-in-6
- rest hours/advantage
- travel distance
- time-zone change
- altitude
- prior overtime/load
- referee foul/FT/pace/interruption effects

These calculators require verified source inputs. Never make up an arena coordinate, referee assignment or travel origin.

Referee effects are supplementary and sample-shrunk. Never make them the primary handicap based on tiny samples.

## Injury replacement

Do not simply increase all teammates when a player is out.

Replacement components are allocated independently:

- minutes
- usage
- ball handling
- rebounding
- shot attempts
- three-point attempts
- defense

Use actual role affinity and minute capacity when available.

## API compatibility

Prefer additive endpoints and response fields.

Do not remove or rename existing EV, arbitrage, optimizer, ensemble, A/B, bet-slip or player-prop routes without a documented migration path.

The player-prop feed deliberately preserves historical response concepts such as `bestEV` and `outcomes` while adding Opportunity-First projection metadata.

## Frontend rules

Existing pages must remain functional.

New Opportunity-First views live in:

- `frontend/src/pages/OpportunityFirstPage.tsx`
- `frontend/src/lib/opportunityApi.ts`

Before merge, integrate the page into the existing route/navigation tree without replacing the existing routing contract.

All critical uncertainty and missing-source states must be visible in the UI; do not hide missing data behind zeros.

## Testing requirements

Every mathematical model must have deterministic unit tests.

Required gates:

- Prisma validate
- Prisma generate
- migrations apply cleanly
- backend unit/integration tests
- backend build
- frontend build
- Python module compile/import
- Docker Compose config

Seeded simulations must have reproducibility tests.

The full Opportunity Equation has an integration test covering:

```text
rotation minutes
→ opportunity inputs
→ simulation distribution
→ no-vig pricing
→ decision gate
```

## Docker

Default development command:

```bash
docker compose up --build
```

`docker-compose.override.yml` selects `nba-data/Dockerfile.prod`, which runs `production_app.py` with the official injury and Opportunity-First routes mounted.

Do not point production back to the legacy sidecar entrypoint accidentally.

## Documentation requirements

When changing a model equation:

1. update code comments
2. update/add deterministic tests
3. update `docs/MODELS.md`
4. update `docs/IMPLEMENTATION_STATUS.md` if phase status changes

When changing architecture or public use:

- update `README.md`
- update `PROJECT_PLAN.md`
- update this file when agent rules change

## Current implementation truth

Do not infer completion from typed schema alone.

The conservative current state is maintained in:

- `docs/GAP_AUDIT.md`
- `docs/IMPLEMENTATION_STATUS.md`

A feature should be described as complete only when it is in the real execution path and has validation coverage.

## Merge discipline

Work in reviewable chunks.

Do not merge the Opportunity-First draft PR until:

- existing routes are preserved
- frontend route/nav integration is complete
- source-dependent remaining feeds are either implemented or explicitly justified out of scope
- CI is observed green
- Docker Compose is verified
- migration path is reviewed
- no simulated betting evidence is reachable as real data

## Betting language

Do not use:

- lock
- guaranteed
- can't lose
- sure thing
- free money

Prefer:

- estimated edge
- positive expected value
- model disagreement
- price dependent
- uncertainty remains
- pass at current number

The purpose of NEWNBA is not to maximize the number of bets. It is to maximize decision quality at the exact available price.
