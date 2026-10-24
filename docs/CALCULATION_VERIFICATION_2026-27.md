# 2026–27 Season Readiness: Calculation Verification & System Audit

Date: 2026-10-24 · Baseline: `main` @ `006d01d` · Season resolved by the code: `2026-27`
Method: executed gates, an independent re-implementation of the engine math, a ground-truth calibration test, service boot, and live probes of the reachable upstreams. Scripts are in `docs/verification/` and are reproducible.

## 0. What this report can and cannot claim

| Verified here | NOT verified here |
|---|---|
| Build / test / migration gates | Live `stats.nba.com`, `cdn.nba.com` (HTTP 403/timeout from the cloud sandbox) |
| Engine arithmetic vs independent reference | The Odds API and BallDontLie (no keys in the environment) |
| Engine dispersion vs **synthetic** ground truth | Calibration against **real** NBA outcomes (no game-log access) |
| Service boot, route behaviour, ESPN payload shape | Production deploy (Docker daemon not used) |

Anything in the right column is **UNVERIFIED**, not passing. `docs/verification/probe_apis.py` re-checks every upstream where network and keys exist.

Safety note: the sandbox's `DATABASE_URL` points at a remote Neon database. It was **not** touched. All DB work used a throwaway local Postgres.

## 1. Gate results

| Gate (CLAUDE.md) | Result |
|---|---|
| Prisma validate / generate | PASS |
| Migrations apply cleanly | **PASS only via CI's baseline workaround; FAIL from an empty database** (§4, S1-2) |
| Backend tests | PASS: 41 suites, 286 tests |
| Backend build / frontend build | PASS / PASS |
| Python compile + sidecar boot | PASS; `/health` reports `current_season: 2026-27` |
| Docker Compose config | PASS (`config -q`) |
| Backend boot, full module graph, local PG + Redis | PASS (no startup errors) |
| Production container entrypoint | **FAIL** (§4, S1-1) |

## 2. Calculation verification (independent reference)

Reference: numpy (PCG64, 3M trials), exact `Fraction` odds math, closed-form moments. **30/33 checks pass; the 3 non-passes are explained below.**

| Area | Result |
|---|---|
| American→decimal/implied, EV, Kelly (18 prices, both `projection.math` and `AnalyticsService`) | Match exact fractions, max error 8.9e-16 |
| No-vig two-way (7 price pairs, both implementations) | Match exact; sums to 1 |
| Governing equation point estimate (4 fixtures) | Exact: Minutes × Opportunity × Conversion × Context × Pace × PPP |
| Simulated mean / SD / P(over) vs 3M-trial reference (FAST/STANDARD/DEEP × 4 fixtures) | All within 4 SE (max \|z\| 2.5) |
| Closed-form E and Var of the independent-factor product | Within 2% |
| Seeded determinism; trial counts 2,500 / 10,000 / 40,000 | PASS |
| Empirical correlation vs `numpy.corrcoef` | Identical (1e-16) on unclamped entries. Engine clamps \|r\| to 0.95 by design, so a 0.978 input becomes 0.95. This is a documented-in-code behaviour, not a bug, but it is silent |
| PRA recombination: mean = Σ means; SD ≈ √(sᵀRs) | PASS (4.83 vs 4.86). Independent-sum SD would be 4.32, so correlation matters (+12%) |
| `STRONG_BET` never below HIGH quality; unresolved availability/lineup/minutes ⇒ WAIT | PASS |
| **Playable-to price meets its minimum EV** | **FAIL (real bug)**, 36/82 plus-odds cases; e.g. `+132` yields EV 2.59% vs 3.00% required. `Math.floor` should be `Math.ceil` on the `requiredDecimal ≥ 2` branch of `maxPlayableAmericanPrice` (`decision.engine.ts`) |
| LOW data quality can produce `BET` | Policy question, not a violation: the repo only restricts `STRONG_BET`. Needs an owner decision (§7) |

Monte-Carlo resolution: at STANDARD (10k trials), SE of a probability is up to ±0.5 pt, so EV differences under ~1% are noise; `edgeExceedsUncertainty` margins (2.5 / 4.5 / 7.5 pts) are the real protection.

## 3. Accuracy: dispersion vs ground truth (the main finding)

The arithmetic is right; the **width of the distribution is set by the assembler's uncertainty inputs**, and those are heuristic. Test: 4 synthetic player archetypes with a known shooting process (binomial makes, Poisson volume), 120 twenty-game logs each, pushed through the assembler's exact rules (no-tracking fallback path) and compared with a 400k-game ground truth. Synthetic data is harness-only and never persisted.

| Stat | Engine SD ÷ true SD (fallback path) | Tracked path (penalty 1.0, ctx 0.03) | Effect on edges |
|---|---|---|---|
| Points | **1.44** | 1.11 | Too wide → understates edges |
| Rebounds | 1.25 | 0.96 | Too wide on fallback |
| Assists | 1.20 | 0.93 | Too wide on fallback |
| **Threes** | **0.50** | **0.40** | **Too narrow → overconfident; avg \|EV error\| 17–19% at −110** |

Root causes (`player-prop-projection.assembler.ts`):
1. **Threes:** the rate SD is taken from *makes*/min but applied to *attempts*/min (units mismatch), and conversion SD is a constant 0.04, whereas binomial shot-making alone at ~7 attempts and 37% is ≈ 0.18.
2. The 1.35 "no tracking" penalty inflates the SD for Points/Rebounds/Assists beyond truth.
3. Opportunity-rate SD is derived from the stat-per-minute series, so stat noise is counted partly in the opportunity term and partly again in the fixed conversion/context terms.

Caveats: this validates dispersion mechanics against a *known* process, not real NBA calibration. The 20-game window and true minutes SD are assumptions. Real-outcome calibration (reliability curves, Brier/log-loss, CLV) needs historical logs and is outstanding. Until the Threes dispersion is fixed, Threes P(over)/EV should not drive `BET`/`STRONG_BET`.

## 4. Findings, ranked

**S1: blocks season launch**
1. **Production container cannot start.** `tsconfig.build.json` has no `include`, so `prisma/seed.ts` is compiled and the output lands at `dist/src/full-main.js`. `Dockerfile` CMD and `npm run start:prod` run `node dist/full-main` → `MODULE_NOT_FOUND` (reproduced). `docker-compose.override.yml` and Vercel may mask it; the Dockerfile path does not.
2. **A fresh database cannot be migrated.** `20260818000000_baseline_main` contains no DDL; migration 2 fails with `relation "model_performance" does not exist`. CI works around it with `db push` of the old schema. Dev compose runs `prisma db push --accept-data-loss`, which CLAUDE.md prohibits as a migration substitute. A real baseline needs a reviewed migration path (existing deployments already recorded the empty baseline).
3. **Frontend/backend auth contract is broken.** PRs #60/#61 removed the login gate from the frontend, but the backend still JWT-guards nearly all routes (25 of 27 unparameterised GETs return 401: EV, arbitrage, live, ingestion, betslip, bankroll, billing, notifications…). Public UI would show no data. Resolution is a product/security decision (§7).

**S2: data integrity / accuracy**
4. **Fabricated optimizer metrics.** `optimization.service.ts` `simulatePerformance()` returns ROI/win-rate/Sharpe/calibration from a formula plus unseeded `Math.random()`. This violates "no simulated betting evidence" and "all randomness seeded". It is reachable via the analytics controller.
5. **Threes (and Points/Rebounds/Assists on fallback) mis-dispersed**, §3.
6. **ESPN injury adapter returns empty `team_abbr` and `espn_id` for all 70 records.** ESPN's payload moved team to `team_block.displayName` and the abbreviation to `athlete.team.abbreviation`; the id is only in `links`. Name-only matching risks wrong-player attachment. Reproduced by `probe_apis.py`.
7. **ESPN news includes non-NBA items** (`ADL`, `MEL`, `PNX`: Australian NBL) with no team whitelist.
8. **`maxPlayableAmericanPrice` rounding**, §2.

**S3: hardening**
9. Six FKs lack covering indexes: `events.homeTeamId`, `events.awayTeamId`, `defensive_matchup_assignments.defenseTeamId`, `ab_tests.variantA/BId`, `notifications.alertId`. CLAUDE.md requires event/team/time indexes. Additive migration.
10. Two index names are truncated by Postgres's 63-byte limit, so `migrate diff` reports drift (cosmetic; additive rename).
11. Event-loop blocking: a 840-projection STANDARD sweep (full slate × 7 stats) runs ~5.2 s synchronously. Fine for a batch job, not for a request path.
12. 11 JSON columns exist, all on pre-existing non-Opportunity models; new Opportunity-First models use typed columns (compliant).

## 5. Performance

| Operation | Time |
|---|---|
| `projectDistribution` FAST / STANDARD / DEEP | 3.3 / 7.4 / 29.3 ms |
| PRA recombination (3 comps, 10k) | 20.7 ms |
| Joint 3-leg probability (25k) | 22.3 ms |
| Double-double simulation (25k) | 21.8 ms |
| 27 unparameterised GET routes probed | all < 2 s, but 25 returned 401 immediately, so this says **nothing** about authenticated endpoint latency (not measured) |

The engine is fast enough; the constraint is accuracy of inputs, not compute.

## 6. API connectivity matrix

| Upstream | Status | Evidence |
|---|---|---|
| nba-data sidecar | PASS | `/health`, season `2026-27` |
| Official NBA injury report (Tier 1) | UNVERIFIED | 503 with `data_quality: LOW`, `injuries: []`. Fails honestly, nothing invented |
| `stats.nba.com` tracking / players / games | UNVERIFIED | Blocked from sandbox; sidecar returns 503, not fake data |
| ESPN injuries (Tier 3) | **FAIL (parse)** | Reachable; parser yields empty team/id (#6) |
| ESPN news | **FAIL (scope)** | Reachable; NBL contamination (#7) |
| The Odds API | UNVERIFIED | No `ODDS_API_KEY`; host reachable |
| BallDontLie | UNVERIFIED | No key |
| Postgres / Redis / backend | PASS | Local |

Integrity check on failure behaviour: with upstreams down, no synthetic odds, injuries, news or betting splits were produced (CLAUDE.md data-integrity rules hold in the execution path observed).

## 7. Decisions needed before fixes (no engine/schema/infra code has been changed)

1. **Auth model (S1-3):** restore the frontend login, or make a defined set of read-only market/projection routes public and keep user-scoped routes (betslip, bankroll, billing, notifications) guarded?
2. **Baseline migration (S1-2):** approve an additive path that gives fresh databases a real baseline while leaving already-deployed databases untouched.
3. **Optimizer (#4):** remove the simulated metrics (return `UNAVAILABLE` until fitted on tracked wagers) or gate the endpoint off. Recommended: the former.
4. **LOW data quality (§2):** cap decisions at `LEAN`, or keep the current behaviour (`BET` allowed, confidence `LOW`)?
5. **Dispersion fix (#5):** approve re-deriving uncertainty from per-game outcome dispersion (and binomial/Poisson floors for Threes) with a reliability-curve test, before Threes may reach `BET`.

## 8. Reproduce

```bash
cd backend
npx ts-node --transpile-only -O '{"module":"commonjs","esModuleInterop":true,"ignoreDeprecations":"6.0"}' ../docs/verification/dump_engine.ts /tmp/engine.json
python ../docs/verification/reference_check.py /tmp/engine.json /tmp/result.json         # needs numpy, scipy
python ../docs/verification/calibration_generate.py /tmp/cal_in.json
npx ts-node --transpile-only -O '{"module":"commonjs","esModuleInterop":true,"ignoreDeprecations":"6.0"}' ../docs/verification/calibration_run.ts /tmp/cal_in.json /tmp/cal_out.json
python ../docs/verification/calibration_report.py /tmp/cal_in.json /tmp/cal_out.json
python ../docs/verification/probe_apis.py                                                # run where network + keys exist
```
