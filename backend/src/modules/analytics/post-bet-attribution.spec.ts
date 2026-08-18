import { ErrorAttributionType, ProcessGrade } from '@prisma/client';
import { attributePostBetProcess } from './post-bet-attribution';

describe('post-bet attribution', () => {
  it('attributes a material minutes miss before generic variance', () => {
    const result = attributePostBetProcess({
      expectedMinutes: 36,
      minutesFloor: 34,
      minutesCeiling: 38,
      actualMinutes: 29,
      clvPrice: 0.03,
    });
    expect(result.primaryError).toBe(ErrorAttributionType.MINUTES_PROJECTION);
    expect(result.rotationError).toBe(true);
    expect(result.varianceDominated).toBe(false);
  });

  it('attributes market timing when the wager closes materially better for the market', () => {
    const result = attributePostBetProcess({
      expectedMinutes: 35,
      actualMinutes: 35,
      clvPrice: -0.04,
      clvLine: -1,
    });
    expect(result.primaryError).toBe(ErrorAttributionType.MARKET_TIMING);
    expect(result.marketTimingError).toBe(true);
  });

  it('does not invent missing usage or pace errors', () => {
    const result = attributePostBetProcess({
      expectedMinutes: 35,
      actualMinutes: 35.5,
      clvPrice: 0.02,
    });
    expect(result.usageProjectionError).toBeNull();
    expect(result.paceProjectionError).toBeNull();
    expect(result.notes.join(' ')).toContain('Usage attribution unavailable');
    expect([ProcessGrade.CORRECT, ProcessGrade.MOSTLY_CORRECT]).toContain(result.processGrade);
  });
});
