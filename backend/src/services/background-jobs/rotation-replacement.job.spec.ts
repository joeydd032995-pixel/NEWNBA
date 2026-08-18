import { PlayerRotationRole, StarterStatus } from '@prisma/client';
import {
  classifyRotationRole,
  normalizeCandidateFeatures,
  resolveStarterStatus,
} from './rotation-replacement.job';

describe('rotation/replacement job helpers', () => {
  it('prioritizes official starter designation over expected lineups', () => {
    expect(resolveStarterStatus('p1', new Set(['p1']), new Set(), true)).toBe(StarterStatus.CONFIRMED_STARTER);
    expect(resolveStarterStatus('p2', new Set(), new Set(['p2']), true)).toBe(StarterStatus.EXPECTED_STARTER);
    expect(resolveStarterStatus('p3', new Set(), new Set(['p2']), true)).toBe(StarterStatus.BENCH);
    expect(resolveStarterStatus('p4', new Set(), new Set(), false)).toBe(StarterStatus.UNKNOWN);
  });

  it('classifies high-assist/high-usage players as primary creators', () => {
    const role = classifyRotationRole({
      playerId: 'p1', position: 'G',
      minutes: [35, 36, 34], points: [24, 22, 25], assists: [8, 7, 9], rebounds: [4, 5, 4],
      fga: [18, 17, 19], fg3a: [7, 6, 8], steals: [1, 1, 2], blocks: [0, 0, 0], usage: [29, 28, 30],
    } as any);
    expect(role).toBe(PlayerRotationRole.PRIMARY_CREATOR);
  });

  it('normalizes replacement affinities without exceeding one', () => {
    const rows = normalizeCandidateFeatures([
      { playerId: 'a', minuteCapacity: 12, usage: 0.2, handling: 40, rebounding: 8, shooting: 10, threes: 4, defense: 2 },
      { playerId: 'b', minuteCapacity: 8, usage: 0.1, handling: 20, rebounding: 12, shooting: 5, threes: 1, defense: 3 },
    ] as any);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.usageAffinity).toBeGreaterThanOrEqual(0);
      expect(row.usageAffinity).toBeLessThanOrEqual(1);
      expect(row.ballHandlingAffinity).toBeLessThanOrEqual(1);
      expect(row.reboundingAffinity).toBeLessThanOrEqual(1);
    }
  });
});
