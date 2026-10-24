# Staff Engineer — season-2026-27-readiness  [DISCOVERED, verified 2026-10-24]
- Cross-cutting: three modules (`projection.math`, `AnalyticsService`) implement odds math independently; both match exact fractions, so duplication is correct today but a drift risk. Candidate: one shared odds module.
- Integrity pattern holds in the observed execution path: upstream failure => empty + `data_quality: LOW`, never synthetic.
- Violation of repo contract: `optimization.service.ts` fabricates ROI/win-rate/Sharpe/calibration with unseeded `Math.random()`.
- Policy gap: LOW data quality can yield BET (only STRONG_BET is gated). Owner decision pending.
- Evidence: docs/CALCULATION_VERIFICATION_2026-27.md
