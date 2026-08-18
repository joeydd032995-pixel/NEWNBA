import {
  opportunityPointEstimate,
  projectDistribution,
  probabilityOver,
} from './opportunity-projection.engine';
import { OpportunityProjectionInput } from './projection.types';

const baseInput: OpportunityProjectionInput = {
  stat: 'ASSISTS',
  analysisMode: 'FAST',
  seed: 4242,
  trials: 2_000,
  minutes: { floor: 32, median: 35, ceiling: 38, stdDev: 1.5 },
  opportunityRatePerMinute: 0.28,
  conversionRate: 0.72,
  contextAdjustment: 1.05,
  baselinePace: 100,
  expectedPace: 102,
  uncertainty: {
    minutesStdDev: 1.2,
    opportunityRateStdDev: 0.02,
    conversionRateStdDev: 0.03,
    contextStdDev: 0.025,
    paceStdDev: 0.01,
  },
  scripts: [
    { script: 'COMPETITIVE', probability: 0.72, minutesMultiplier: 1, opportunityMultiplier: 1 },
    { script: 'FAVORITE_CONTROL', probability: 0.18, minutesMultiplier: 0.9, opportunityMultiplier: 0.95 },
    { script: 'UNDERDOG_LEADS', probability: 0.08, minutesMultiplier: 1.03, opportunityMultiplier: 1.05 },
    { script: 'DISRUPTION', probability: 0.02, minutesMultiplier: 0.7, opportunityMultiplier: 0.8 },
  ],
  foulTroubleProbability: 0.05,
  foulMinutesPenalty: 6,
  blowoutProbability: 0.12,
  blowoutMinutesPenalty: 5,
  dataQuality: 'HIGH',
};

describe('Opportunity-First projection engine', () => {
  it('implements the documented source equation exactly for the point estimate', () => {
    const expected = 35 * 0.28 * 0.72 * 1.05 * 1.02;
    expect(opportunityPointEstimate(baseInput)).toBeCloseTo(expected, 10);
  });

  it('is exactly reproducible for the same seed and inputs', () => {
    const first = projectDistribution(baseInput);
    const second = projectDistribution(baseInput);
    expect(first.samples).toEqual(second.samples);
    expect(first.mean).toEqual(second.mean);
    expect(first.percentiles).toEqual(second.percentiles);
  });

  it('changes the simulated path when the seed changes', () => {
    const first = projectDistribution(baseInput);
    const second = projectDistribution({ ...baseInput, seed: 4243 });
    expect(first.samples).not.toEqual(second.samples);
  });

  it('returns coherent percentiles and threshold probabilities', () => {
    const result = projectDistribution(baseInput);
    expect(result.percentiles.p05).toBeLessThanOrEqual(result.percentiles.p50);
    expect(result.percentiles.p50).toBeLessThanOrEqual(result.percentiles.p95);
    const over = probabilityOver(result, result.median);
    expect(over).toBeGreaterThan(0.4);
    expect(over).toBeLessThan(0.6);
  });

  it('rejects impossible minute distributions', () => {
    expect(() => projectDistribution({
      ...baseInput,
      minutes: { floor: 38, median: 35, ceiling: 32 },
    })).toThrow();
  });
});
