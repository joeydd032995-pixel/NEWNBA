import {
  americanToDecimal,
  settleBinaryLeg,
  settleParlay,
  settleStatLeg,
} from './settlement.engine';

describe('parlay settlement engine', () => {
  it('settles over/under stat legs including pushes', () => {
    expect(settleStatLeg({ direction: 'OVER', line: 25.5, actualValue: 28 })).toBe('WIN');
    expect(settleStatLeg({ direction: 'UNDER', line: 25.5, actualValue: 28 })).toBe('LOSS');
    expect(settleStatLeg({ direction: 'OVER', line: 25, actualValue: 25 })).toBe('PUSH');
  });

  it('settles yes/no binary legs', () => {
    expect(settleBinaryLeg({ direction: 'YES', actualResult: true })).toBe('WIN');
    expect(settleBinaryLeg({ direction: 'NO', actualResult: true })).toBe('LOSS');
  });

  it('converts American odds deterministically', () => {
    expect(americanToDecimal(-110)).toBeCloseTo(1.9090909, 6);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 6);
  });

  it('loses the ticket immediately when any leg loses', () => {
    const result = settleParlay([
      { status: 'WIN', americanOdds: -110 },
      { status: 'LOSS', americanOdds: 120 },
      { status: 'PENDING', americanOdds: -105 },
    ], 50);
    expect(result.status).toBe('LOST');
    expect(result.profitLoss).toBe(-50);
    expect(result.stakeReturned).toBe(0);
  });

  it('removes push/void legs from a winning multiplier', () => {
    const result = settleParlay([
      { status: 'WIN', americanOdds: -110 },
      { status: 'PUSH', americanOdds: -110 },
      { status: 'VOID', americanOdds: 150 },
    ], 100);
    expect(result.status).toBe('WON');
    expect(result.effectiveLegs).toBe(1);
    expect(result.decimalOdds).toBeCloseTo(100 / 110 + 1, 6);
    expect(result.profitLoss).toBeCloseTo(90.9090909, 5);
  });

  it('returns stake when every resolved leg is push/void', () => {
    const result = settleParlay([
      { status: 'PUSH', americanOdds: -110 },
      { status: 'VOID', americanOdds: 150 },
    ], 25);
    expect(result.status).toBe('PUSH');
    expect(result.stakeReturned).toBe(25);
    expect(result.profitLoss).toBe(0);
  });

  it('keeps unresolved no-loss tickets pending', () => {
    const result = settleParlay([
      { status: 'WIN', americanOdds: -110 },
      { status: 'PENDING', americanOdds: -110 },
    ], 25);
    expect(result.status).toBe('PENDING');
    expect(result.profitLoss).toBeNull();
  });
});
