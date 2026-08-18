import { simulateMilestoneDistribution } from './milestone.engine';
import { projectDistribution } from './opportunity-projection.engine';
import { OpportunityProjectionInput, ProjectionStat } from './projection.types';

function component(stat: ProjectionStat, rate: number, seed: number) {
  const input: OpportunityProjectionInput = {
    stat,
    analysisMode: 'FAST',
    seed,
    trials: 2_000,
    minutes: { floor: 32, median: 35, ceiling: 38, stdDev: 1.5 },
    opportunityRatePerMinute: rate,
    conversionRate: 1,
    contextAdjustment: 1,
    uncertainty: {
      minutesStdDev: 1.2,
      opportunityRateStdDev: 0.02,
      conversionRateStdDev: 0.01,
      contextStdDev: 0.01,
      paceStdDev: 0.01,
    },
    scripts: [
      { script: 'COMPETITIVE', probability: 1, minutesMultiplier: 1, opportunityMultiplier: 1 },
    ],
    dataQuality: 'HIGH',
  };
  return projectDistribution(input);
}

describe('milestone engine', () => {
  const points = component('POINTS', 0.75, 1);
  const rebounds = component('REBOUNDS', 0.30, 2);
  const assists = component('ASSISTS', 0.28, 3);
  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  it('is reproducible with a fixed seed', () => {
    const first = simulateMilestoneDistribution({
      components: [points, rebounds, assists],
      correlationMatrix: identity,
      requiredCategories: 2,
      seed: 99,
      trials: 3_000,
      stat: 'DOUBLE_DOUBLE',
    });
    const second = simulateMilestoneDistribution({
      components: [points, rebounds, assists],
      correlationMatrix: identity,
      requiredCategories: 2,
      seed: 99,
      trials: 3_000,
      stat: 'DOUBLE_DOUBLE',
    });
    expect(first.samples).toEqual(second.samples);
    expect(first.mean).toBeGreaterThanOrEqual(0);
    expect(first.mean).toBeLessThanOrEqual(1);
  });

  it('makes triple-double probability no greater than double-double probability', () => {
    const doubleDouble = simulateMilestoneDistribution({
      components: [points, rebounds, assists],
      correlationMatrix: identity,
      requiredCategories: 2,
      seed: 101,
      trials: 4_000,
      stat: 'DOUBLE_DOUBLE',
    });
    const tripleDouble = simulateMilestoneDistribution({
      components: [points, rebounds, assists],
      correlationMatrix: identity,
      requiredCategories: 3,
      seed: 101,
      trials: 4_000,
      stat: 'TRIPLE_DOUBLE',
    });
    expect(tripleDouble.mean).toBeLessThanOrEqual(doubleDouble.mean);
  });
});
