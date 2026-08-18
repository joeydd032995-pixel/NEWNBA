import { deriveTeamScheduleContext } from './schedule-environment.job';

const DAY = 24 * 60 * 60 * 1000;
const target = new Date('2026-02-10T01:00:00Z');

function game(id: string, daysAgo: number, homeTeamId = 'A', awayTeamId = 'B') {
  return {
    id,
    startTime: new Date(target.getTime() - daysAgo * DAY),
    homeTeamId,
    awayTeamId,
  };
}

describe('schedule-derived environment', () => {
  it('identifies a back-to-back from the prior-day game', () => {
    const result = deriveTeamScheduleContext('A', target, [game('g1', 1)]);
    expect(result.backToBack).toBe(true);
    expect(result.previousEventId).toBe('g1');
    expect(result.restDays).toBeCloseTo(0, 5);
  });

  it('identifies 3-in-4 and 4-in-6 density', () => {
    const result = deriveTeamScheduleContext('A', target, [
      game('g1', 1),
      game('g2', 3),
      game('g3', 5),
    ]);
    expect(result.threeInFour).toBe(true);
    expect(result.fourInSix).toBe(true);
  });

  it('ignores games belonging only to other teams', () => {
    const result = deriveTeamScheduleContext('A', target, [
      game('x1', 1, 'C', 'D'),
      game('x2', 2, 'E', 'F'),
    ]);
    expect(result.previousEventId).toBeNull();
    expect(result.restDays).toBeNull();
    expect(result.backToBack).toBe(false);
  });

  it('uses the most recent matching event regardless of input order', () => {
    const result = deriveTeamScheduleContext('A', target, [
      game('old', 5),
      game('recent', 2),
      game('middle', 3),
    ]);
    expect(result.previousEventId).toBe('recent');
    expect(result.backToBack).toBe(false);
    expect(result.restDays).toBeCloseTo(1, 5);
  });
});
