# Senior Engineer — season-2026-27-readiness  [DISCOVERED, verified 2026-10-24]
Implementation notes for the pending fixes (NOT yet implemented, awaiting design approval):
- `decision.engine.ts` `maxPlayableAmericanPrice`: `Math.floor` -> `Math.ceil` on the `requiredDecimal >= 2` branch; add a property test (EV at returned price >= minEv over a p-grid).
- `player-prop-projection.assembler.ts` `buildUncertainty`: THREES rate SD is makes/min applied to attempts/min; conversion SD constant 0.04 vs binomial ~0.18. Replace with per-game outcome dispersion + binomial/Poisson floor; add reliability-curve test using docs/verification generator.
- `nba-data/main.py` `/injuries`: team from `athlete.team.abbreviation`; id from `links` (`/id/<n>/`); `/news`: whitelist 30 NBA abbreviations.
- `optimization.service.ts`: replace `simulatePerformance` with UNAVAILABLE until fitted on tracked wagers; seed any RNG.
