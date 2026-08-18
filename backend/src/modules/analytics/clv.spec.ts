import { calculateClv } from './clv';

describe('calculateClv', () => {
  it('returns positive price CLV when the recommendation beats a more expensive close', () => {
    const result = calculateClv({ recommendedOdds: -110, closingOdds: -130 });
    expect(result.priceClv).toBeGreaterThan(0);
    expect(result.positivePriceClv).toBe(true);
  });

  it('scores an Over that closes at a higher line as positive line CLV', () => {
    const result = calculateClv({
      recommendedLine: 6.5,
      closingLine: 7.5,
      recommendedOdds: -110,
      closingOdds: -110,
      direction: 'OVER',
    });
    expect(result.lineClv).toBe(1);
    expect(result.positiveLineClv).toBe(true);
  });

  it('scores an Under that closes at a lower line as positive line CLV', () => {
    const result = calculateClv({
      recommendedLine: 7.5,
      closingLine: 6.5,
      recommendedOdds: -110,
      closingOdds: -110,
      direction: 'UNDER',
    });
    expect(result.lineClv).toBe(1);
  });

  it('does not invent line semantics for unsupported directions', () => {
    const result = calculateClv({
      recommendedLine: 1.5,
      closingLine: 2.5,
      recommendedOdds: +120,
      closingOdds: +105,
      direction: 'YES',
    });
    expect(result.lineClv).toBeNull();
  });
});
