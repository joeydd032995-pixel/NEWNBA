import {
  OpportunityProjectionInput,
  ProjectionDistribution,
  GameScriptInput,
} from './projection.types';
import {
  clamp,
  mean,
  normalizeProbabilities,
  percentile,
  sampleNormal,
  seededRandom,
  stdDev,
} from './projection.math';

const MODE_TRIALS: Record<OpportunityProjectionInput['analysisMode'], number> = {
  FAST: 2_500,
  STANDARD: 10_000,
  DEEP: 40_000,
};

/**
 * Opportunity-First source equation:
 *
 * Expected Production = Expected Minutes × Opportunity Rate × Conversion Rate × Context Adjustment
 *
 * Pace adjustment is treated as part of context but returned separately for auditability.
 */
export function opportunityPointEstimate(input: OpportunityProjectionInput): number {
  validateInput(input);
  const paceAdjustment = getPaceAdjustment(input);
  return (
    input.minutes.median *
    input.opportunityRatePerMinute *
    input.conversionRate *
    input.contextAdjustment *
    paceAdjustment
  );
}

export function projectDistribution(input: OpportunityProjectionInput): ProjectionDistribution {
  validateInput(input);
  const trials = input.trials ?? MODE_TRIALS[input.analysisMode];
  const rng = seededRandom(input.seed);
  const scripts = normalizeProbabilities(input.scripts);
  const paceAdjustment = getPaceAdjustment(input);
  const minuteStd = input.minutes.stdDev ?? inferMinutesStdDev(input);
  const samples: number[] = new Array(trials);

  for (let index = 0; index < trials; index++) {
    const script = sampleScript(scripts, rng());

    let minutes = sampleNormal(
      input.minutes.median,
      Math.max(minuteStd, input.uncertainty.minutesStdDev),
      rng,
      Math.max(0, input.minutes.floor),
      Math.max(input.minutes.floor, input.minutes.ceiling),
    );

    if (rng() < (input.foulTroubleProbability ?? 0)) {
      minutes = Math.max(0, minutes - (input.foulMinutesPenalty ?? 6));
    }
    if (rng() < (input.blowoutProbability ?? 0)) {
      minutes = Math.max(0, minutes - (input.blowoutMinutesPenalty ?? 5));
    }

    minutes *= script.minutesMultiplier;

    const opportunityRate = sampleNormal(
      input.opportunityRatePerMinute * script.opportunityMultiplier,
      input.uncertainty.opportunityRateStdDev,
      rng,
      0,
    );
    const conversionRate = sampleNormal(
      input.conversionRate * (script.conversionMultiplier ?? 1),
      input.uncertainty.conversionRateStdDev,
      rng,
      0,
    );
    const context = sampleNormal(
      input.contextAdjustment * (script.contextMultiplier ?? 1),
      input.uncertainty.contextStdDev,
      rng,
      0,
    );
    const pace = sampleNormal(
      paceAdjustment,
      input.uncertainty.paceStdDev,
      rng,
      0.5,
      1.5,
    );

    // Production remains continuous at the model layer. Sportsbook threshold
    // probabilities are computed against this distribution; no rounding is done
    // before pricing because that would introduce artificial discontinuities.
    samples[index] = Math.max(0, minutes * opportunityRate * conversionRate * context * pace);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const totalUncertainty = Math.sqrt(
    Math.pow(input.uncertainty.minutesStdDev, 2) +
      Math.pow(input.uncertainty.opportunityRateStdDev, 2) +
      Math.pow(input.uncertainty.conversionRateStdDev, 2) +
      Math.pow(input.uncertainty.contextStdDev, 2) +
      Math.pow(input.uncertainty.paceStdDev, 2),
  );

  return {
    stat: input.stat,
    trials,
    seed: input.seed,
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
      minutes: input.uncertainty.minutesStdDev,
      opportunity: input.uncertainty.opportunityRateStdDev,
      conversion: input.uncertainty.conversionRateStdDev,
      context: input.uncertainty.contextStdDev,
      pace: input.uncertainty.paceStdDev,
      total: totalUncertainty,
    },
    pointEstimate: opportunityPointEstimate(input),
    opportunityEquation: {
      expectedMinutes: input.minutes.median,
      opportunityRatePerMinute: input.opportunityRatePerMinute,
      conversionRate: input.conversionRate,
      contextAdjustment: input.contextAdjustment,
      paceAdjustment,
    },
  };
}

export function probabilityOver(distribution: ProjectionDistribution, line: number): number {
  if (!distribution.samples.length) return 0.5;
  return distribution.samples.filter((sample) => sample > line).length / distribution.samples.length;
}

export function probabilityUnder(distribution: ProjectionDistribution, line: number): number {
  if (!distribution.samples.length) return 0.5;
  return distribution.samples.filter((sample) => sample < line).length / distribution.samples.length;
}

export function alternateLineCurve(
  distribution: ProjectionDistribution,
  lines: number[],
): Array<{ line: number; overProbability: number; underProbability: number }> {
  return lines.map((line) => ({
    line,
    overProbability: probabilityOver(distribution, line),
    underProbability: probabilityUnder(distribution, line),
  }));
}

function getPaceAdjustment(input: OpportunityProjectionInput): number {
  if (!input.expectedPace || !input.baselinePace || input.baselinePace <= 0) return 1;
  return clamp(input.expectedPace / input.baselinePace, 0.8, 1.2);
}

function inferMinutesStdDev(input: OpportunityProjectionInput): number {
  const width = Math.max(0, input.minutes.ceiling - input.minutes.floor);
  return Math.max(0.5, width / 4);
}

function sampleScript(scripts: GameScriptInput[], draw: number): GameScriptInput {
  let cumulative = 0;
  for (const script of scripts) {
    cumulative += script.probability;
    if (draw <= cumulative) return script;
  }
  return scripts[scripts.length - 1];
}

function validateInput(input: OpportunityProjectionInput): void {
  if (!Number.isFinite(input.seed)) throw new Error('A finite simulation seed is required');
  if (input.minutes.floor < 0) throw new Error('Minutes floor cannot be negative');
  if (input.minutes.ceiling < input.minutes.floor) throw new Error('Minutes ceiling must be >= floor');
  if (input.minutes.median < input.minutes.floor || input.minutes.median > input.minutes.ceiling) {
    throw new Error('Minutes median must fall inside the floor/ceiling range');
  }
  if (input.opportunityRatePerMinute < 0) throw new Error('Opportunity rate cannot be negative');
  if (input.conversionRate < 0) throw new Error('Conversion rate cannot be negative');
  if (input.contextAdjustment <= 0) throw new Error('Context adjustment must be positive');
  if (!input.scripts.length) throw new Error('At least one game script is required');
  if (input.scripts.some((script) => script.probability < 0)) {
    throw new Error('Game script probabilities cannot be negative');
  }
  if (input.trials !== undefined && (!Number.isInteger(input.trials) || input.trials < 500)) {
    throw new Error('Explicit trial count must be an integer >= 500');
  }
}
