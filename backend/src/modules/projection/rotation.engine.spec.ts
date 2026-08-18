import { projectRotationMinutes } from './rotation.engine';
import { redistributeInjuryRole } from './injury-replacement.engine';

describe('rotation and injury redistribution', () => {
  it('moves a newly confirmed starter upward without exceeding a restriction', () => {
    const projection = projectRotationMinutes({
      recentMinutes: [25, 27, 26, 28, 24, 29],
      recentStarts: [false, false, false, false, false, false],
      starterStatus: 'CONFIRMED_STARTER',
      explicitRestrictionMinutes: 30,
      coachVolatility: 0.2,
    });
    expect(projection.minutesMedian).toBeGreaterThan(26);
    expect(projection.minutesMedian).toBeLessThanOrEqual(30);
    expect(projection.minutesFloor).toBeLessThan(projection.minutesCeiling);
  });

  it('redistributes role components independently', () => {
    const result = redistributeInjuryRole(
      {
        minutes: 34,
        usagePossessions: 20,
        ballHandlingTouches: 70,
        reboundChances: 8,
        shotAttempts: 17,
        threePointAttempts: 7,
        defensiveImpact: 2,
      },
      [
        {
          playerId: 'guard', minuteCapacity: 20, usageAffinity: 0.9, ballHandlingAffinity: 1,
          reboundingAffinity: 0.2, shootingAffinity: 0.8, threePointAffinity: 0.8, defensiveAffinity: 0.4,
        },
        {
          playerId: 'wing', minuteCapacity: 18, usageAffinity: 0.5, ballHandlingAffinity: 0.3,
          reboundingAffinity: 0.8, shootingAffinity: 0.6, threePointAffinity: 0.7, defensiveAffinity: 0.9,
        },
      ],
    );
    const guard = result.find((row) => row.playerId === 'guard')!;
    const wing = result.find((row) => row.playerId === 'wing')!;
    expect(guard.ballHandlingDelta).toBeGreaterThan(wing.ballHandlingDelta);
    expect(wing.reboundChanceDelta).toBeGreaterThan(guard.reboundChanceDelta);
    expect(result.reduce((sum, row) => sum + row.minutesDelta, 0)).toBeCloseTo(34, 1);
  });
});
