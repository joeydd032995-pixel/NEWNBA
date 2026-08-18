import {
  compareReportingSources,
  resolveReportingClaim,
  validateReporterRegistry,
} from './news-source-registry';

describe('reporting source hierarchy', () => {
  it('ranks official NBA/team/coach sources above reporting classes', () => {
    expect(compareReportingSources('OFFICIAL_NBA', 'NATIONAL_REPORTER')).toBeGreaterThan(0);
    expect(compareReportingSources('OFFICIAL_TEAM', 'BEAT_REPORTER')).toBeGreaterThan(0);
    expect(compareReportingSources('NATIONAL_REPORTER', 'AGGREGATOR')).toBeGreaterThan(0);
  });

  it('lets a higher-tier official claim override a lower-tier conflict', () => {
    const result = resolveReportingClaim([
      {
        sourceKey: 'official-team',
        sourceClass: 'OFFICIAL_TEAM',
        value: 'OUT',
        publishedAt: new Date('2026-08-18T20:00:00Z'),
      },
      {
        sourceKey: 'national-reporter',
        sourceClass: 'NATIONAL_REPORTER',
        value: 'AVAILABLE',
        publishedAt: new Date('2026-08-18T20:02:00Z'),
      },
    ]);
    expect(result.resolved).toBe(true);
    expect(result.value).toBe('OUT');
    expect(result.reason).toBe('HIGHER_TIER_OVERRIDES_LOWER_TIER_CONFLICT');
  });

  it('keeps same-tier conflicting reports unresolved', () => {
    const result = resolveReportingClaim([
      {
        sourceKey: 'beat-a',
        sourceClass: 'BEAT_REPORTER',
        value: 'STARTING',
        publishedAt: new Date('2026-08-18T19:00:00Z'),
      },
      {
        sourceKey: 'beat-b',
        sourceClass: 'BEAT_REPORTER',
        value: 'BENCH',
        publishedAt: new Date('2026-08-18T19:02:00Z'),
      },
    ]);
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('SAME_TIER_CONFLICT');
    expect(result.conflictingSources).toEqual(expect.arrayContaining(['beat-a', 'beat-b']));
  });

  it('validates team attribution and duplicate registry keys', () => {
    const errors = validateReporterRegistry([
      {
        key: 'reporter-a', displayName: 'Reporter A', sourceClass: 'BEAT_REPORTER', active: true,
      },
      {
        key: 'REPORTER-A', displayName: 'Reporter A duplicate', sourceClass: 'NATIONAL_REPORTER', active: true,
      },
    ]);
    expect(errors.some((error) => error.includes('teamAbbreviation'))).toBe(true);
    expect(errors.some((error) => error.includes('Duplicate'))).toBe(true);
  });
});
