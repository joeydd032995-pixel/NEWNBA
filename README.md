# NBA Betting Analytics Platform

A production-ready sports betting analytics platform with genetic algorithms, ensemble models, A/B testing, and comprehensive NBA metrics.

## Features

### Analytics
- **12 Preset Models**: Balanced, Efficiency, Moreyball, Player Props, Defensive, SGP, Live Betting, Playoff, Back-to-Back, Home/Away, Momentum, Contrarian
- **NBA Formulas**: TS%, eFG%, Four Factors, Pythagorean Win%, BPM, RAPTOR, LEBRON
- **EV Calculator**: Expected value with Kelly Criterion sizing
- **Arbitrage Detection**: Real-time cross-book opportunity scanning

### Advanced Features
- **Genetic Algorithm Optimizer**: Population-based weight search (50-200 individuals, 50-100 generations)
- **Ensemble Models**: Weighted Average, Voting, Stacking, Boosting strategies
- **A/B Testing**: Statistical significance (Welch's t-test, p-values, confidence intervals)
- **Performance Tracking**: ROI, Sharpe Ratio, Win Rate, Calibration, Max Drawdown

### Infrastructure
- **Backend**: NestJS + TypeScript + PostgreSQL + Redis
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Recharts
- **Database ORM**: Prisma with 20+ models
- **Background Jobs**: Scheduled EV/arbitrage scans

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd nba-betting-platform

# Setup (interactive)
chmod +x setup.sh && ./setup.sh

# Or manually:
cp .env.example .env
docker-compose up -d
docker-compose exec backend npx prisma migrate dev
docker-compose exec backend npx ts-node prisma/seed.ts
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Swagger Docs: http://localhost:3000/api/docs

### Local Development

```bash
# Prerequisites: Node 20+, PostgreSQL 16, Redis 7

# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx ts-node prisma/seed.ts
npm run start:dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Demo Accounts

| Email | Password | Plan |
|-------|----------|------|
| free@test.com | Password123! | FREE |
| pro@test.com | Password123! | PRO |
| premium@test.com | Password123! | PREMIUM |

## API Documentation

Full Swagger documentation available at `/api/docs` when running.

### Key Endpoints

```
POST   /api/auth/signup          Register
POST   /api/auth/login           Login
POST   /api/auth/refresh         Refresh token

GET    /api/ev/feed              EV opportunities
POST   /api/ev/scan              Scan all markets

GET    /api/arbitrage/feed       Arbitrage opportunities
POST   /api/arbitrage/scan       Scan for arb

GET    /api/analytics/formulas/preset-models    12 preset models
POST   /api/analytics/models                    Create custom model
GET    /api/analytics/performance/:modelId      Model performance

POST   /api/analytics/optimization              Create GA run
GET    /api/analytics/optimization/:id          Get run details

POST   /api/analytics/ensemble                  Create ensemble
GET    /api/analytics/ensemble                  List ensembles

POST   /api/analytics/ab-tests                  Create A/B test
GET    /api/analytics/ab-tests/:id/analyze      Statistical analysis
```

## NBA Formulas

| Formula | Calculation |
|---------|-------------|
| True Shooting % | `PTS / [2 × (FGA + 0.475 × FTA)]` |
| eFG% | `(FG + 0.5 × 3P) / FGA` |
| Four Factors | `0.40×eFG% + 0.25×TOV% + 0.20×ORB% + 0.15×FTR` |
| Pythagorean | `PF^13.91 / (PF^13.91 + PA^13.91)` |
| Kelly Criterion | `f* = (bp - q) / b` |
| EV | `(trueProb × win) - (lossProb × stake)` |

## Architecture

```
nba-betting-platform/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          JWT + refresh tokens
│   │   │   ├── analytics/     NBA formulas, models, GA, ensemble, A/B
│   │   │   ├── ev/            EV calculation
│   │   │   ├── arbitrage/     Arbitrage detection
│   │   │   ├── sports/        Sports/teams/players/events
│   │   │   └── prisma/        Database service
│   │   └── services/
│   │       └── background-jobs/  Scheduled scans
│   └── prisma/
│       ├── schema.prisma      20+ models
│       └── seed.ts            Demo data
├── frontend/
│   └── src/
│       ├── pages/             All UI pages
│       ├── components/        Layout, BetSlip
│       ├── stores/            Zustand state
│       └── lib/api.ts         Axios + JWT interceptor
├── docker-compose.yml
├── .env.example
└── setup.sh
```

## Genetic Algorithm

The GA optimizer evolves model weights to maximize a fitness function:

```
fitness = 0.40×ROI + 0.30×WinRate + 0.20×SharpeRatio + 0.10×Calibration
```

**Parameters:**
- Population Size: 50-200 individuals
- Max Generations: 50-100
- Mutation Rate: 0.01-0.3 (Gaussian)
- Crossover Rate: 0.6-0.9 (single-point)
- Elitism Count: 1-5 (preserved from prior generation)

## Ensemble Strategies

| Strategy | Method |
|----------|--------|
| Weighted Average | `Σ(weight × prob) / Σweight` |
| Voting | Confidence-weighted majority vote |
| Stacking | Logit-space linear combination (meta-learner) |
| Boosting | Sequential with AdaBoost-style reweighting |

## Statistical Testing (A/B Tests)

Uses Welch's t-test for unequal variances:
- t-statistic calculation
- Approximate p-value via Beta function
- Confidence intervals
- Automatic winner determination at significance threshold
