export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mulberry32: compact deterministic PRNG for reproducible Monte Carlo tests. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleStandardNormal(rng: () => number): number {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = Math.max(Number.EPSILON, rng());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleNormal(
  mean: number,
  stdDev: number,
  rng: () => number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  if (!Number.isFinite(stdDev) || stdDev <= 0) return clamp(mean, min, max);
  return clamp(mean + sampleStandardNormal(rng) * stdDev, min, max);
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
}

export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function percentile(sortedValues: number[], p: number): number {
  if (!sortedValues.length) return 0;
  const bounded = clamp(p, 0, 1);
  const index = (sortedValues.length - 1) * bounded;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function americanToDecimal(odds: number): number {
  if (odds === 0) throw new Error('American odds cannot be zero');
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function americanToImplied(odds: number): number {
  const decimal = americanToDecimal(odds);
  return 1 / decimal;
}

export function probabilityToAmerican(probability: number): number {
  const p = clamp(probability, 0.0001, 0.9999);
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

export function noVigTwoWay(overOdds: number, underOdds: number): { over: number; under: number } {
  const rawOver = americanToImplied(overOdds);
  const rawUnder = americanToImplied(underOdds);
  const total = rawOver + rawUnder;
  return { over: rawOver / total, under: rawUnder / total };
}

export function expectedValue(probability: number, americanOdds: number): number {
  return probability * americanToDecimal(americanOdds) - 1;
}

export function normalizeProbabilities<T extends { probability: number }>(items: T[]): T[] {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.probability), 0);
  if (total <= 0) throw new Error('Scenario probabilities must sum to a positive number');
  return items.map((item) => ({ ...item, probability: Math.max(0, item.probability) / total }));
}
