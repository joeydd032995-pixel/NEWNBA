import { projectRotationMinutes } from './rotation.engine';
import { projectDistribution } from './opportunity-projection.engine';
import { evaluateDecision } from './decision.engine';
import { OpportunityProjectionInput } from './projection.types';

describe('Opportunity-First pipeline integration', () => {
  it('runs minutes -> opportunity -> simulation -> vig-aware decision deterministically', () => {
    const minutes = projectRotationMinutes({
      recentMinutes: [34, 36, 35, 37, 34, 36, 38, 35, 37, 36],
      recentStarts: [true, true, true, true, true, true, true, true, true, true],
      starterStatus: 'CONFIRMED_STARTER',
      coachVolatility: 0.2,
      blowoutSpread: -4.5,
    });

    const input: OpportunityProjectionInput = {
      stat: 'ASSISTS',
      analysisMode: 'STANDARD',
      seed: 20260818,
      trials: 8_000,
      minutes: {
        floor: minutes.minutesFloor,
        median: minutes.minutesMedian,
        ceiling: minutes.minutesCeiling,
        stdDev: minutes.minutesStdDev,
      },
      opportunityRatePerMinute: 0.31,
      conversionRate: 0.59,
      contextAdjustment: 1.04,
      baselinePace: 99.5,
      expectedPace: 101.2,
      baselinePpp: 1.14,
      expectedPpp: 1.17,
      uncertainty: {
        minutesStdDev: minutes.minutesStdDev,
        opportunityRateStdDev: 0.025,
        conversionRateStdDev: 0.035,
        contextStdDev: 0.025,
        paceStdDev: 0.015,
      },
      scripts: [
        { script: 'COMPETITIVE', probability: 0.82, minutesMultiplier: 1, opportunityMultiplier: 1 },
        { script: 'FAVORITE_CONTROL', probability: 0.10, minutesMultiplier: 0.92, opportunityMultiplier: 0.96 },
        { script: 'UNDERDOG_LEADS', probability: 0.05, minutesMultiplier: 1.02, opportunityMultiplier: 1.03 },
        { script: 'DISRUPTION', probability: 0.03, minutesMultiplier: 0.75, opportunityMultiplier: 0.82 },
      ],
      dataQuality: 'HIGH',
    };

    const first = projectDistribution(input);
    const second = projectDistribution(input);
    expect(first.samples).toEqual(second.samples);
    expect(first.opportunityEquation.expectedMinutes).toBe(minutes.minutesMedian);
    expect(first.percentiles.p25).toBeLessThan(first.percentiles.p75);

    const decision = evaluateDecision({
      distribution: first,
      market: {
        line: 6.5,
        overOdds: -110,
        underOdds: -110,
        sportsbook: 'test-book',
      },
      dataQuality: 'HIGH',
    });

    expect(decision.checks.vigConsidered).toBe(true);
    expect(decision.checks.minutesDefensible).toBe(true);
    expect(decision.marketLine).toBe(6.5);
    expect(decision.probability).toBeGreaterThan(0);
    expect(decision.probability).toBeLessThan(1);
    expect(['PASS', 'LEAN', 'BET', 'STRONG_BET']).toContain(decision.decision);
  });

  it('downgrades unresolved availability even when the modeled distribution shows value', () => {
    const distribution = projectDistribution({
      stat: 'POINTS',
      analysisMode: 'FAST',
      seed: 9911,
      trials: 2_500,
      minutes: { floor: 33, median: 36, ceiling: 39, stdDev: 1.7 },
      opportunityRatePerMinute: 0.78,
      conversionRate: 1.02,
      contextAdjustment: 1.03,
      uncertainty: {
        minutesStdDev: 1.7,
        opportunityRateStdDev: 0.04,
        conversionRateStdDev: 0.05,
        contextStdDev: 0.03,
        paceStdDev: 0.02,
      },
      scripts: [
        { script: 'COMPETITIVE', probability: 1, minutesMultiplier: 1, opportunityMultiplier: 1 },
      ],
      dataQuality: 'MEDIUM',
      unresolvedAvailability: true,
    });

    const decision = evaluateDecision({
      distribution,
      market: { line: 23.5, overOdds: -105, underOdds: -115 },
      dataQuality: 'MEDIUM',
      unresolvedAvailability: true,
    });
    expect(['WAIT', 'PASS']).toContain(decision.decision);
    expect(decision.checks.currentInformation).toBe(false);
  });
});
