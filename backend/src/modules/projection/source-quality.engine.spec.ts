import { assessAvailability } from './source-quality.engine';

describe('source quality engine', () => {
  const now = new Date('2026-08-18T04:00:00.000Z');

  it('prefers a current official NBA observation over lower-tier reporting', () => {
    const result = assessAvailability([
      {
        value: 'QUESTIONABLE',
        source: 'reporter',
        tier: 'TIER_3_REPORTING',
        updatedAt: new Date('2026-08-18T03:55:00.000Z'),
      },
      {
        value: 'OUT',
        source: 'official-nba-injury-report',
        tier: 'TIER_1_OFFICIAL',
        updatedAt: new Date('2026-08-18T03:40:00.000Z'),
      },
    ], now);

    expect(result.status).toBe('OUT');
    expect(result.authoritativeSource).toBe('official-nba-injury-report');
    expect(result.dataQuality).toBe('HIGH');
    expect(result.probability).toBeLessThan(0.1);
  });

  it('never treats simulated evidence as eligible', () => {
    const result = assessAvailability([
      {
        value: 'ACTIVE',
        source: 'simulated',
        tier: 'SIMULATED',
        updatedAt: new Date('2026-08-18T03:59:00.000Z'),
      },
    ], now);
    expect(result.status).toBeNull();
    expect(result.dataQuality).toBe('LOW');
    expect(result.probability).toBe(0.5);
  });

  it('downgrades quality when nearby credible sources conflict', () => {
    const result = assessAvailability([
      {
        value: 'QUESTIONABLE',
        source: 'official-team',
        tier: 'TIER_1_OFFICIAL',
        updatedAt: new Date('2026-08-18T03:50:00.000Z'),
      },
      {
        value: 'OUT',
        source: 'high-quality-feed',
        tier: 'TIER_2_HIGH_QUALITY',
        updatedAt: new Date('2026-08-18T03:52:00.000Z'),
      },
    ], now);
    expect(result.conflict).toBe(true);
    expect(result.dataQuality).toBe('LOW');
  });

  it('regresses stale information toward uncertainty', () => {
    const fresh = assessAvailability([
      {
        value: 'OUT', source: 'official', tier: 'TIER_1_OFFICIAL',
        updatedAt: new Date('2026-08-18T03:55:00.000Z'),
      },
    ], now);
    const stale = assessAvailability([
      {
        value: 'OUT', source: 'official', tier: 'TIER_1_OFFICIAL',
        updatedAt: new Date('2026-08-16T03:55:00.000Z'),
      },
    ], now);
    expect(Math.abs(stale.probability - 0.5)).toBeLessThan(Math.abs(fresh.probability - 0.5));
  });
});
