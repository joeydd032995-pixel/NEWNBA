import {
  detectRecommendationContradictions,
  evaluateEvidenceIndependence,
} from './bias-control.engine';

describe('bias controls', () => {
  it('counts correlated efficiency statistics as one evidence group', () => {
    const result = evaluateEvidenceIndependence([
      { id: 'ortg', category: 'EFFICIENCY', direction: 'OVER', weight: 1, correlatedGroup: 'shooting-efficiency' },
      { id: 'ts', category: 'EFFICIENCY', direction: 'OVER', weight: 1, correlatedGroup: 'shooting-efficiency' },
      { id: 'minutes', category: 'MINUTES', direction: 'OVER', weight: 1 },
    ]);
    expect(result.duplicateEvidenceGroups).toContain('shooting-efficiency');
    expect(result.independentSupportCount).toBe(2);
  });

  it('flags excessive hit-rate dependence', () => {
    const result = evaluateEvidenceIndependence([
      { id: 'hit-rate', category: 'HIT_RATE', direction: 'OVER', weight: 3 },
      { id: 'minutes', category: 'MINUTES', direction: 'OVER', weight: 1 },
    ]);
    expect(result.overRelianceFlags).toContain('HIT_RATE_BIAS_RISK');
    expect(result.survivesBiasChecks).toBe(false);
  });

  it('finds same-thesis market contradictions requiring explanation', () => {
    const conflicts = detectRecommendationContradictions([
      {
        gameId: 'g1',
        teamId: 't1',
        market: 'TEAM_TOTAL',
        direction: 'UNDER',
        thesisTags: ['slow-half-court'],
      },
      {
        gameId: 'g1',
        teamId: 't1',
        playerId: 'p1',
        market: 'PLAYER_POINTS',
        direction: 'OVER',
        thesisTags: ['slow-half-court'],
      },
    ]);
    expect(conflicts).toHaveLength(1);
  });
});
