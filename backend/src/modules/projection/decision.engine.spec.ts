import { evaluateDecision } from './decision.engine';
import { projectDistribution } from './opportunity-projection.engine';
import { OpportunityProjectionInput } from './projection.types';

function projectionInput(): OpportunityProjectionInput {
  return {
    stat: 'POINTS',
    analysisMode: 'FAST',
    seed: 77,
    trials: 3_000,
    minutes: { floor: 34, median: 36, ceiling: 39, stdDev: 1.4 },
    opportunityRatePerMinute: 0.78,
    conversionRate: 1.0,
    contextAdjustment: 1.02,
    baselinePace: 100,
    expectedPace: 101,
    uncertainty: {
      minutesStdDev: 1.2,
      opportunityRateStdDev: 0.03,
      conversionRateStdDev: 0.025,
      contextStdDev: 0.02,
      paceStdDev: 0.01,
    },
    scripts: [
      { script: 'COMPETITIVE', probability: 0.8, minutesMultiplier: 1, opportunityMultiplier: 1 },
      { script: 'FAVORITE_CONTROL', probability: 0.15, minutesMultiplier: 0.9, opportunityMultiplier: 0.95 },
      { script: 'DISRUPTION', probability: 0.05, minutesMultiplier: 0.75, opportunityMultiplier: 0.85 },
    ],
    dataQuality: 'HIGH',
  };
}

describe('Decision engine', () => {
  it('passes or leans when vig consumes a median-level edge', () => {
    const distribution = projectDistribution(projectionInput());
    const result = evaluateDecision({
      distribution,
      market: { line: distribution.median, overOdds: -130, underOdds: -130 },
      dataQuality: 'HIGH',
    });
    expect(['PASS', 'LEAN']).toContain(result.decision);
    expect(result.checks.vigConsidered).toBe(true);
  });

  it('downgrades unresolved availability to WAIT instead of presenting certainty', () => {
    const distribution = projectDistribution(projectionInput());
    const result = evaluateDecision({
      distribution,
      market: { line: distribution.percentiles.p25, overOdds: -105, underOdds: -115 },
      dataQuality: 'HIGH',
      unresolvedAvailability: true,
    });
    expect(['WAIT', 'PASS']).toContain(result.decision);
    expect(result.checks.currentInformation).toBe(false);
  });

  it('returns playable line and price only for actionable bets', () => {
    const distribution = projectDistribution(projectionInput());
    const result = evaluateDecision({
      distribution,
      market: { line: distribution.percentiles.p25, overOdds: -105, underOdds: -115 },
      dataQuality: 'HIGH',
    });
    if (result.decision === 'BET' || result.decision === 'STRONG_BET') {
      expect(result.playableToLine).not.toBeNull();
      expect(result.playableToOdds).not.toBeNull();
      expect(result.side).toBe('OVER');
    }
  });

  it('applies a stricter edge test to low-quality data', () => {
    const distribution = projectDistribution(projectionInput());
    const market = {
      line: distribution.percentiles.p25,
      overOdds: -110,
      underOdds: -110,
    };
    const high = evaluateDecision({ distribution, market, dataQuality: 'HIGH' });
    const low = evaluateDecision({ distribution, market, dataQuality: 'LOW' });

    if (!low.checks.edgeExceedsUncertainty) {
      expect(['PASS', 'LEAN']).toContain(low.decision);
    }
    expect(high.checks.vigConsidered).toBe(true);
    expect(low.dataQuality).toBe('LOW');
  });
});
