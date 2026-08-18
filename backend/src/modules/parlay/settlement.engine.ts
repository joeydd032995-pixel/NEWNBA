export type LegSettlementStatus = 'PENDING' | 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
export type SettlementDirection = 'OVER' | 'UNDER' | 'YES' | 'NO' | 'HOME' | 'AWAY' | 'OTHER';

export interface StatLegSettlementInput {
  direction: 'OVER' | 'UNDER';
  line: number;
  actualValue: number;
}

export interface BinaryLegSettlementInput {
  direction: 'YES' | 'NO';
  actualResult: boolean;
}

export interface PricedLeg {
  status: LegSettlementStatus;
  americanOdds: number;
}

export interface ParlaySettlementResult {
  status: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
  effectiveLegs: number;
  winningLegs: number;
  pushedLegs: number;
  voidLegs: number;
  decimalOdds: number | null;
  stakeReturned: number | null;
  profitLoss: number | null;
}

export function settleStatLeg(input: StatLegSettlementInput): LegSettlementStatus {
  assertFinite(input.line, 'line');
  assertFinite(input.actualValue, 'actualValue');
  if (input.actualValue === input.line) return 'PUSH';
  if (input.direction === 'OVER') return input.actualValue > input.line ? 'WIN' : 'LOSS';
  return input.actualValue < input.line ? 'WIN' : 'LOSS';
}

export function settleBinaryLeg(input: BinaryLegSettlementInput): LegSettlementStatus {
  const selection = input.direction === 'YES';
  return input.actualResult === selection ? 'WIN' : 'LOSS';
}

export function americanToDecimal(odds: number): number {
  assertFinite(odds, 'americanOdds');
  if (odds === 0) throw new Error('American odds cannot be zero');
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

/**
 * Settle a parlay using sportsbook-neutral accounting semantics.
 *
 * - Any LOSS loses the entire ticket.
 * - PUSH and VOID legs are removed from the multiplier.
 * - If all resolved legs are PUSH/VOID, the stake is returned.
 * - Any PENDING leg keeps the ticket pending unless a LOSS already makes the
 *   final result certain.
 *
 * This function deliberately does not invent operator-specific dead-heat,
 * resettlement or early-payout rules. Those belong in sportsbook adapters.
 */
export function settleParlay(
  legs: PricedLeg[],
  stake: number,
): ParlaySettlementResult {
  if (!legs.length) throw new Error('At least one parlay leg is required');
  assertFinite(stake, 'stake');
  if (stake < 0) throw new Error('Stake cannot be negative');

  const counts = {
    winningLegs: legs.filter((leg) => leg.status === 'WIN').length,
    pushedLegs: legs.filter((leg) => leg.status === 'PUSH').length,
    voidLegs: legs.filter((leg) => leg.status === 'VOID').length,
  };

  if (legs.some((leg) => leg.status === 'LOSS')) {
    return {
      status: 'LOST',
      effectiveLegs: legs.filter((leg) => leg.status === 'WIN' || leg.status === 'LOSS').length,
      ...counts,
      decimalOdds: 0,
      stakeReturned: 0,
      profitLoss: -stake,
    };
  }

  if (legs.some((leg) => leg.status === 'PENDING')) {
    return {
      status: 'PENDING',
      effectiveLegs: legs.filter((leg) => leg.status === 'WIN').length,
      ...counts,
      decimalOdds: null,
      stakeReturned: null,
      profitLoss: null,
    };
  }

  const effective = legs.filter((leg) => leg.status === 'WIN');
  if (!effective.length) {
    const status = legs.every((leg) => leg.status === 'VOID') ? 'VOID' : 'PUSH';
    return {
      status,
      effectiveLegs: 0,
      ...counts,
      decimalOdds: 1,
      stakeReturned: stake,
      profitLoss: 0,
    };
  }

  const decimalOdds = effective.reduce(
    (product, leg) => product * americanToDecimal(leg.americanOdds),
    1,
  );
  const stakeReturned = stake * decimalOdds;

  return {
    status: 'WON',
    effectiveLegs: effective.length,
    ...counts,
    decimalOdds,
    stakeReturned,
    profitLoss: stakeReturned - stake,
  };
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
}
