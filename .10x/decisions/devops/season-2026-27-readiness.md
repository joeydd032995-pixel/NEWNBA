# DevOps — season-2026-27-readiness  [DISCOVERED, verified 2026-10-24]
- S1: Dockerfile prod CMD `node dist/full-main` fails (MODULE_NOT_FOUND). Cause: `tsconfig.build.json` has no `include`, so `prisma/seed.ts` widens rootDir and emits `dist/src/full-main.js`. Fix options: `include: ["src"]` in tsconfig.build.json (preferred) or CMD `dist/src/full-main`.
- S1: dev compose uses `prisma db push --accept-data-loss`; prod uses `migrate deploy`. Fresh DB fails `migrate deploy` (empty baseline).
- CI (opportunity-first-ci.yml) masks the baseline gap via `db push` of main's schema; CI uses Node 20, sandbox verified on Node 22.
- Sandbox: stats.nba.com / cdn.nba.com blocked (403/timeout); no ODDS_API_KEY / BALLDONTLIE_API_KEY. SANDBOX `DATABASE_URL` points to a remote Neon DB: do not run migrations/tests against it.
- Sidecar `production_app:app` boots; `/health` => season 2026-27.
