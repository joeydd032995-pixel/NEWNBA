export type ReportingSourceClass =
  | 'OFFICIAL_NBA'
  | 'OFFICIAL_TEAM'
  | 'COACH_DIRECT'
  | 'NATIONAL_REPORTER'
  | 'BEAT_REPORTER'
  | 'AGGREGATOR'
  | 'UNKNOWN';

export type ReportingSourceTier =
  | 'TIER_1_OFFICIAL'
  | 'TIER_2_HIGH_QUALITY'
  | 'TIER_3_REPORTING'
  | 'LOW_PRIORITY';

export type ReportingDataQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ReportingSourceRegistryEntry {
  key: string;
  displayName: string;
  sourceClass: ReportingSourceClass;
  canonicalDomain?: string;
  teamAbbreviation?: string;
  active: boolean;
}

export interface ReportingClaim<T = string> {
  sourceKey: string;
  sourceClass: ReportingSourceClass;
  value: T;
  publishedAt: Date;
  sourceUrl?: string;
}

export interface ReportingResolution<T = string> {
  resolved: boolean;
  value: T | null;
  winningSourceClass: ReportingSourceClass | null;
  supportingSources: string[];
  conflictingSources: string[];
  reason: string;
}

export interface ReportingSourceAssessment {
  sourceKey: string;
  sourceClass: ReportingSourceClass;
  sourceTier: ReportingSourceTier;
  dataQuality: ReportingDataQuality;
}

const SOURCE_RANK: Record<ReportingSourceClass, number> = {
  OFFICIAL_NBA: 600,
  OFFICIAL_TEAM: 550,
  COACH_DIRECT: 525,
  NATIONAL_REPORTER: 400,
  BEAT_REPORTER: 350,
  AGGREGATOR: 200,
  UNKNOWN: 100,
};

const ALLOWED_SOURCE_CLASSES = new Set<ReportingSourceClass>([
  'OFFICIAL_NBA',
  'OFFICIAL_TEAM',
  'COACH_DIRECT',
  'NATIONAL_REPORTER',
  'BEAT_REPORTER',
  'AGGREGATOR',
  'UNKNOWN',
]);

export function compareReportingSources(
  a: ReportingSourceClass,
  b: ReportingSourceClass,
): number {
  return SOURCE_RANK[a] - SOURCE_RANK[b];
}

/**
 * Classify raw reporting metadata without promoting an unidentified feed.
 * Explicit upstream source_class is honored only when it is a known class.
 * The current ESPN headline feed is an aggregator unless a named reporter is
 * supplied, so it remains Tier 3 rather than being treated as first-party news.
 */
export function classifyReportingSource(input: {
  source?: string | null;
  sourceKey?: string | null;
  sourceClass?: string | null;
  sourceTier?: string | null;
  reporterName?: string | null;
}): ReportingSourceAssessment {
  const source = (input.source ?? 'unknown').trim().toLowerCase();
  const sourceKey = (input.sourceKey ?? input.reporterName ?? source).trim().toLowerCase() || 'unknown';
  const explicitClass = (input.sourceClass ?? '').toUpperCase() as ReportingSourceClass;

  if (source.includes('simulated') || sourceKey.includes('simulated')) {
    return {
      sourceKey,
      sourceClass: 'UNKNOWN',
      sourceTier: 'LOW_PRIORITY',
      dataQuality: 'LOW',
    };
  }

  if (ALLOWED_SOURCE_CLASSES.has(explicitClass)) {
    return assessmentForClass(sourceKey, explicitClass);
  }

  if (
    source.includes('official_nba') ||
    source === 'nba' ||
    source.includes('nba.com') ||
    sourceKey.includes('official_nba')
  ) {
    return assessmentForClass(sourceKey, 'OFFICIAL_NBA');
  }
  if (source.includes('official_team') || sourceKey.includes('official_team')) {
    return assessmentForClass(sourceKey, 'OFFICIAL_TEAM');
  }
  if (source.includes('coach_direct') || sourceKey.includes('coach_direct')) {
    return assessmentForClass(sourceKey, 'COACH_DIRECT');
  }
  if (input.reporterName && source.includes('espn')) {
    return assessmentForClass(sourceKey, 'NATIONAL_REPORTER');
  }
  if (source.includes('beat_reporter') || sourceKey.includes('beat_reporter')) {
    return assessmentForClass(sourceKey, 'BEAT_REPORTER');
  }
  if (source.includes('national_reporter') || sourceKey.includes('national_reporter')) {
    return assessmentForClass(sourceKey, 'NATIONAL_REPORTER');
  }
  if (source.includes('espn') || source.includes('aggregator')) {
    return assessmentForClass(sourceKey, 'AGGREGATOR');
  }

  // Do not trust an arbitrary upstream source_tier claim when its identity is
  // unknown. Unknown sources must earn promotion through an explicit registry.
  return assessmentForClass(sourceKey, 'UNKNOWN');
}

function assessmentForClass(
  sourceKey: string,
  sourceClass: ReportingSourceClass,
): ReportingSourceAssessment {
  switch (sourceClass) {
    case 'OFFICIAL_NBA':
    case 'OFFICIAL_TEAM':
    case 'COACH_DIRECT':
      return { sourceKey, sourceClass, sourceTier: 'TIER_1_OFFICIAL', dataQuality: 'HIGH' };
    case 'NATIONAL_REPORTER':
    case 'BEAT_REPORTER':
      return { sourceKey, sourceClass, sourceTier: 'TIER_3_REPORTING', dataQuality: 'MEDIUM' };
    case 'AGGREGATOR':
      return { sourceKey, sourceClass, sourceTier: 'TIER_3_REPORTING', dataQuality: 'MEDIUM' };
    default:
      return { sourceKey, sourceClass: 'UNKNOWN', sourceTier: 'LOW_PRIORITY', dataQuality: 'LOW' };
  }
}

/**
 * Resolve a discrete news claim without manufacturing consensus probabilities.
 *
 * Rules:
 * - newest claim is considered only within the highest source class represented;
 * - exact agreement inside that highest class resolves the claim;
 * - conflicting values inside the same highest class stay unresolved;
 * - lower classes can support the winner but cannot overrule a higher class;
 * - source URLs are evidence identifiers and should be retained by persistence.
 */
export function resolveReportingClaim<T>(
  claims: ReportingClaim<T>[],
  equals: (a: T, b: T) => boolean = Object.is,
): ReportingResolution<T> {
  if (!claims.length) {
    return {
      resolved: false,
      value: null,
      winningSourceClass: null,
      supportingSources: [],
      conflictingSources: [],
      reason: 'NO_REPORTING_EVIDENCE',
    };
  }

  const sorted = [...claims].sort((a, b) => {
    const classDiff = compareReportingSources(b.sourceClass, a.sourceClass);
    if (classDiff !== 0) return classDiff;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });
  const winningClass = sorted[0].sourceClass;
  const top = sorted.filter((claim) => claim.sourceClass === winningClass);
  const reference = top[0].value;
  const topAgreement = top.every((claim) => equals(claim.value, reference));

  if (!topAgreement) {
    return {
      resolved: false,
      value: null,
      winningSourceClass: winningClass,
      supportingSources: [],
      conflictingSources: top.map((claim) => claim.sourceKey),
      reason: 'SAME_TIER_CONFLICT',
    };
  }

  const supportingSources = sorted
    .filter((claim) => equals(claim.value, reference))
    .map((claim) => claim.sourceKey);
  const conflictingSources = sorted
    .filter((claim) => !equals(claim.value, reference))
    .map((claim) => claim.sourceKey);

  return {
    resolved: true,
    value: reference,
    winningSourceClass: winningClass,
    supportingSources,
    conflictingSources,
    reason: conflictingSources.length ? 'HIGHER_TIER_OVERRIDES_LOWER_TIER_CONFLICT' : 'CONSISTENT_EVIDENCE',
  };
}

export function validateReporterRegistry(
  entries: ReportingSourceRegistryEntry[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = entry.key.trim().toLowerCase();
    if (!key) errors.push('Reporter/source registry keys cannot be empty');
    if (seen.has(key)) errors.push(`Duplicate reporter/source key: ${entry.key}`);
    seen.add(key);
    if (
      (entry.sourceClass === 'OFFICIAL_TEAM' || entry.sourceClass === 'BEAT_REPORTER') &&
      !entry.teamAbbreviation
    ) {
      errors.push(`${entry.displayName} requires a teamAbbreviation for ${entry.sourceClass}`);
    }
  }
  return errors;
}
