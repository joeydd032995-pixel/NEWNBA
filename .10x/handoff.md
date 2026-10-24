# Handoff
Next role: Architect/Staff (design the fixes) once the user answers the five decisions in docs/CALCULATION_VERIFICATION_2026-27.md §7.
Order proposed: (1) Docker entrypoint (tsconfig include) (2) ESPN adapter + playable-to rounding + optimizer (small, safe) (3) FK-index migration (4) baseline migration path (5) dispersion fix with reliability test (6) auth model.
ADR required before each implementation per 10x-Team gate. Never run DB commands against the sandbox DATABASE_URL (remote Neon).
Re-run: docs/verification/* (README steps in report §8).

DEPLOY: need user to (1) create a new empty Neon DB for NEWNBA, (2) provide Vercel access for team joeys-projects-2817e47f, (3) decide host for the 23 cron jobs + Redis. See devops decision file.
