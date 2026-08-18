import { ProjectionDistribution, ProjectionStat } from './projection.types';
import { clamp, mean, percentile, sampleStandardNormal, seededRandom, stdDev } from './projection.math';

/**
 * Combine empirical marginal distributions with a Gaussian copula.
 *
 * This preserves each component's simulated distribution while imposing a
 * supplied empirical correlation matrix. The correlation matrix must come from
 * observed historical outcomes or a separately calibrated model; no hard-coded
 * betting correlations are embedded here.
 */
export function combineCorrelatedDistributions(
  distributions: ProjectionDistribution[],
  correlationMatrix: number[][],
  seed: number,
  trials = 10_000,
  compositeStat: ProjectionStat = 'PRA',
): ProjectionDistribution {
  if (distributions.length < 2) throw new Error('At least two component distributions are required');
  validateCorrelationMatrix(correlationMatrix, distributions.length);

  const lower = choleskyWithJitter(correlationMatrix);
  const sortedMarginals = distributions.map((distribution) => [...distribution.samples].sort((a, b) => a - b));
  const rng = seededRandom(seed);
  const samples: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    const independent = distributions.map(() => sampleStandardNormal(rng));
    const correlated = lower.map((row) =>
      row.reduce((sum, coefficient, j) => sum + coefficient * independent[j], 0),
    );

    let total = 0;
    for (let i = 0; i < correlated.length; i++) {
      const quantile = clamp(normalCdf(correlated[i]), 0.0001, 0.9999);
      total += percentile(sortedMarginals[i], quantile);
    }
    samples.push(Math.max(0, total));
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const componentUncertainty = distributions.reduce(
    (sum, distribution) => sum + distribution.uncertainty.total,
    0,
  );

  return {
    stat: compositeStat,
    trials,
    seed,
    mean: mean(samples),
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
      minutes: mean(distributions.map((distribution) => distribution.uncertainty.minutes)),
      opportunity: mean(distributions.map((distribution) => distribution.uncertainty.opportunity)),
      conversion: mean(distributions.map((distribution) => distribution.uncertainty.conversion)),
      context: mean(distributions.map((distribution) => distribution.uncertainty.context)),
      pace: mean(distributions.map((distribution) => distribution.uncertainty.pace)),
      total: componentUncertainty,
    },
    pointEstimate: distributions.reduce((sum, distribution) => sum + distribution.pointEstimate, 0),
    opportunityEquation: {
      expectedMinutes: mean(distributions.map((distribution) => distribution.opportunityEquation.expectedMinutes)),
      opportunityRatePerMinute: distributions.reduce(
        (sum, distribution) => sum + distribution.opportunityEquation.opportunityRatePerMinute,
        0,
      ),
      opportunityRateSource: distributions.every(
        (distribution) => distribution.opportunityEquation.opportunityRateSource === 'POSSESSION_SHARE',
      )
        ? 'POSSESSION_SHARE'
        : 'PER_MINUTE',
      conversionRate: mean(distributions.map((distribution) => distribution.opportunityEquation.conversionRate)),
      contextAdjustment: mean(distributions.map((distribution) => distribution.opportunityEquation.contextAdjustment)),
      paceAdjustment: mean(distributions.map((distribution) => distribution.opportunityEquation.paceAdjustment)),
      pppAdjustment: mean(distributions.map((distribution) => distribution.opportunityEquation.pppAdjustment)),
    },
  };
}

/**
 * Estimate P(all legs hit) from empirical simulated marginals and an empirical
 * correlation matrix. This is the replacement primitive for hard-coded SGP
 * pair coefficients.
 */
export function correlatedJointProbability(
  distributions: ProjectionDistribution[],
  lines: number[],
  directions: Array<'OVER' | 'UNDER'>,
  correlationMatrix: number[][],
  seed: number,
  trials = 25_000,
): number {
  if (distributions.length !== lines.length || lines.length !== directions.length) {
    throw new Error('Distributions, lines and directions must have equal length');
  }
  validateCorrelationMatrix(correlationMatrix, distributions.length);
  const lower = choleskyWithJitter(correlationMatrix);
  const marginals = distributions.map((distribution) => [...distribution.samples].sort((a, b) => a - b));
  const rng = seededRandom(seed);
  let hits = 0;

  for (let trial = 0; trial < trials; trial++) {
    const independent = distributions.map(() => sampleStandardNormal(rng));
    const correlated = lower.map((row) =>
      row.reduce((sum, coefficient, j) => sum + coefficient * independent[j], 0),
    );

    let allHit = true;
    for (let i = 0; i < distributions.length; i++) {
      const value = percentile(marginals[i], clamp(normalCdf(correlated[i]), 0.0001, 0.9999));
      const hit = directions[i] === 'OVER' ? value > lines[i] : value < lines[i];
      if (!hit) {
        allHit = false;
        break;
      }
    }
    if (allHit) hits++;
  }
  return hits / trials;
}

export function empiricalCorrelationMatrix(series: number[][]): number[][] {
  if (series.length < 2) throw new Error('At least two series are required');
  const length = series[0].length;
  if (length < 3 || series.some((values) => values.length !== length)) {
    throw new Error('Empirical series must be aligned and contain at least three samples');
  }
  return series.map((a, i) => series.map((b, j) => (i === j ? 1 : pearson(a, b))));
}

export function pearson(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 3) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (denomA === 0 || denomB === 0) return 0;
  return clamp(numerator / Math.sqrt(denomA * denomB), -0.95, 0.95);
}

function validateCorrelationMatrix(matrix: number[][], size: number): void {
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new Error('Correlation matrix dimensions do not match distributions');
  }
  for (let i = 0; i < size; i++) {
    if (Math.abs(matrix[i][i] - 1) > 1e-6) throw new Error('Correlation matrix diagonal must equal 1');
    for (let j = 0; j < size; j++) {
      if (matrix[i][j] < -1 || matrix[i][j] > 1) throw new Error('Correlation values must be within [-1, 1]');
      if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-6) throw new Error('Correlation matrix must be symmetric');
    }
  }
}

function choleskyWithJitter(matrix: number[][]): number[][] {
  for (const jitter of [0, 1e-10, 1e-8, 1e-6, 1e-4]) {
    try {
      return cholesky(matrix, jitter);
    } catch {
      // Try a minimal diagonal regularization before rejecting a nearly-PSD matrix.
    }
  }
  throw new Error('Correlation matrix is not positive semidefinite');
}

function cholesky(matrix: number[][], jitter: number): number[][] {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += lower[i][k] * lower[j][k];
      if (i === j) {
        const value = matrix[i][i] + jitter - sum;
        if (value <= 0) throw new Error('Matrix is not positive definite');
        lower[i][j] = Math.sqrt(value);
      } else {
        lower[i][j] = (matrix[i][j] - sum) / lower[j][j];
      }
    }
  }
  return lower;
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * abs);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-abs * abs);
  return 0.5 * (1 + sign * erf);
}
