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

## Known Working State

This branch (`stable/working-v1`) represents a verified working baseline as of March 2026. The following issues were resolved to reach this state:

| Fix | File(s) |
|-----|---------|
| `calculatedAt` field used in EVMetrics query (was `createdAt`) | `ev/ev.service.ts` |
| `cache-manager-redis-store` v3 incompatible with `cache-manager` v5 — switched to in-memory cache | `app.module.ts` |
| EV feed empty-array cache hit masked real DB results | `ev/ev.service.ts` |
| `minEV` filter applied to dollar `ev` field instead of `evPct` | `ev/ev.service.ts` |
| Player props sync used invalid `player_props` market key (→ 422) | `odds-api.service.ts`, `services/background-jobs/jobs.service.ts` |
| No rate-limit handling between per-event Odds API calls (→ 429) | `odds-api.service.ts`, `services/background-jobs/jobs.service.ts` |
| EV Feed UI showed hardcoded demo data instead of API results | `EVFeedPage.tsx` |

**Startup:** `docker-compose up` — services start in dependency order (postgres → redis → nba-data → backend → frontend).



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

## Architecture Deep Dive

### Data Flow

The platform follows a real-time analytics pipeline:

```
Odds API ──┐
NBA Stats  ├──> Data Ingestion ──> PostgreSQL ──┐
Injuries   │                                      │
News       │                                      ├──> Analytics Engine ──> Redis Cache
Public Bets┘                                      │    (EV, Arb, Models)   │
                                                  │                         ├──> Alerts
                                                  └──────────────────────────┴──> Notifications
```

**Key Flows:**

1. **Odds Ingestion** (`data-ingestion` module):
   - Fetches from The Odds API every 15 minutes
   - Stores in `MarketOdds` and `OddsHistory` tables
   - Caches latest snapshot in Redis

2. **EV Calculation** (`analytics` module):
   - Receives odds updates → calculates true probability (removes vig)
   - Compares vs. model predictions → computes EV
   - Results cached in Redis, stored in `EVMetrics`

3. **Arbitrage Detection** (`arbitrage` module):
   - For each market, compares odds across 5+ books
   - Identifies when Σ(1/odds) < 1 (profit opportunity)
   - Calculates optimal stake sizing

4. **Alert Evaluation** (`alerts` module):
   - Evaluates user-defined rules against new EV/arbitrage entries
   - Triggers notifications via Slack/email/in-app
   - Persists notification history

### Module Dependency Graph

```
auth
├── All modules (guards protected routes)

sports
├── analytics (uses players/teams/events)
├── ev
├── arbitrage
├── data-ingestion (loads stats into Sports models)
└── player-props

analytics
├── ev (calculates true prob)
├── arbitrage (uses analytical models)
├── alerts (evaluates models)
└── jobs (runs scheduled GA/ensemble training)

ev
├── analytics
├── alerts
└── notifications

arbitrage
├── ev
├── alerts
└── notifications

data-ingestion
├── sports (creates/updates players, teams, events)
├── jobs (triggers on schedule)

alerts
├── notifications (dispatches when triggered)
└── users (notification preferences)

notifications
├── alerts (sends alert notifications)
├── betslip (sends bet confirmations)
└── background jobs (sends scheduled summaries)
```

### Service Architecture

**Stateless API** (NestJS):
- All requests go through `JwtAuthGuard` (validates token in httpOnly cookie)
- Rate limiting via Throttler middleware (100 req/min per user)
- Global `ValidationPipe` with `class-validator` decorators
- Error handling via NestJS built-in exceptions (400, 401, 403, etc.)

**Background Jobs** (node-cron):
- Every minute: EV recalculation, arbitrage scan, alert evaluation
- Every 15 minutes: Odds API sync, injury/news sync, public betting sync
- Every hour: Model performance evaluation, cache cleanup

**Caching** (in-memory cache-manager):
- Odds snapshots (15 min TTL)
- EV results (5 min TTL)
- Model predictions (10 min TTL)
- Leaderboard stats (hourly TTL)

### Frontend State Management

```
┌─────────────────────────────┐
│   User Session (Zustand)    │
│  - auth (user, token, plan) │
└──────────┬──────────────────┘
           │
    ┌──────┴──────────────────────────┐
    │                                  │
    ▼                                  ▼
┌──────────────┐          ┌──────────────────┐
│  React Query │          │ Component State  │
│ (Server Sync)│          │  (UI-only)       │
│              │          │                  │
│ - EV feed    │          │ - Form inputs    │
│ - Odds       │          │ - Filters        │
│ - Models     │          │ - Open drawers   │
│ - Alerts     │          │ - Tooltips       │
└──────────────┘          └──────────────────┘
        │                        ▲
        └────────────┬───────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  Tailwind CSS   │
            │  Responsive UI  │
            │  Dark/Light     │
            └─────────────────┘
```

**State Flow:**
1. User logs in → `auth.ts` Zustand store updated
2. JWT token stored in httpOnly cookie (auto-refreshed)
3. Pages fetch data via React Query → cached in memory
4. Filters/selections stored in component state (not persisted)
5. Betslip managed in `betslip.ts` store (persisted to localStorage)
6. Bankroll tracked in `bankroll.ts` store (persisted)

## Backend Modules Reference

Each module is a NestJS feature slice with `.module.ts`, `.controller.ts`, `.service.ts`, and `.dto.ts`.

### Core Modules

| Module | Purpose | Key Files | Example Endpoint |
|--------|---------|-----------|------------------|
| **auth** | JWT authentication, session management | `auth.service.ts`, `jwt.guard.ts`, `auth.controller.ts` | `POST /api/auth/login` |
| **sports** | Teams, players, events, stat lines | `sports.service.ts`, `teams/`, `players/` | `GET /api/sports/teams` |
| **analytics** | NBA formulas, model training, GA, ensemble, A/B | `analytics.service.ts`, `preset-models.ts` | `POST /api/analytics/models` |
| **ev** | EV calculation, filtering, caching | `ev.service.ts`, `ev-metrics.ts` | `GET /api/ev/feed?minEV=0.05` |
| **arbitrage** | Multi-book comparison, opportunity detection | `arbitrage.service.ts`, `stake-optimizer.ts` | `GET /api/arbitrage/feed` |

### Data Ingestion Modules

| Module | Purpose | Sources | Refresh Rate |
|--------|---------|---------|--------------|
| **data-ingestion** | Odds, injuries, news, public betting | The Odds API, BallDontLie, web scraping | Every 15 min |
| **odds-api** | The Odds API integration, error handling | 40+ sportsbooks | Every 15 min |
| **injury-ingest** | Injury report sync from multiple sources | ESPN, Rotoworld, team websites | Every 30 min |
| **news-ingest** | Player/team news aggregation | ESPN, AP News, team feeds | Every 30 min |
| **public-betting** | Action Network public betting splits | Action Network API | Every 60 min |

### Analytics Modules

| Module | Purpose | Algorithms | Output |
|--------|---------|-----------|--------|
| **custom-models** | User-created prediction models | Linear regression, weighted averages | `ModelPrediction` records |
| **optimization** | Genetic algorithm weight tuning | GA: tournament selection, single-point crossover, Gaussian mutation | `OptimizationRun` with fitness scores |
| **ensemble** | Combine multiple model predictions | Weighted average, voting, stacking, boosting | `EnsembleModel` with blended probabilities |
| **ab-testing** | Statistical significance testing | Welch's t-test, Beta function p-values | `ABTest` with winner/confidence |

### User-Facing Modules

| Module | Purpose | Key Features | Example Endpoint |
|--------|---------|--------------|------------------|
| **alerts** | Rule-based notifications | EV thresholds, arb detection, news triggers | `POST /api/alerts` |
| **notifications** | Multi-channel dispatch | Slack, email, in-app | (internal, triggered by alerts) |
| **betslip** | Bet slip management | Add/remove legs, calculate parlay odds | `POST /api/betslip` |
| **player-props** | Player props analysis | Hit rate, correlated props, suggestions | `GET /api/player-props/:playerId` |
| **parlay** | Parlay builder & analysis | SGP suggestions, correlation matrix | `POST /api/parlay/suggest` |
| **live-betting** | Live line movement tracking | 3-second snapshots, line alerts | `GET /api/live-betting/:gameId` |
| **expert-picks** | Expert consensus and contrarians | Aggregated picks, consensus line | `GET /api/expert-picks` |
| **bankroll** | Portfolio sizing, Kelly Criterion | Max loss per bet, drawdown tracking | `GET /api/bankroll/status` |

## Frontend Components & State

### Key Pages (17 total)

| Page | Purpose | Data Fetched | Stores Used |
|------|---------|--------------|-------------|
| **DashboardPage** | Quick stats, recent alerts, portfolio summary | User stats, top opportunities, portfolio health | `auth`, `bankroll` |
| **EVFeedPage** | Real-time positive EV opportunities | EV results (30s refresh), filter options | `auth` (for plan tier) |
| **ArbitrageFeedPage** | Cross-book arbitrage opportunities | Arbitrage results, book comparison | `auth` |
| **CustomModelsPage** | Create, train, and manage prediction models | User models, preset templates | `auth`, localStorage |
| **PerformancePage** | Model backtest results, ROI tracking | Model predictions vs. outcomes, stats | `auth` |
| **OptimizationPage** | Run genetic algorithm, view fitness curves | GA runs, generation progress, top weights | `auth` |
| **EnsemblePage** | Combine multiple models, weight tuning | Ensemble config, prediction samples | `auth` |
| **ABTestingPage** | Statistical significance testing | Active tests, results, winner determination | `auth` |
| **AlertsPage** | Configure alert rules, view history | User alerts, trigger history | `auth` |
| **PlayerPropsPage** | Player prop analysis, hit rate trends | Props, historical accuracy, suggestions | `auth` |
| **ExpertPicksPage** | Expert consensus, contrarian lines | Aggregated picks, consensus line movement | `auth` |
| **LiveBettingPage** | Real-time line movement, live odds | Live lines (3s updates), movement alerts | `auth` |
| **ParlayBuilderPage** | Build and analyze parlays, SGP | Market odds, correlation analysis | `auth`, `betslip` |
| **BankrollPage** | Portfolio sizing, Kelly Criterion, drawdown | Bankroll status, historical drawdown | `auth`, `bankroll` |
| **FormulasPage** | Reference for NBA metrics | Formula definitions, player stat examples | (none) |
| **LoginPage** | Authentication | (none) | `auth` |
| **SignupPage** | New user registration | (none) | `auth` |

### Key Components

| Component | Purpose | Children | Stores |
|-----------|---------|----------|--------|
| **Layout** | Nav sidebar, header, footer, theme toggle | All pages | `auth`, localStorage |
| **PlanGate** | Subscription tier gating (FREE/PRO/PREMIUM) | Feature-specific content | `auth` |
| **NotificationCenter** | Real-time notification toast | Toast alerts | (internal) |
| **BetSlip** | Floating bet builder, parlay calculator | Leg list, odds display | `betslip` |
| **PlayerCheatSheetDrawer** | Player stat history, career splits | Tables, charts | (none) |
| **FormulasReference** | Collapsible formula definitions | Expandable sections | (none) |
| **PerformanceChart** | Line chart for model ROI/Sharpe | Recharts graph | (none) |
| **OpportunitiesTable** | Sortable/filterable feed (EV, arb) | Pagination, inline filtering | (none) |

### State Management (Zustand Stores)

**`auth.ts`** - User session, authentication flow
```typescript
interface AuthState {
  user: User | null;           // { id, email, name, planType, createdAt }
  token: string | null;        // JWT access token
  refreshToken: string | null; // Refresh token
  isLoading: boolean;          // Auth flow in progress
  login(email, password);      // POST /api/auth/login
  logout();                    // POST /api/auth/logout
  refreshTokens();             // POST /api/auth/refresh (auto on 401)
}
```

**`betslip.ts`** - Active bet slip management
```typescript
interface BetSlipState {
  legs: BetLeg[];              // Array of selected bets
  totalOdds: number;           // Calculated parlay odds
  stake: number;               // Bet amount
  addLeg(leg);                 // Add bet to slip
  removeLeg(legId);            // Remove bet from slip
  updateStake(amount);         // Set total wager
  calculateOdds();             // Recalculate parlay odds
}
```

**`bankroll.ts`** - Bankroll tracking, Kelly sizing
```typescript
interface BankrollState {
  balance: number;             // Current bankroll
  history: BankrollEntry[];    // Daily snapshots
  maxLossPerBet: number;       // Kelly-sized limit
  drawdown: number;            // Peak-to-trough decline
  updateBalance(newBalance);   // Update after bet/win
  getKellySizedBet(odds, ev);  // Recommend bet size
}
```

### API Integration (`src/lib/api.ts`)

Centralized axios instance with:
- **JWT auto-refresh**: On 401, calls `/auth/refresh` and retries original request
- **Namespaced exports**: `authApi.login()`, `sportsApi.getTeams()`, `evApi.getFeed()`, etc.
- **Base URL**: Reads from `import.meta.env.VITE_API_URL` (.env)
- **Interceptors**: 
  - Request: Adds JWT token from httpOnly cookie (auto)
  - Response: Auto-refresh on 401

### Styling & Theme

**Tailwind CSS** with custom theme (`tailwind.config.js`):
- **Colors**: navy-* (backgrounds), gold (primary), cyan (secondary)
- **Fonts**: Inter (body), JetBrains Mono (code/numbers)
- **Custom utilities**: `shadow-gold-sm`, `shadow-card`, `pulse-gold`, `shimmer`, `slide-in-right`
- **Responsive**: Mobile-first breakpoints (sm, md, lg, xl)
- **Dark mode**: CSS variable-based theme switching (persisted in localStorage)

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

## Common Developer Tasks

### Add a New Backend Module

**1. Create module structure:**
```bash
mkdir -p backend/src/modules/myfeature
touch backend/src/modules/myfeature/{myfeature.module.ts,myfeature.controller.ts,myfeature.service.ts,dtos}
```

**2. Implement the service** (`myfeature.service.ts`):
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * MyFeatureService - Business logic for my feature
 * 
 * Handles CRUD operations, calculations, and integrations for the My Feature module.
 */
@Injectable()
export class MyFeatureService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new record
   * 
   * @param data - Input data for record creation
   * @returns Created record
   * @throws {ConflictException} If record already exists
   */
  async create(data: CreateMyFeatureDto) {
    // Implementation
  }
}
```

**3. Implement the controller** (`myfeature.controller.ts`):
```typescript
import { Controller, Get, Post, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MyFeatureService } from './myfeature.service';

/**
 * MyFeatureController - HTTP API for my feature
 * All routes require JWT authentication (JwtAuthGuard)
 */
@ApiTags('My Feature')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('myfeature')
export class MyFeatureController {
  constructor(private service: MyFeatureService) {}

  /**
   * Get all records
   * 
   * @returns Array of records
   * @example GET /api/myfeature
   */
  @Get()
  @ApiOperation({ summary: 'List all records' })
  @ApiResponse({ status: 200, description: 'Records retrieved successfully' })
  async getAll() {
    return this.service.getAll();
  }
}
```

**4. Create DTOs** (`dtos/create-myfeature.dto.ts`):
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

/**
 * CreateMyFeatureDto - Request body for creating a record
 */
export class CreateMyFeatureDto {
  /**
   * Name of the record
   * @example "My Record"
   */
  @ApiProperty({ example: 'My Record' })
  @IsString()
  name: string;

  /**
   * Numeric value
   * @example 42
   */
  @ApiProperty({ example: 42 })
  @IsNumber()
  value: number;
}
```

**5. Register in `app.module.ts`:**
```typescript
import { MyFeatureModule } from './modules/myfeature/myfeature.module';

@Module({
  imports: [
    // ... other modules
    MyFeatureModule,
  ],
})
export class AppModule {}
```

**6. Test it:**
```bash
cd backend
npm run start:dev
# POST to http://localhost:3000/api/myfeature
```

---

### Add a New API Endpoint

Typically extends an existing module. Example: Adding `/api/ev/scan` to `ev` module.

**1. Add to service** (`ev.service.ts`):
```typescript
/**
 * Scan all markets for EV opportunities
 * 
 * Fetches latest odds, calculates true probabilities for all markets,
 * compares to model predictions, identifies positive EV bets.
 * 
 * @param marketTypes - Filter to specific market types (or undefined for all)
 * @returns Array of EVMetric records with EV > 0
 * @throws {ServiceUnavailableException} If odds API is down
 * 
 * @example
 * const evs = await this.evService.scanAllMarkets(['pregame', 'live']);
 */
async scanAllMarkets(marketTypes?: string[]): Promise<EVMetric[]> {
  // Implementation
}
```

**2. Add route to controller** (`ev.controller.ts`):
```typescript
/**
 * Scan all markets for positive EV opportunities
 * 
 * @param query.marketTypes - Comma-separated market types (optional)
 * @returns Paginated EV opportunities sorted by EV descending
 * 
 * @example POST /api/ev/scan?marketTypes=pregame,live
 */
@Post('scan')
@ApiOperation({ summary: 'Scan all markets for EV' })
@ApiResponse({ status: 200, description: 'Scan completed', type: [EVMetricDto] })
async scanMarkets(@Query() query: ScanQueryDto) {
  return this.evService.scanAllMarkets(query.marketTypes?.split(','));
}
```

**3. Test via Swagger:**
- Navigate to http://localhost:3000/api/docs
- Find endpoint in "EV" tag
- Click "Try it out" → "Execute"

---

### Add a New Frontend Page

Example: Create a new "Reports" page.

**1. Create page component** (`frontend/src/pages/ReportsPage.tsx`):
```typescript
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { analyticsApi } from '../lib/api';

/**
 * ReportsPage - Backtest reports, ROI charts, performance analytics
 * 
 * Displays saved reports with filtering by date range and model.
 * Uses React Query for server-state caching (30s staleTime).
 * 
 * @requires auth (JwtAuthGuard)
 * @requires subscription tier: PRO+
 * 
 * @example
 * <ReportsPage />  // Renders at /dashboard/reports
 */
export default function ReportsPage() {
  const { user } = useAuthStore();
  
  // Fetch reports data
  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => analyticsApi.getReports(),
    staleTime: 30_000, // 30 seconds
    enabled: !!user, // Only fetch if logged in
  });

  if (isLoading) return <div>Loading...</div>;
  if (!reports?.length) return <div>No reports yet</div>;

  return (
    <div className="space-y-6">
      {/* Render reports */}
    </div>
  );
}
```

**2. Add to routes** (`frontend/src/App.tsx`):
```typescript
import ReportsPage from './pages/ReportsPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* ... other routes ... */}
        <Route 
          path="/dashboard/reports" 
          element={<ProtectedRoute component={ReportsPage} requiredPlan="PRO" />} 
        />
      </Routes>
    </Router>
  );
}
```

**3. Add navigation link** (`frontend/src/components/Layout.tsx`):
```typescript
const navItems = [
  // ... existing items ...
  { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
];
```

**4. Add API methods** (`frontend/src/lib/api.ts`):
```typescript
/**
 * Fetch all reports for the current user
 * 
 * @returns Array of report summaries with dates, ROI, sample count
 * @throws {UnauthorizedException} If not authenticated
 * @throws {ForbiddenException} If not PRO+ tier
 * 
 * @example
 * const reports = await analyticsApi.getReports();
 */
export const analyticsApi = {
  async getReports(): Promise<ReportSummary[]> {
    const { data } = await apiClient.get('/analytics/reports');
    return data;
  },
};
```

**5. Test it:**
```bash
cd frontend
npm run dev
# Navigate to http://localhost:5173/dashboard/reports
```

---

### Add a New Database Model

Example: Add `Leaderboard` model to track top users.

**1. Add to schema** (`backend/prisma/schema.prisma`):
```prisma
/// Leaderboard rankings for top users by ROI/Win Rate
model Leaderboard {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  /// ROI percentage (0.15 = 15%)
  roiPct        Float    @default(0)
  
  /// Win rate percentage (0.55 = 55%)
  winRatePct    Float    @default(0)
  
  /// Total bets placed
  betCount      Int      @default(0)
  
  /// Rankings position
  rank          Int
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@map("leaderboards")
  @@index([rank])
  @@index([roiPct])
}
```

**2. Create migration:**
```bash
cd backend
npx prisma migrate dev --name add_leaderboard
```

**3. Add to seed** (`backend/prisma/seed.ts`):
```typescript
// Create sample leaderboard entries
await prisma.leaderboard.createMany({
  data: [
    { userId: admin.id, roiPct: 0.25, winRatePct: 0.58, betCount: 500, rank: 1 },
    { userId: pro.id, roiPct: 0.18, winRatePct: 0.54, betCount: 300, rank: 2 },
  ],
});
```

**4. Run migration:**
```bash
npx prisma db push
npm run db:seed
```

**5. Add service method:**
```typescript
// In leaderboard.service.ts
async getTopUsers(limit: number = 100) {
  return this.prisma.leaderboard.findMany({
    take: limit,
    orderBy: { rank: 'asc' },
    include: { user: { select: { name: 'true', email: 'true' } } },
  });
}
```

---

### Add a New Alert Type

Example: Create an alert for odds line movement.

**1. Add to alerts service** (`backend/src/modules/alerts/alerts.service.ts`):
```typescript
/**
 * Evaluate line movement alerts
 * 
 * Check if odds have moved more than threshold since last snapshot.
 * Useful for detecting sharp action or early opinionated moves.
 * 
 * @param userId - User ID to check alerts for
 * @param lineMovementThreshold - Min. movement % (e.g., 0.05 for 5%)
 * @throws {NotFoundException} If user not found
 */
async evaluateLineMovementAlerts(
  userId: string,
  lineMovementThreshold: number = 0.05,
): Promise<Alert[]> {
  const alerts = await this.prisma.alert.findMany({
    where: { userId, type: 'LINE_MOVEMENT', active: true },
  });

  // Compare latest vs. previous odds snapshots
  // Return triggered alerts
}
```

**2. Call from background job** (`backend/src/services/background-jobs/jobs.service.ts`):
```typescript
@Cron(CronExpression.EVERY_5_MINUTES)
async evaluateAlerts() {
  const users = await this.prisma.user.findMany();
  for (const user of users) {
    // Evaluate all alert types
    await this.alertsService.evaluateLineMovementAlerts(user.id);
  }
}
```

**3. Add to frontend** — User can configure threshold in `AlertsPage.tsx`

---

### Running Tests

**Backend unit tests:**
```bash
cd backend
npm run test                    # All tests
npm run test:watch             # Watch mode
npm run test:cov              # Coverage report
npm run test:e2e              # End-to-end tests
```

**Frontend linting:**
```bash
cd frontend
npm run lint                   # ESLint
npm run build                 # Type check + build
```

**Integration test (local):**
```bash
docker-compose up              # Start all services
# Wait for backend to start
curl http://localhost:3000/api/docs  # Verify Swagger is up
docker-compose down
```

---

### Environment Variables

Key env vars in `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | development | Build mode |
| `PORT` | 3000 | Backend API port |
| `FRONTEND_URL` | http://localhost:5173 | CORS origin |
| `DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `REDIS_HOST` | localhost | Redis host (for background jobs) |
| `JWT_SECRET` | (required) | Signing key for tokens |
| `ODDS_API_KEY` | (required) | The Odds API key |
| `LOG_LEVEL` | debug | Winston logger level |

See `.env.example` for all options.
