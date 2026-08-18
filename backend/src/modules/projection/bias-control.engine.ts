export type EvidenceCategory =
  | 'MINUTES'
  | 'ROLE'
  | 'OPPORTUNITY'
  | 'USAGE'
  | 'MATCHUP'
  | 'PACE_ENVIRONMENT'
  | 'EFFICIENCY'
  | 'MARKET_PRICE'
  | 'RECENT_RESULTS'
  | 'HIT_RATE'
  | 'NARRATIVE';

export interface EvidenceSignal {
  id: string;
  category: EvidenceCategory;
  direction: 'OVER' | 'UNDER' | 'NEUTRAL';
  weight: number;
  correlatedGroup?: string;
}

export interface BiasControlResult {
  independentSupportCount: number;
  duplicateEvidenceGroups: string[];
  overRelianceFlags: string[];
  survivesBiasChecks: boolean;
}

/**
 * Prevent multiple versions of the same underlying signal from masquerading as
 * independent confirmation. Example: ORtg, TS% and eFG% can share one shooting
 * efficiency correlatedGroup.
 */
export function evaluateEvidenceIndependence(signals: EvidenceSignal[]): BiasControlResult {
  const active = signals.filter((signal) => signal.weight > 0 && signal.direction !== 'NEUTRAL');
  const groups = new Map<string, EvidenceSignal[]>();
  for (const signal of active) {
    const key = signal.correlatedGroup ?? `independent:${signal.id}`;
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }

  const duplicateEvidenceGroups = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([group]) => group);

  const categoryWeights = new Map<EvidenceCategory, number>();
  const totalWeight = active.reduce((sum, signal) => sum + signal.weight, 0);
  for (const signal of active) {
    categoryWeights.set(signal.category, (categoryWeights.get(signal.category) ?? 0) + signal.weight);
  }

  const overRelianceFlags: string[] = [];
  if (totalWeight > 0) {
    for (const [category, weight] of categoryWeights.entries()) {
      if (weight / totalWeight > 0.5) overRelianceFlags.push(`OVER_RELIANCE_${category}`);
    }
  }
  if ((categoryWeights.get('RECENT_RESULTS') ?? 0) / Math.max(totalWeight, 1) > 0.25) {
    overRelianceFlags.push('RECENCY_BIAS_RISK');
  }
  if ((categoryWeights.get('HIT_RATE') ?? 0) / Math.max(totalWeight, 1) > 0.2) {
    overRelianceFlags.push('HIT_RATE_BIAS_RISK');
  }
  if ((categoryWeights.get('NARRATIVE') ?? 0) > 0) {
    overRelianceFlags.push('NARRATIVE_EVIDENCE_PRESENT');
  }

  return {
    independentSupportCount: groups.size,
    duplicateEvidenceGroups,
    overRelianceFlags,
    survivesBiasChecks: overRelianceFlags.length === 0 && groups.size >= 2,
  };
}

export interface RecommendationConsistencyInput {
  gameId: string;
  teamId?: string;
  playerId?: string;
  market: 'GAME_TOTAL' | 'TEAM_TOTAL' | 'PLAYER_POINTS' | 'PLAYER_ASSISTS' | 'PLAYER_REBOUNDS' | 'SPREAD' | 'MONEYLINE';
  direction: 'OVER' | 'UNDER' | 'HOME' | 'AWAY';
  thesisTags: string[];
}

export interface ConsistencyConflict {
  firstIndex: number;
  secondIndex: number;
  reason: string;
}

/** Flag obvious thesis contradictions that require explanation before reporting. */
export function detectRecommendationContradictions(
  recommendations: RecommendationConsistencyInput[],
): ConsistencyConflict[] {
  const conflicts: ConsistencyConflict[] = [];
  for (let i = 0; i < recommendations.length; i++) {
    for (let j = i + 1; j < recommendations.length; j++) {
      const a = recommendations[i];
      const b = recommendations[j];
      if (a.gameId !== b.gameId) continue;

      const sharedTags = a.thesisTags.filter((tag) => b.thesisTags.includes(tag));
      if (!sharedTags.length) continue;

      if (
        a.teamId && b.teamId && a.teamId === b.teamId &&
        ((a.market === 'TEAM_TOTAL' && a.direction === 'UNDER' && b.market === 'PLAYER_POINTS' && b.direction === 'OVER') ||
          (b.market === 'TEAM_TOTAL' && b.direction === 'UNDER' && a.market === 'PLAYER_POINTS' && a.direction === 'OVER'))
      ) {
        conflicts.push({
          firstIndex: i,
          secondIndex: j,
          reason: `Shared thesis (${sharedTags.join(', ')}) supports a team-total Under and same-team scoring Over; explicit reconciliation required.`,
        });
      }

      if (
        a.market === 'GAME_TOTAL' && b.market === 'GAME_TOTAL' &&
        a.direction !== b.direction
      ) {
        conflicts.push({
          firstIndex: i,
          secondIndex: j,
          reason: 'Opposing game-total recommendations cannot share the same thesis without explicit scenario separation.',
        });
      }
    }
  }
  return conflicts;
}
