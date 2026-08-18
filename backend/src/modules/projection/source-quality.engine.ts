import { DataQuality } from './projection.types';

export type SourceTier =
  | 'TIER_1_OFFICIAL'
  | 'TIER_2_HIGH_QUALITY'
  | 'TIER_3_REPORTING'
  | 'LOW_PRIORITY'
  | 'SIMULATED';

export type AvailabilityStatus =
  | 'ACTIVE'
  | 'PROBABLE'
  | 'QUESTIONABLE'
  | 'GTD'
  | 'DOUBTFUL'
  | 'OUT';

export interface SourceObservation<T> {
  value: T;
  source: string;
  tier: SourceTier;
  updatedAt: Date;
}

export interface AvailabilityAssessment {
  status: AvailabilityStatus | null;
  probability: number;
  dataQuality: DataQuality;
  conflict: boolean;
  authoritativeSource: string | null;
  sourceTier: SourceTier | null;
  ageMinutes: number | null;
  observationsUsed: number;
}

const BASE_AVAILABILITY: Record<AvailabilityStatus, number> = {
  ACTIVE: 0.995,
  PROBABLE: 0.94,
  QUESTIONABLE: 0.55,
  GTD: 0.5,
  DOUBTFUL: 0.15,
  OUT: 0.005,
};

const TIER_RANK: Record<SourceTier, number> = {
  TIER_1_OFFICIAL: 4,
  TIER_2_HIGH_QUALITY: 3,
  TIER_3_REPORTING: 2,
  LOW_PRIORITY: 1,
  SIMULATED: 0,
};

/**
 * Resolve availability by hierarchy first, freshness second.
 * Simulated observations are never eligible as evidence.
 */
export function assessAvailability(
  observations: SourceObservation<AvailabilityStatus>[],
  now = new Date(),
): AvailabilityAssessment {
  const eligible = observations
    .filter((observation) => observation.tier !== 'SIMULATED')
    .filter((observation) => observation.updatedAt.getTime() <= now.getTime())
    .sort((a, b) => {
      const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      return tierDiff !== 0 ? tierDiff : b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  if (!eligible.length) {
    return {
      status: null,
      probability: 0.5,
      dataQuality: 'LOW',
      conflict: false,
      authoritativeSource: null,
      sourceTier: null,
      ageMinutes: null,
      observationsUsed: 0,
    };
  }

  const authoritative = eligible[0];
  const ageMinutes = Math.max(0, (now.getTime() - authoritative.updatedAt.getTime()) / 60_000);
  const conflict = eligible.some(
    (observation) =>
      observation !== authoritative &&
      TIER_RANK[observation.tier] >= TIER_RANK[authoritative.tier] - 1 &&
      observation.value !== authoritative.value &&
      Math.abs(observation.updatedAt.getTime() - authoritative.updatedAt.getTime()) <= 6 * 60 * 60 * 1000,
  );

  const freshnessWeight = availabilityFreshnessWeight(ageMinutes);
  const tierWeight = availabilityTierWeight(authoritative.tier);
  const base = BASE_AVAILABILITY[authoritative.value];
  // Lower-quality/older evidence regresses toward 50% rather than inventing certainty.
  const probability = 0.5 + (base - 0.5) * freshnessWeight * tierWeight;

  let dataQuality: DataQuality = 'LOW';
  if (!conflict && authoritative.tier === 'TIER_1_OFFICIAL' && ageMinutes <= 180) {
    dataQuality = 'HIGH';
  } else if (!conflict && TIER_RANK[authoritative.tier] >= 2 && ageMinutes <= 720) {
    dataQuality = 'MEDIUM';
  }

  return {
    status: authoritative.value,
    probability,
    dataQuality,
    conflict,
    authoritativeSource: authoritative.source,
    sourceTier: authoritative.tier,
    ageMinutes,
    observationsUsed: eligible.length,
  };
}

/** Very-fast-decay information: meaningful confidence loss after a few hours. */
export function availabilityFreshnessWeight(ageMinutes: number): number {
  if (ageMinutes <= 60) return 1;
  if (ageMinutes <= 180) return 0.95;
  if (ageMinutes <= 360) return 0.8;
  if (ageMinutes <= 720) return 0.6;
  if (ageMinutes <= 1_440) return 0.35;
  return 0.15;
}

export function roleFreshnessWeight(ageDays: number): number {
  if (ageDays <= 1) return 1;
  if (ageDays <= 3) return 0.9;
  if (ageDays <= 7) return 0.75;
  if (ageDays <= 14) return 0.55;
  return 0.35;
}

export function stableTraitFreshnessWeight(ageDays: number): number {
  if (ageDays <= 30) return 1;
  if (ageDays <= 90) return 0.95;
  if (ageDays <= 180) return 0.85;
  if (ageDays <= 365) return 0.7;
  return 0.5;
}

function availabilityTierWeight(tier: SourceTier): number {
  switch (tier) {
    case 'TIER_1_OFFICIAL': return 1;
    case 'TIER_2_HIGH_QUALITY': return 0.9;
    case 'TIER_3_REPORTING': return 0.75;
    case 'LOW_PRIORITY': return 0.45;
    case 'SIMULATED': return 0;
  }
}
