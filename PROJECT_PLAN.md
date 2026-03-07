# NBA Betting Analytics Platform - Complete Implementation

## Project Overview
Build a production-ready sports betting analytics platform with:
- Backend: NestJS + PostgreSQL + Prisma + Redis + BullMQ
- Frontend: React + TypeScript + Tailwind CSS + TanStack Query
- Advanced Analytics: Genetic Algorithms, Ensemble Models, A/B Testing
- NBA Metrics: BPM, RAPTOR, LEBRON, Four Factors

## Repository
- GitHub: https://github.com/joeydd032995-pixel/NEWNBA
- Branch: main

## Phase 1: Project Structure & Configuration

CREATE:
- Complete directory structure (backend/frontend)
- package.json files (backend & frontend)  
- tsconfig.json configurations
- Docker setup (Dockerfile, docker-compose.yml)
- Environment configuration (.env.example)
- README.md with comprehensive documentation
- setup.sh automation script

## Phase 2: Database Schema (Prisma)

CREATE: backend/prisma/schema.prisma

MODELS NEEDED:
- User (auth: email, password, planType, tokens)
- Sport, Team, Player, Event, StatLine
- Market, Book, MarketOdds, OddsHistory
- EVMetrics, ArbitrageOpportunity
- CustomModel, ModelPrediction, ModelPerformance
- EnsembleModel, OptimizationRun, OptimizationCandidate
- ABTest, ABTestResult
- SavedFilter, Alert, BetSlip, BetSlipItem

SEED DATA:
- 6 sports (NBA, NFL, MLB, NHL, NCAAF, NCAAB)
- 4 sportsbooks (DraftKings, FanDuel, BetMGM, Caesars)
- 30+ teams, 50+ players, 20+ events
- Test users: free@test.com, pro@test.com, premium@test.com

## Phase 3: Backend - Core Modules

### Authentication Module
FILES:
- src/modules/auth/auth.service.ts (JWT + bcrypt)
- src/modules/auth/auth.controller.ts (signup, login, refresh, logout)
- src/modules/auth/strategies/jwt.strategy.ts
- src/modules/auth/strategies/local.strategy.ts
- src/modules/auth/guards/jwt-auth.guard.ts

### Analytics Module
FILES:
- src/modules/analytics/analytics.service.ts
  - All NBA formulas: TS%, eFG%, Four Factors, Pythagorean
  - BPM, RAPTOR, LEBRON calculations
  - EV calculation engine
  - 12 preset models (balanced, efficiency, moreyball, playerProps, defensive, sgp, liveBetting, playoff, backToBack, homeAway, momentum, contrarian)

- src/modules/analytics/custom-model.service.ts
  - CRUD for custom models
  - Weight management

- src/modules/analytics/performance-tracking.service.ts
  - Record predictions
  - Calculate ROI, Sharpe, calibration, win rate

- src/modules/analytics/optimization.service.ts
  - Genetic algorithm implementation
  - Population initialization
  - Fitness evaluation
  - Selection, crossover, mutation
  - Convergence tracking

- src/modules/analytics/ensemble.service.ts
  - Weighted average, voting, stacking, boosting
  - Component management
  - Auto-optimization

- src/modules/analytics/ab-testing.service.ts
  - Test creation and management
  - Statistical significance (t-tests, p-values)
  - Winner determination

- src/modules/analytics/analytics.controller.ts
  - All REST API endpoints

### Other Backend Modules
- EV Module (EV calculation)
- Arbitrage Module (arbitrage detection)
- Sports, Players, Markets, Events (CRUD)
- Feeds (plan-based access control)
- Filters, Alerts, Betslips

### Background Services
FILES:
- src/services/odds-ingestion/odds-ingestion.service.ts
- src/services/background-jobs/jobs.service.ts
  - BullMQ queue setup
  - EV calculation job (every 1m)
  - Arbitrage scan job (every 1m)
  - Alerts evaluation job (every 1m)

## Phase 4: Frontend - React Application

### Core Setup
FILES:
- src/main.tsx (React 18 entry point)
- src/App.tsx (React Router setup)
- src/index.css (Tailwind CSS)

### API & State
FILES:
- src/lib/api.ts (Axios with JWT interceptor)
- src/stores/betslip.ts (Zustand store)

### Components
FILES:
- src/components/Layout.tsx (Sidebar navigation)
- src/components/Betslip.tsx (Betslip drawer)
- src/components/ModelSelector.tsx (Model selector with weights)
- src/components/ui/ (shadcn/ui components)

### Pages
FILES:
- src/pages/LoginPage.tsx
- src/pages/SignupPage.tsx
- src/pages/DashboardPage.tsx
- src/pages/EVFeedPage.tsx
- src/pages/ArbitrageFeedPage.tsx
- src/pages/PlayerDetailPage.tsx
- src/pages/FiltersPage.tsx
- src/pages/AlertsPage.tsx
- src/pages/CustomModelsPage.tsx
- src/pages/PerformancePage.tsx
- src/pages/FormulasPage.tsx
- src/pages/OptimizationPage.tsx (Genetic Algorithm UI)
- src/pages/EnsemblePage.tsx (Ensemble Models UI)
- src/pages/ABTestingPage.tsx (A/B Testing UI)

## Phase 5: Advanced Features

### Genetic Algorithm Optimization
- Population-based weight search (50-200 population)
- Fitness evaluation (ROI, Win Rate, Sharpe, Calibration)
- Tournament selection, crossover, mutation
- Convergence tracking with real-time charts
- Apply optimized weights to new models

### Ensemble Models
- 4 strategies: Weighted Average, Voting, Stacking, Boosting
- Component model management
- Confidence calculation
- Auto-weight optimization

### A/B Testing
- Scientific model comparison
- Statistical significance (t-test, p-value, confidence intervals)
- Automatic winner declaration
- Performance comparison charts

## Phase 6: Integration & Deployment

### Docker Setup
- Multi-stage builds
- PostgreSQL 16 + Redis 7
- Health checks
- Volume persistence

### Documentation
- Comprehensive README
- API documentation
- Setup instructions

## Technical Specifications

### Key NBA Formulas
1. True Shooting %: PTS / [2 × (FGA + 0.475 × FTA)]
2. eFG%: (FG + 0.5 × 3P) / FGA
3. Four Factors: 0.40×eFG% + 0.25×TOV% + 0.20×ORB% + 0.15×FTR
4. Pythagorean: PF^13.91 / (PF^13.91 + PA^13.91)
5. BPM, RAPTOR, LEBRON (advanced player metrics)

### 12 Preset Models
1. balanced - Equal weighting
2. efficiency - Four Factors + TS% focus
3. moreyball - Heavy rim + 3PT emphasis
4. playerProps - USG% + location focus
5. defensive - NetRtg + on-off
6. sgp - Correlation-adjusted
7. liveBetting - Momentum + recency
8. playoff - Defense + star usage
9. backToBack - Fatigue adjustment
10. homeAway - Home court + travel
11. momentum - Heavy recency
12. contrarian - Fades public

## Success Criteria
✅ All modules compile without errors
✅ Docker containers build successfully
✅ Database migrations run
✅ Frontend connects to backend
✅ Authentication flow works
✅ All CRUD operations functional
✅ Genetic algorithm converges
✅ Ensemble predictions work
✅ A/B tests calculate correctly
✅ Performance tracking accurate

## Implementation Priority
1. Project structure (CRITICAL)
2. Prisma schema (CRITICAL)
3. Auth module (CRITICAL)
4. Analytics core (HIGH)
5. Custom models (HIGH)
6. Genetic optimization (MEDIUM)
7. Ensemble models (MEDIUM)
8. A/B testing (MEDIUM)
9. Frontend pages (HIGH)
10. Integration (HIGH)
