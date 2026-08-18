import { clamp, mean, percentile, stdDev } from './projection.math';

export interface RotationMinutesInput {
  recentMinutes: number[];
  starterStatus: 'CONFIRMED_STARTER' | 'EXPECTED_STARTER' | 'BENCH' | 'UNKNOWN';
  recentStarts?: boolean[];
  explicitRestrictionMinutes?: number | null;
  returningFromInjury?: boolean;
  backToBack?: boolean;
  coachVolatility?: number;
  blowoutSpread?: number | null;
}

export interface RotationMinutesProjection {
  minutesFloor: number;
  minutesMedian: number;
  minutesCeiling: number;
  minutesStdDev: number;
  uncertaintyScore: number;
  roleAdjustment: number;
  injuryAdjustment: number;
  environmentAdjustment: number;
  sourceSampleSize: number;
}

/**
 * Project a minutes distribution before any player-stat calculation.
 * Recent minutes establish the base distribution; explicit current-role inputs
 * adjust it. The output is a range, not false single-number precision.
 */
export function projectRotationMinutes(input: RotationMinutesInput): RotationMinutesProjection {
  const minutes = input.recentMinutes.filter((value) => Number.isFinite(value) && value >= 0).slice(0, 20);
  if (minutes.length < 3) throw new Error('At least three recent minute observations are required');
  const sorted = [...minutes].sort((a, b) => a - b);
  const baseMedian = percentile(sorted, 0.5);
  const baseStd = Math.max(0.75, stdDev(minutes));

  const recentStarterRate = input.recentStarts?.length
    ? input.recentStarts.filter(Boolean).length / input.recentStarts.length
    : null;
  let roleAdjustment = 0;
  if (input.starterStatus === 'CONFIRMED_STARTER' && recentStarterRate !== null && recentStarterRate < 0.5) roleAdjustment += 3;
  if (input.starterStatus === 'EXPECTED_STARTER' && recentStarterRate !== null && recentStarterRate < 0.5) roleAdjustment += 2;
  if (input.starterStatus === 'BENCH' && recentStarterRate !== null && recentStarterRate > 0.5) roleAdjustment -= 3;

  let injuryAdjustment = 0;
  if (input.returningFromInjury) injuryAdjustment -= Math.min(3, baseStd * 0.75);
  if (input.explicitRestrictionMinutes !== null && input.explicitRestrictionMinutes !== undefined) {
    injuryAdjustment = Math.min(injuryAdjustment, input.explicitRestrictionMinutes - baseMedian - roleAdjustment);
  }

  let environmentAdjustment = input.backToBack ? -0.75 : 0;
  if (input.blowoutSpread !== null && input.blowoutSpread !== undefined) {
    const absoluteSpread = Math.abs(input.blowoutSpread);
    if (absoluteSpread >= 10) environmentAdjustment -= clamp((absoluteSpread - 8) * 0.15, 0, 2.5);
  }

  let projectedMedian = clamp(baseMedian + roleAdjustment + injuryAdjustment + environmentAdjustment, 0, 48);
  if (input.explicitRestrictionMinutes !== null && input.explicitRestrictionMinutes !== undefined) {
    projectedMedian = Math.min(projectedMedian, input.explicitRestrictionMinutes);
  }

  const coachVolatility = clamp(input.coachVolatility ?? 0.35, 0, 1);
  const uncertaintyStd = Math.max(1, baseStd * (0.85 + coachVolatility * 0.5));
  const floor = clamp(projectedMedian - 1.35 * uncertaintyStd, 0, projectedMedian);
  const ceiling = clamp(projectedMedian + 1.15 * uncertaintyStd, projectedMedian, 48);
  const restrictionUncertainty = input.returningFromInjury || input.explicitRestrictionMinutes !== null && input.explicitRestrictionMinutes !== undefined ? 0.2 : 0;
  const unknownRolePenalty = input.starterStatus === 'UNKNOWN' ? 0.25 : 0;
  const uncertaintyScore = clamp(
    0.15 + coachVolatility * 0.35 + restrictionUncertainty + unknownRolePenalty + Math.min(0.2, baseStd / 20),
    0,
    1,
  );

  return {
    minutesFloor: round1(floor),
    minutesMedian: round1(projectedMedian),
    minutesCeiling: round1(ceiling),
    minutesStdDev: round2(uncertaintyStd),
    uncertaintyScore: round3(uncertaintyScore),
    roleAdjustment: round2(roleAdjustment),
    injuryAdjustment: round2(injuryAdjustment),
    environmentAdjustment: round2(environmentAdjustment),
    sourceSampleSize: minutes.length,
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
function round2(value: number) {
  return Math.round(value * 100) / 100;
}
function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
