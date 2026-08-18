import { ProjectionDistribution, ProjectionStat } from './projection.types';
import { clamp, mean, percentile, sampleStandardNormal, seededRandom, stdDev } from './projection.math';

/**
 * Simulate double-/triple-double attainment from correlated component
 * distributions. The usual threshold is 10, but the function is generic for
 * future milestone markets. A sample is 1 when at least requiredCategories
 * component statistics clear the threshold, otherwise 0.
 */
export function simulateMilestoneDistribution(params: {
  components: ProjectionDistribution[];
  correlationMatrix: number[][];
  requiredCategories: number;
  threshold?: number;
  seed: number;
  trials?: number;
  stat: Extract<ProjectionStat, 'DOUBLE_DOUBLE' | 'TRIPLE_DOUBLE'>;
}): ProjectionDistribution {
  const {
    components,
    correlationMatrix,
    requiredCategories,
    seed,
    stat,
  } = params;
  const threshold = params.threshold ?? 10;
  const trials = params.trials ?? 25_000;

  if (components.length < requiredCategories) {
    throw new Error('Milestone requires at least as many components as qualifying categories');
  }
  validateCorrelationMatrix(correlationMatrix, components.length);

  const lower = cholesky(correlationMatrix);
  const marginals = components.map((distribution) => [...distribution.samples].sort((a, b) => a - b));
  const rng = seededRandom(seed);
  const samples: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    const independent = components.map(() => sampleStandardNormal(rng));
    const correlated = lower.map((row) =>
      row.reduce((sum, coefficient, j) => sum + coefficient * independent[j], 0),
    );

    let categories = 0;
    for (let i = 0; i < components.length; i++) {
      const value = percentile(marginals[i], clamp(normalCdf(correlated[i]), 0.0001, 0.9999));
      if (value >= threshold) categories++;
    }
    samples.push(categories >= requiredCategories ? 1 : 0);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const probability = mean(samples);
  return {
    stat,
    trials,
    seed,
    mean: probability,
    median: percentile(sorted, 0.5),
    stdDev: stdDev(samples),
    percentiles: {
      p05: percentile(sorted, 0.05),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
    },
    samples,
    uncertainty: {
      minutes: mean(components.map((component) => component.uncertainty.minutes)),
      opportunity: mean(components.map((component) => component.uncertainty.opportunity)),
      conversion: mean(components.map((component) => component.uncertainty.conversion)),
      context: mean(components.map((component) => component.uncertainty.context)),
      pace: mean(components.map((component) => component.uncertainty.pace)),
      total: components.reduce((sum, component) => sum + component.uncertainty.total, 0),
    },
    pointEstimate: probability,
    opportunityEquation: {
      expectedMinutes: mean(components.map((component) => component.opportunityEquation.expectedMinutes)),
      opportunityRatePerMinute: 0,
      opportunityRateSource: components.every(
        (component) => component.opportunityEquation.opportunityRateSource === 'POSSESSION_SHARE',
      ) ? 'POSSESSION_SHARE' : 'PER_MINUTE',
      conversionRate: 0,
      contextAdjustment: 1,
      paceAdjustment: mean(components.map((component) => component.opportunityEquation.paceAdjustment)),
      pppAdjustment: mean(components.map((component) => component.opportunityEquation.pppAdjustment)),
    },
  };
}

function validateCorrelationMatrix(matrix: number[][], size: number): void {
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new Error('Correlation matrix dimensions do not match components');
  }
}

function cholesky(matrix: number[][]): number[][] {
  const size = matrix.length;
  for (const jitter of [1e-8, 1e-6, 1e-4, 1e-3]) {
    const lower = Array.from({ length: size }, () => new Array(size).fill(0));
    let valid = true;
    for (let i = 0; i < size && valid; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) sum += lower[i][k] * lower[j][k];
        if (i === j) {
          const value = matrix[i][i] + jitter - sum;
          if (value <= 0) {
            valid = false;
            break;
          }
          lower[i][j] = Math.sqrt(value);
        } else {
          lower[i][j] = (matrix[i][j] - sum) / lower[j][j];
        }
      }
    }
    if (valid) return lower;
  }
  throw new Error('Correlation matrix is not positive semidefinite');
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * abs);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return 0.5 * (1 + sign * erf);
}
