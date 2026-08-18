import { applyReplacementOpportunity } from './player-prop-projection.assembler';

const replacement = {
  minutesDelta: 5,
  usageDelta: 2,
  ballHandlingDelta: 10,
  reboundChanceDelta: 4,
  fgaDelta: 3,
  threePointAttemptDelta: 1.5,
  defensiveImpact: 0.2,
  confidence: 0.8,
  quality: 'HIGH' as const,
};

describe('injury replacement opportunity integration', () => {
  it('raises scoring opportunity from redistributed shot attempts', () => {
    const result = applyReplacementOpportunity(
      'POINTS',
      { ratePerMinute: 0.5, conversionRate: 1.1 },
      replacement,
      30,
      [],
    );
    expect(result.ratePerMinute).toBeCloseTo(0.58, 5);
    expect(result.conversionRate).toBe(1.1);
  });

  it('raises rebound opportunity from redistributed rebound chances', () => {
    const result = applyReplacementOpportunity(
      'REBOUNDS',
      { ratePerMinute: 0.3, conversionRate: 0.55 },
      replacement,
      32,
      [],
    );
    expect(result.ratePerMinute).toBeGreaterThan(0.3);
  });

  it('uses observed touches to scale ball-handling effects for assists', () => {
    const result = applyReplacementOpportunity(
      'ASSISTS',
      { ratePerMinute: 0.2, conversionRate: 0.5 },
      replacement,
      32,
      [{ touches: 50 }, { touches: 50 }],
    );
    expect(result.ratePerMinute).toBeCloseTo(0.232, 5);
  });

  it('does not adjust unsupported stats without evidence', () => {
    const base = { ratePerMinute: 0.04, conversionRate: 1 };
    expect(applyReplacementOpportunity('BLOCKS', base, replacement, 30, [])).toEqual(base);
  });
});
