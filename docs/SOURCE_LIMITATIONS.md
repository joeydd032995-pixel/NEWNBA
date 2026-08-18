# Opportunity-First Source Limitations

This file is normative for NEWNBA production behavior. A missing data source is not permission to invent a value, backfill a zero, or silently substitute a lower-quality metric with different semantics.

## General rule

For every Opportunity-First field:

1. Prefer an official NBA or official team source when one is available and technically stable enough to ingest reproducibly.
2. Use an explicitly lower source tier only when its semantics match the target field.
3. Preserve source, source tier, timestamp/freshness and conflict state.
4. If no verified source is available, leave the field unavailable and lower the relevant data-quality score.
5. Never convert absence into an observed zero.
6. Never allow simulated public-betting data to enter evidence, recommendation or performance calculations.

## Current verified official inputs

### NBA injury availability

- Official NBA injury-report PDFs are Tier 1.
- ESPN is fallback reporting only.
- `reportedAt` represents publication/report time and can never be populated from return-date information.

### NBA referee assignments

- The NBA Official daily assignment page is Tier 1 for game crew membership and role.
- Assignment presence does **not** imply that foul-rate, free-throw tendency, pace impact or interruption metrics are known.
- Referee tendency metrics must be calculated from observed historical games with sufficient sample size before they are populated.

### Player tracking and lineup/on-off inputs

- stats.nba.com / nba_api adapters are Tier 1 for the tracking measures and lineup/on-off rows actually returned by the upstream endpoint.
- Failed or unavailable result sets are explicit degraded states.

### Shot locations

- stats.nba.com `ShotChartDetail` is Tier 1 for observed shot events and official league-average zone efficiency.
- Rim, midrange, corner-3 and above-the-break-3 frequency/efficiency are calculated only from returned shot events.
- Location-based expected eFG is the player shot mix weighted by official league-average efficiency for the matching shot zones; it is not the player's observed eFG relabeled as expected eFG.

## Fields intentionally not fabricated

### Defensive scheme frequencies

The following remain unavailable unless a verified source with matching semantics is connected:

- switch frequency
- drop frequency
- blitz frequency
- trap frequency
- zone frequency
- double-team rate
- help-aggressiveness frequency
- point-of-attack quality as a directly observed tracking field
- expected primary-defender assignment before the game

Existing Prisma fields allow these concepts to be persisted, but model code must not interpret default numeric values as observed data. Until a verified feed is implemented, these inputs must be excluded from evidence and their absence reflected in data quality.

### Arena / geography

The following remain unavailable until a verified venue registry or authoritative geography source is ingested:

- exact arena altitude
- arena latitude/longitude
- travel distance derived from verified origin/destination coordinates
- time-zone change derived from verified team travel origin and arena time zone

Schedule-derived rest fields (B2B, 3-in-4, 4-in-6 and rest advantage) are separate and may be calculated from NEWNBA's persisted event schedule. City elevation must not be substituted for arena altitude without explicitly changing the field semantics.

### Coaching/team communication feeds

Official NBA/team statements should outrank national and beat reporting, but no generic scraper may be labeled an official feed merely because it points at an NBA-owned domain. A production feed must have stable attribution, publication time and deduplication semantics. Until then:

- official injury reports remain the authoritative availability source;
- existing news/reporting is contextual only;
- unresolved coaching/rotation information causes WAIT/LOWER-QUALITY behavior instead of inferred certainty.

### Reporter hierarchy

A reporter registry can rank source credibility, but a person's reputation cannot be converted into an unverified data point. Reporter evidence must retain the original source URL/publication identifier and timestamp. A registry entry alone is not evidence.

## Nullable-vs-zero rule

Several Phase-1 schema fields were originally created with numeric defaults for migration safety. New ingestion code must distinguish an actually observed `0` from `not available`. Where the current schema cannot represent that distinction, the field must not be consumed by the projection engine until it is migrated to nullable semantics or accompanied by an explicit availability/provenance record.

This particularly applies to shot-profile subfields such as catch-and-shoot and pull-up data when a row was created from a different official endpoint that did not return those measures.

## Calibration rule

The transparent spread-to-blowout/minute-loss function is a model proxy, not source data. It must remain labeled as such and must not be promoted to a calibrated model until historical event-to-player-stat linkage is trustworthy. Stat lines attached to generic/incorrect events cannot be used for opponent, matchup, H2H or blowout calibration.

## Out-of-scope justification standard

An item may be marked out of scope only when one of the following is documented:

- no verified source with matching semantics is available;
- licensing/terms prevent production ingestion;
- historical data integrity is insufficient for defensible calibration;
- implementation would require inventing or relabeling a value.

"Difficult to obtain" is not sufficient justification. The system should remain extensible so a verified source can be added later without changing public recommendation contracts.
