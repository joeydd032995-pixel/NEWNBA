# DBA — season-2026-27-readiness  [DISCOVERED, verified 2026-10-24]
- 54 tables, all with PKs, 202 indexes. 6 additive migrations apply cleanly on top of a baseline (verified on local PG16).
- Missing FK indexes: events.homeTeamId, events.awayTeamId, defensive_matchup_assignments.defenseTeamId, ab_tests.variantAId/variantBId, notifications.alertId. Additive migration proposed.
- Drift: two index names truncated at 63 bytes (defensive_matchup_assignments_..._offensiv, injury_replacement_projections_..._replaceme). Cosmetic; additive RenameIndex.
- Baseline migration `20260818000000_baseline_main` has no DDL: fresh DBs cannot `migrate deploy`. Needs reviewed path; existing deployments have it recorded as applied.
- 11 JSON columns, all on pre-Opportunity models (alerts, arbitrage_opportunities, custom_models, ensemble_models, model_predictions, notifications, optimization_*, saved_filters). New models use typed columns.
- Historical catch-and-shoot/pull-up zeros remain unrepairable without re-ingestion (see IMPLEMENTATION_STATUS).
