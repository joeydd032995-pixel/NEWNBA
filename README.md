# NEWNBA — Opportunity-First NBA Betting Intelligence

NEWNBA is an NBA betting analytics platform built around one governing rule:

> **Price a wager from current minutes, role, opportunity and uncertainty before looking at recent outcomes.**

The platform combines verified sportsbook markets, NBA data, probabilistic player projections, expected value, arbitrage detection, model optimization, CLV tracking and post-bet attribution in a NestJS + Prisma + React + Python FastAPI monorepo.

## Core principle

For player props, the source equation is:

```text
Expected Production
= Expected Minutes
× Opportunity Rate
× Conversion Rate
× Context Adjustment
× Pace Adjustment
× PPP Adjustment
```

Historical hit rate is **context only**. It is not used as the estimate of true probability in the Opportunity-First player-prop feed.

Full model definitions are documented in [`docs/MODELS.md`](docs/MODELS.md).

## Architecture

```text
NEWNBA/
├── backend/                    # NestJS API, Prisma, quant models, schedulers
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
│       ├── modules/
│       │   ├── analytics/
│       │   ├── arbitrage/
│       │   ├── data-ingestion/
│       │   ├── ev/
│       │   ├── parlay/
│       │   ├── player-props/
│       │   └── projection/
│       └── services/
│           ├── background-jobs/
│           ├── nba-data/
│           └── odds-api/
├── frontend/                   # React 18 + TypeScript + Tailwind
├── nba-data/                   # FastAPI sidecar wrapping official NBA data
├── docs/
│   ├── GAP_AUDIT.md
│   ├── IMPLEMENTATION_STATUS.md
│   └── MODELS.md
├── docker-compose.yml
└── docker-compose.override.yml # selects production Opportunity-First sidecar
```

## Existing platform capabilities preserved

The Opportunity-First work is additive. The existing platform still contains:

- EV feed
- cross-book arbitrage detection
- custom analytical models
- 12 preset analytical models
- genetic-algorithm optimization
- ensemble models
- A/B model testing
- saved filters and alerts
- bet slips and bankroll workflows
- live game infrastructure
- performance dashboards

## Opportunity-First projection engine

`backend/src/modules/projection/` contains deterministic, testable model primitives for:

- seeded Monte Carlo simulation
- FAST / STANDARD / DEEP analysis modes
- Points
- Rebounds
- Assists
- Threes
- Turnovers
- Steals
- Blocks
- Stocks
- PRA / PR / PA / RA
- Double-double probability
- Triple-double probability
- game scripts
- blowout sensitivity
- possession-share projections
- expected PPP context
- uncertainty decomposition
- empirical correlation
- alternate-line probability curves
- playable-to price and line calculation
- PASS / WAIT / LEAN / BET / STRONG BET classification
- BET NOW / WAIT / PASS news decisions
- source-quality and information-decay controls
- duplicate-evidence and anti-bias checks
- recommendation contradiction detection

Every simulation is seeded so identical inputs produce identical samples.

## Player-prop feed

The existing player-prop feed remains available and now prices props from the Opportunity-First assembler.

```http
GET /api/player-props/feed?mode=STANDARD
```

Supported analysis modes:

- `FAST` — slate screening
- `STANDARD` — default analysis
- `DEEP` — larger simulation / deeper candidate analysis

The response preserves existing market and EV fields while adding:

- projection mean and median
- p05/p10/p25/p50/p75/p90/p95
- uncertainty decomposition
- data-quality classification
- source/availability context
- Opportunity-First probability source
- decision classification
- confidence
- playable-to thresholds
- primary risk / contrarian case

Historical L5/L10/L15/L20 hit rates are explicitly marked contextual.

## Market coverage

First-class market types include:

### Game markets

- Moneyline
- Spread
- Total
- Team Total

### First half

- Moneyline
- Spread
- Total
- Team Total

### First quarter

- Moneyline
- Spread
- Total
- Team Total

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

Derivative market support remains additive through the `DERIVATIVE` market type.

## Sportsbook market data

The Odds API integration stores:

- exact sportsbook
- exact line
- exact American price
- active/open state
- historical line/price records
- odds snapshots

When the odds provider is unavailable, NEWNBA writes **no synthetic market data**.

The event-specific Odds API client uses the provider's single-event response contract, and expanded NBA market ingestion is isolated in `nba-market-ingestion.job.ts`.

## Source hierarchy

Material information follows this hierarchy:

1. **Tier 1 — Official**
   - NBA injury reports
   - NBA/stats.nba.com data
   - official team information when available
2. **Tier 2 — High quality**
   - established professional data providers
3. **Tier 3 — Reporting**
   - ESPN and reputable reporters
4. **Low priority**
5. **Simulated** — never eligible as verified evidence

The availability engine considers source tier, freshness and recent credible conflicts.

## Injury and availability

The production sidecar includes an official NBA injury-report adapter that discovers and parses the NBA's official timestamped PDF reports.

Important integrity rules:

- official report is Tier 1
- ESPN is fallback only
- `reportedAt` is publication/report time
- `returnEta` can never populate `reportedAt`
- unresolved or stale information lowers data quality
- availability is stored as a probability for the upcoming event

## NBA tracking / opportunity data

The FastAPI sidecar exposes official-data adapters for:

- player tracking
- drives
- passing
- rebounding
- catch-and-shoot
- pull-up shooting
- post touches
- paint touches
- Synergy play types
- five-man lineups
- player on/off

A scheduled backend ingestion job persists available official rows into typed Prisma models.

Some granular data remains explicitly incomplete; see `docs/IMPLEMENTATION_STATUS.md`.

## Rotations and injury replacement

Typed models exist for:

- expected and official lineups
- starter / bench state
- rotation order
- minutes floor / median / ceiling
- minutes standard deviation
- minutes uncertainty
- restrictions / load management / suspensions
- coach rotation tendencies
- closing lineups
- small-ball / double-big / bench-heavy lineups

Pure model engines implement:

```text
Projected Minutes
= Base Rotation Minutes
+ Role Adjustment
+ Injury/Restriction Adjustment
+ Game Environment Adjustment
```

Injury replacement redistributes separately:

- minutes
- usage
- ball handling
- rebound chances
- FGA
- 3PA
- defensive impact

## Lineups and on/off

Prisma supports:

- five-man lineup membership
- possessions
- minutes
- ORtg
- DRtg
- Net Rating
- Pace
- player on/off ORtg / DRtg / Net / Pace
- typed redistribution delta fields

Official-data ingestion currently fills the core lineup/on-off efficiency metrics. Redistribution deltas remain an implementation target until the necessary source inputs are present.

## Environment and referee models

The deterministic environment engine supports:

- rest hours
- back-to-back
- three games in four nights
- four games in six nights
- travel distance
- time-zone change
- altitude
- prior-game overtime
- previous-game minutes load
- rest advantage

The referee model supports sample-controlled:

- foul rate
- free-throw tendency
- pace impact
- interruption rate

Verified referee assignments and venue/geography ingestion must exist before these values can become actionable evidence.

## EV and vig

American odds are converted to implied probability. Two-way markets can be normalized to no-vig probabilities.

```text
EV per unit = Estimated Probability × Decimal Odds - 1
```

The EV layer records probability provenance. Player-prop model probability comes from the Opportunity-First projection system, not recent hit rate.

## CLV and tracked wagers

Tracked wager items can persist:

- sportsbook
- exact recommended line
- exact recommended price
- stake
- EV
- confidence bucket
- decision class
- prop type
- direction
- season phase
- closing line
- closing price
- line CLV
- price CLV

Price CLV:

```text
Recommended Decimal Odds / Closing Decimal Odds - 1
```

The bet-slip API exposes a closing-market capture endpoint for exact closes.

## Performance analytics

Financial performance uses actual wager stake and price. The old fixed `$100 at -110` assumption is not used for financial reporting.

Available slices include:

- confidence
- prop type
- direction
- season phase
- market type
- sportsbook

The dashboard also tracks:

- ROI
- win rate
- CLV rate
- average CLV
- average line CLV
- P&L
- Sharpe ratio
- max drawdown
- calibration

For integrity, category attribution currently uses single-item settled wagers unless leg-level settlement is unambiguous.

## Post-bet attribution

Automatic post-bet review can classify observed process errors such as:

- minutes projection error
- usage projection error
- rotation error
- pace error
- market timing error
- foul trouble
- blowout
- in-game injury
- unexpected coaching decision

The system does **not** automatically excuse a loss as variance when the required pregame evidence was never stored.

## Frontend Opportunity-First workspace

New frontend artifacts:

- `frontend/src/pages/OpportunityFirstPage.tsx`
- `frontend/src/lib/opportunityApi.ts`

The workspace contains views for:

- decision board
- projection distributions
- rotation / availability
- referee / environment context
- CLV / performance
- source hierarchy / data quality

The exact existing application route/navigation integration must be completed before this branch is merged; the current draft intentionally does not overwrite the established route tree blindly.

## Development

### Docker

```bash
cp .env.example .env
docker compose up --build
```

Docker Compose automatically merges `docker-compose.override.yml`, which selects `nba-data/Dockerfile.prod` and the production Opportunity-First FastAPI entrypoint.

### Backend

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm test -- --runInBand
npm run build
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Production sidecar

```bash
cd nba-data
pip install -r requirements.txt
uvicorn production_app:app --host 0.0.0.0 --port 8000
```

## Database migrations

The Opportunity-First branch contains additive migrations for:

- typed Phase 1 models
- purging legacy simulated public-betting rows
- expanding NBA market and player-prop enums

Do not use `prisma db push` as a replacement for committed migrations in production.

## Validation

GitHub Actions definitions validate:

- Prisma schema
- Prisma migrations
- backend tests
- backend build
- frontend build
- production sidecar import/compile
- merged Docker Compose configuration

A PR must not be merged based only on the presence of workflow files. The actual checks must be observed green.

## Implementation status

See [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for the conservative requirement-by-requirement state and remaining merge blockers.

## Safety / betting language

NEWNBA is probabilistic decision software. It does not label wagers as guaranteed, locks, sure things or free money. A positive-EV estimate can lose, and a negative-EV wager can win. Recommendation quality is evaluated at the exact line and price available when the decision was made.
