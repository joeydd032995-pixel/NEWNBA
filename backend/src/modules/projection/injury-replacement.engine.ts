import { clamp } from './projection.math';

export interface MissingRoleLoad {
  minutes: number;
  usagePossessions: number;
  ballHandlingTouches: number;
  reboundChances: number;
  shotAttempts: number;
  threePointAttempts: number;
  defensiveImpact: number;
}

export interface ReplacementCandidate {
  playerId: string;
  minuteCapacity: number;
  usageAffinity: number;
  ballHandlingAffinity: number;
  reboundingAffinity: number;
  shootingAffinity: number;
  threePointAffinity: number;
  defensiveAffinity: number;
}

export interface ReplacementAllocation {
  playerId: string;
  minutesDelta: number;
  usageDelta: number;
  ballHandlingDelta: number;
  reboundChanceDelta: number;
  fgaDelta: number;
  threePointAttemptDelta: number;
  defensiveImpact: number;
  confidence: number;
}

/**
 * Redistribute components of an absent player's role independently. A reserve
 * can inherit minutes without inheriting the same share of creation, rebounding
 * or shooting; every role component has its own affinity weights.
 */
export function redistributeInjuryRole(
  missing: MissingRoleLoad,
  candidates: ReplacementCandidate[],
): ReplacementAllocation[] {
  if (!candidates.length) return [];
  const minuteWeights = normalizedWeights(candidates, (candidate) => Math.max(0, candidate.minuteCapacity));
  const usageWeights = normalizedWeights(candidates, (candidate) => candidate.usageAffinity);
  const handlingWeights = normalizedWeights(candidates, (candidate) => candidate.ballHandlingAffinity);
  const reboundWeights = normalizedWeights(candidates, (candidate) => candidate.reboundingAffinity);
  const shootingWeights = normalizedWeights(candidates, (candidate) => candidate.shootingAffinity);
  const threeWeights = normalizedWeights(candidates, (candidate) => candidate.threePointAffinity);
  const defenseWeights = normalizedWeights(candidates, (candidate) => candidate.defensiveAffinity);

  const allocations = candidates.map((candidate, index) => {
    const unconstrainedMinutes = missing.minutes * minuteWeights[index];
    const minutesDelta = Math.min(candidate.minuteCapacity, unconstrainedMinutes);
    const saturation = candidate.minuteCapacity > 0
      ? clamp(minutesDelta / candidate.minuteCapacity, 0, 1)
      : 0;
    const affinityAgreement = mean([
      candidate.usageAffinity,
      candidate.ballHandlingAffinity,
      candidate.reboundingAffinity,
      candidate.shootingAffinity,
      candidate.threePointAffinity,
      candidate.defensiveAffinity,
    ].map((value) => clamp(value, 0, 1)));

    return {
      playerId: candidate.playerId,
      minutesDelta,
      usageDelta: missing.usagePossessions * usageWeights[index],
      ballHandlingDelta: missing.ballHandlingTouches * handlingWeights[index],
      reboundChanceDelta: missing.reboundChances * reboundWeights[index],
      fgaDelta: missing.shotAttempts * shootingWeights[index],
      threePointAttemptDelta: missing.threePointAttempts * threeWeights[index],
      defensiveImpact: missing.defensiveImpact * defenseWeights[index],
      confidence: clamp(0.45 + 0.3 * saturation + 0.25 * affinityAgreement, 0, 1),
    };
  });

  // If capacity prevented all missing minutes from being assigned, distribute
  // the remainder only to candidates with spare capacity. This never inflates
  // role components; those already sum independently to the missing load.
  let unassigned = Math.max(0, missing.minutes - allocations.reduce((sum, row) => sum + row.minutesDelta, 0));
  for (let pass = 0; pass < 4 && unassigned > 0.01; pass++) {
    const spare = candidates.map((candidate, index) => Math.max(0, candidate.minuteCapacity - allocations[index].minutesDelta));
    const spareTotal = spare.reduce((sum, value) => sum + value, 0);
    if (spareTotal <= 0) break;
    for (let index = 0; index < allocations.length; index++) {
      if (spare[index] <= 0) continue;
      const addition = Math.min(spare[index], unassigned * (spare[index] / spareTotal));
      allocations[index].minutesDelta += addition;
    }
    unassigned = Math.max(0, missing.minutes - allocations.reduce((sum, row) => sum + row.minutesDelta, 0));
  }

  return allocations.map((row) => ({
    ...row,
    minutesDelta: round2(row.minutesDelta),
    usageDelta: round3(row.usageDelta),
    ballHandlingDelta: round3(row.ballHandlingDelta),
    reboundChanceDelta: round3(row.reboundChanceDelta),
    fgaDelta: round3(row.fgaDelta),
    threePointAttemptDelta: round3(row.threePointAttemptDelta),
    defensiveImpact: round3(row.defensiveImpact),
    confidence: round3(row.confidence),
  }));
}

function normalizedWeights(
  candidates: ReplacementCandidate[],
  getter: (candidate: ReplacementCandidate) => number,
): number[] {
  const raw = candidates.map((candidate) => Math.max(0, getter(candidate)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return candidates.map(() => 1 / candidates.length);
  return raw.map((value) => value / total);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
function round2(value: number) {
  return Math.round(value * 100) / 100;
}
function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
