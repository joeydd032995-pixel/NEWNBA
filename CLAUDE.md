# CLAUDE.md — NEWNBA Codebase Guide

This file provides guidance for AI assistants working in the NEWNBA repository.

---

## Project Overview

NEWNBA is a full-stack sports betting analytics platform built around NBA data. It provides:
- Positive EV (expected value) detection across sportsbooks
- Arbitrage opportunity scanning
- Custom model building (genetic algorithm optimization, ensemble methods, A/B testing)
- NBA statistical formulas (True Shooting %, eFG%, Four Factors, Pythagorean Win %)
- Real-time data ingestion (odds, injuries, news, public betting splits)
- Player props, parlays, live betting, bankroll management

---

## Repository Structure

```
NEWNBA/
├── backend/          # NestJS + TypeScript API
├── frontend/         # React 18 + TypeScript UI
├── nba-data/         # Python FastAPI sidecar (stats.nba.com wrapper)
├── docker-compose.yml
├── .env.example
├── setup.sh
├── README.md
└── PROJECT_PLAN.md
```

---

## Technology Stack

### Backend (`/backend`)
| Concern | Tool |
|---|---|
| Framework | NestJS 10 (TypeScript) |
| Database | PostgreSQL 16 via Prisma 5 ORM |
| Cache/Queue | Redis 7 (ioredis) |
| Auth | JWT + Passport.js (access + refresh tokens via httpOnly cookies) |
| API Docs | Swagger at `/api/docs` |
| Scheduling | node-cron (`@Cron` decorators) |
| Validation | class-validator, class-transformer |
| HTTP | axios |
| Security | helmet, bcrypt (12 salt rounds) |
| Tests | Jest, supertest |

### Frontend (`/frontend`)
| Concern | Tool |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router 6 |
| State | Zustand 4 (with `persist` middleware) |
| Server State | TanStack React Query 5 |
| Styling | Tailwind CSS 3 (custom navy/gold/cyan theme) |
| Charts | Recharts |
| Icons | lucide-react |
| Notifications | react-hot-toast |
| HTTP | axios (centralized `src/lib/api.ts`) |

### Data Sidecar (`/nba-data`)
| Concern | Tool |
|---|---|
| Framework | FastAPI |
| NBA Data | nba_api (stats.nba.com) |
| Server | Uvicorn |

---

## Running the Project

### Docker (recommended)
```bash
cp .env.example .env        # fill in ODDS_API_KEY, etc.
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Swagger docs: http://localhost:3000/api/docs
- NBA Data sidecar: http://localhost:8000

### Local Dev
```bash
bash setup.sh               # interactive setup wizard
# OR manually:
cd backend && npm install && npx prisma db push && npm run db:seed && npm run start:dev
cd frontend && npm install && npm run dev
```

### Demo Accounts (seeded)
| Email | Password | Plan |
|---|---|---|
| admin@newnba.com | admin123 | PREMIUM |
| pro@newnba.com | pro123 | PRO |
| user@newnba.com | user123 | FREE |

---

## Database

Schema: `/backend/prisma/schema.prisma` (~785 lines, 30+ models)

### Key Model Groups
- **Auth**: `User` (planType: FREE | PRO | PREMIUM)
- **Sports Data**: `Sport`, `Team`, `Player`, `StatLine`, `Event`
- **Odds**: `Book`, `Market`, `MarketOdds`, `OddsHistory`, `OddsSnapshot`
- **Analytics**: `EVMetrics`, `ArbitrageOpportunity`
- **Models**: `CustomModel`, `ModelPrediction`, `ModelPerformance`
- **Ensemble/Optimization**: `EnsembleModel`, `OptimizationRun`, `ABTest`
- **User Features**: `Alert`, `Notification`, `BetSlip`, `SavedFilter`
- **Ingestion**: `InjuryReport`, `NewsItem`, `PublicBettingSplit`, `ExpertPick`

### Database Commands
```bash
# In /backend:
npm run db:push        # push schema without migration
npm run db:migrate     # create migration
npm run db:seed        # seed demo data
npm run db:studio      # open Prisma Studio GUI
```

### Conventions
- Table names: snake_case via `@@map()`
- Model names: PascalCase
- All models have `createdAt` / `updatedAt` timestamps
- UUIDs as primary keys: `@default(uuid())`
- JSON fields (`Json` type) for flexible metadata

---

## Backend Architecture

### Module Structure
Every feature is a NestJS module under `/backend/src/modules/`:
```
auth/           analytics/      ev/         arbitrage/
sports/         alerts/         betslip/    player-props/
data-ingestion/ expert-picks/   live/       parlay/
bankroll/       notifications/
```

Each module contains:
- `*.module.ts` — wires DI
- `*.controller.ts` — HTTP endpoints
- `*.service.ts` — business logic
- `*.dto.ts` — validated input shapes (class-validator)
- `*.spec.ts` — unit tests

### Global Setup (`app.module.ts`)
- API prefix: `/api`
- CORS: frontend URL from env
- Global pipes: `ValidationPipe({ whitelist: true, transform: true })`
- Rate limiting: Throttler (configurable via `THROTTLE_TTL` / `THROTTLE_LIMIT`)
- Security: Helmet headers

### Authentication Flow
1. `POST /api/auth/signup` or `POST /api/auth/login` → sets httpOnly cookies (`access_token`, `refresh_token`)
2. All protected routes require `JwtAuthGuard`
3. `POST /api/auth/refresh` → re-issues tokens using refresh token
4. `POST /api/auth/logout` → clears cookies

### Background Jobs (`jobs.service.ts`)
Scheduled via `@Cron(CronExpression.EVERY_MINUTE)`:
- EV calculation scan
- Arbitrage scan
- Odds API ingestion
- Injury sync
- News sync
- Public betting splits
- Alert evaluation

---

## Frontend Architecture

### Entry & Routing (`App.tsx`)
- All routes are wrapped in `ProtectedRoute` or `PublicRoute`
- Lazy-loaded pages via React Router 6

### Pages (17 total)
`DashboardPage`, `EVFeedPage`, `ArbitrageFeedPage`, `CustomModelsPage`, `PerformancePage`, `FormulasPage`, `OptimizationPage`, `EnsemblePage`, `ABTestingPage`, `AlertsPage`, `PlayerPropsPage`, `ExpertPicksPage`, `LiveBettingPage`, `ParlayBuilderPage`, `BankrollPage`, `LoginPage`, `SignupPage`

### State Management
- **Zustand stores** in `src/stores/`:
  - `auth.ts` — user session, login/logout
  - `betslip.ts` — bet slip items, odds calculation
  - `bankroll.ts` — bankroll tracking
- **React Query** — all server data fetching/caching (30s `staleTime`, no refetch on window focus)

### API Layer (`src/lib/api.ts`)
- Single axios instance with base URL from env
- Auto-refresh on 401: intercepts → calls `/auth/refresh` → retries original request
- Namespaced exports: `authApi`, `sportsApi`, `analyticsApi`, `evApi`, `arbitrageApi`, `alertsApi`, etc.

### Styling Conventions
- **Tailwind only** — no component-level CSS files
- Custom theme colors (defined in `tailwind.config.js`):
  - `navy-*` — background shades (#040812 to #233050)
  - `gold` — primary accent (#f59e0b)
  - `cyan` — secondary accent (#06b6d4)
- Custom shadows: `shadow-gold-sm`, `shadow-cyan-sm`, `shadow-card`, `shadow-card-hover`
- Custom animations: `pulse-gold`, `shimmer`, `slide-in-right`, `fade-in`
- Fonts: Inter (body), JetBrains Mono (code/numbers)

---

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

```bash
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nba_betting
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=<change-in-production>
JWT_REFRESH_SECRET=<change-in-production>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ODDS_API_KEY=<required-for-live-odds>
ODDS_API_BASE_URL=https://api.the-odds-api.com/v4
BALLDONTLIE_API_KEY=<optional>
NBA_DATA_URL=http://nba-data:8000   # docker; use http://localhost:8000 locally
THROTTLE_TTL=60
THROTTLE_LIMIT=100
LOG_LEVEL=debug
ACTION_NETWORK_ENABLED=true
INJURY_SYNC_ENABLED=true
NEWS_SYNC_ENABLED=true
ODDS_SNAPSHOT_INTERVAL_MIN=15
```

---

## Testing

### Backend
```bash
cd backend
npm run test           # all unit tests
npm run test:watch     # watch mode
npm run test:cov       # coverage report
npm run test:e2e       # end-to-end tests
```
- Test files: `**/*.spec.ts` under `src/`
- Existing tests: `analytics.service.spec.ts`, `arbitrage.service.spec.ts`

### Frontend
No test framework currently configured. ESLint is set up:
```bash
cd frontend
npm run lint
```

---

## Key Algorithms & Domain Logic

### EV Calculation
```
EV = (trueProb × potentialWin) − (lossProb × stake)
```
- True probability derived by removing vig from book odds
- `EVMetrics` stores `ev`, `evPct`, `trueProb`, `impliedProb`, `kellyFraction`

### Arbitrage Detection
- Fetch odds from multiple books for same market
- Arbitrage exists when: `Σ(1 / odds_i) < 1`
- `ArbitrageOpportunity` stores profit %, optimal stakes

### NBA Formulas (implemented in `analytics.service.ts`)
| Formula | Calculation |
|---|---|
| True Shooting % | `PTS / [2 × (FGA + 0.475 × FTA)]` |
| eFG% | `(FG + 0.5 × 3P) / FGA` |
| Four Factors | `0.40×eFG% + 0.25×TOV% + 0.20×ORB% + 0.15×FTR` |
| Pythagorean Win% | `PF^13.91 / (PF^13.91 + PA^13.91)` |
| Kelly Criterion | `f* = (bp − q) / b` |

### Genetic Algorithm (Optimization)
- Population: 50–200 individuals (model weight sets)
- Fitness: `0.40×ROI + 0.30×WinRate + 0.20×SharpeRatio + 0.10×Calibration`
- Selection: tournament, Crossover: single-point, Mutation: Gaussian
- Elitism: 1–5 individuals preserved per generation

### Ensemble Strategies
- `WEIGHTED_AVERAGE` — linear blend of predictions
- `VOTING` — confidence-weighted majority vote
- `STACKING` — logit-space combination
- `BOOSTING` — sequential correction weighting

### A/B Testing
- Welch's t-test (unequal variance)
- P-value via Beta function
- Automatic winner selection at configured significance threshold

### 12 Preset Models
`balanced`, `efficiency`, `moreyball`, `playerProps`, `defensive`, `sgp`, `liveBetting`, `playoff`, `backToBack`, `homeAway`, `momentum`, `contrarian`

---

## Code Conventions

### Backend
- **Naming**: `camelCase` for variables/methods, `PascalCase` for classes/interfaces, `UPPER_SNAKE_CASE` for constants/enums
- **File naming**: `kebab-case.type.ts` (e.g., `analytics.service.ts`, `create-model.dto.ts`)
- **DTOs**: always use class-validator decorators (`@IsString()`, `@IsNumber()`, `@IsOptional()`)
- **Guards**: apply per-controller or per-route via `@UseGuards(JwtAuthGuard)`
- **Swagger**: annotate controllers with `@ApiTags()`, `@ApiBearerAuth()`, `@ApiOperation()`, `@ApiResponse()`
- **Errors**: use NestJS built-in exceptions (`NotFoundException`, `ConflictException`, `UnauthorizedException`, `BadRequestException`)
- **Logging**: inject `Logger` from `@nestjs/common`, use `this.logger.log()` / `this.logger.error()`
- **Caching**: inject `CACHE_MANAGER` from `@nestjs/cache-manager`

### Frontend
- **Components**: functional only, PascalCase filenames
- **Hooks**: prefix with `use`, camelCase
- **API calls**: always go through `src/lib/api.ts` — never construct axios instances inline
- **Stores**: access via hooks (`useAuthStore()`, `useBetSlipStore()`)
- **Queries**: wrap in React Query `useQuery`/`useMutation`; set descriptive `queryKey` arrays
- **Types**: define interfaces in the same file or a co-located `*.types.ts`
- **Tailwind**: use `clsx` + `tailwind-merge` for conditional class composition

### Database
- New models: add to `schema.prisma`, run `npm run db:push` in dev or `npm run db:migrate` for tracked migrations
- Add `@@map("snake_case_table_name")` to every new model
- Add `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` to every new model
- Index frequently queried foreign keys with `@@index([fieldName])`

---

## Docker Services & Ports

| Service | Port | Notes |
|---|---|---|
| frontend | 5173 | Vite dev server / nginx prod |
| backend | 3000 | NestJS API (`/api` prefix) |
| nba-data | 8000 | Python FastAPI sidecar |
| postgres | 5432 | PostgreSQL 16 |
| redis | 6379 | Redis 7 |

Backend startup sequence in Docker:
```bash
npx prisma generate && npx prisma db push --accept-data-loss && npm run db:seed & npm run start:dev
```

---

## External APIs

| API | Env Variable | Purpose |
|---|---|---|
| The Odds API | `ODDS_API_KEY` | Live odds from 40+ books |
| BallDontLie | `BALLDONTLIE_API_KEY` | NBA player/team stats |
| NBA Data sidecar | `NBA_DATA_URL` | stats.nba.com via Python |
| Action Network | (scraping) | Public betting splits |

---

## Git Workflow

- Branch naming: `claude/<feature>-<id>` for AI-assisted work
- Descriptive commit messages in imperative mood
- Never force-push to `main` or `master`
- Prisma schema changes should be committed alongside their migration files

---

## Common Tasks

### Add a new backend module
1. Create `backend/src/modules/<name>/` with `.module.ts`, `.controller.ts`, `.service.ts`, `.dto.ts`
2. Register the module in `app.module.ts`
3. Add Swagger decorators to the controller

### Add a new frontend page
1. Create `frontend/src/pages/<Name>Page.tsx`
2. Add route in `App.tsx`
3. Add nav link in `Layout.tsx`
4. Add API methods to `src/lib/api.ts` if needed

### Add a new Prisma model
1. Add model to `backend/prisma/schema.prisma`
2. Run `npm run db:push` (dev) or `npm run db:migrate` (tracked)
3. Update seed file if demo data needed
4. Generate typed client: `npx prisma generate`

### Run a full reset of the database
```bash
cd backend
npx prisma db push --force-reset
npm run db:seed
```
