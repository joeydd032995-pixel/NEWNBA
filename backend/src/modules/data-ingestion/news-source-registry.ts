export type ReportingSourceClass =
  | 'OFFICIAL_NBA'
  | 'OFFICIAL_TEAM'
  | 'COACH_DIRECT'
  | 'NATIONAL_REPORTER'
  | 'BEAT_REPORTER'
  | 'AGGREGATOR'
  | 'UNKNOWN';

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

const SOURCE_RANK: Record<ReportingSourceClass, number> = {
  OFFICIAL_NBA: 600,
  OFFICIAL_TEAM: 550,
  COACH_DIRECT: 525,
  NATIONAL_REPORTER: 400,
  BEAT_REPORTER: 350,
  AGGREGATOR: 200,
  UNKNOWN: 100,
};

export function compareReportingSources(
  a: ReportingSourceClass,
  b: ReportingSourceClass,
): number {
  return SOURCE_RANK[a] - SOURCE_RANK[b];
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
