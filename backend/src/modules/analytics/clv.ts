export type ClvDirection = 'OVER' | 'UNDER' | 'HOME' | 'AWAY' | 'YES' | 'NO' | 'OTHER';

export interface ClvInput {
  recommendedLine?: number | null;
  closingLine?: number | null;
  recommendedOdds: number;
  closingOdds: number;
  direction?: ClvDirection | null;
}

export interface ClvResult {
  lineClv: number | null;
  priceClv: number;
  positiveLineClv: boolean | null;
  positivePriceClv: boolean;
}

export function americanToDecimalOdds(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) throw new Error('American odds must be finite and non-zero');
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

/**
 * Price CLV uses payout ratio:
 *   recommended decimal / closing decimal - 1
 * A positive result means the bettor captured a better price than the close.
 *
 * Line CLV is expressed in line points and normalized so positive is favorable:
 * - OVER: closing line - recommended line (6.5 bet, 7.5 close => +1)
 * - UNDER: recommended line - closing line (7.5 bet, 6.5 close => +1)
 * - HOME/AWAY spread: callers store the selected side's signed line, so
 *   recommended line - closing line is favorable (-3.5 bet, -4.5 close => +1;
 *   +4.5 bet, +3.5 close => +1).
 * - YES/NO/OTHER: no generic line semantics are assumed; line CLV is null.
 */
export function calculateClv(input: ClvInput): ClvResult {
  const recommendedDecimal = americanToDecimalOdds(input.recommendedOdds);
  const closingDecimal = americanToDecimalOdds(input.closingOdds);
  const priceClv = recommendedDecimal / closingDecimal - 1;

  let lineClv: number | null = null;
  if (
    input.recommendedLine !== null &&
    input.recommendedLine !== undefined &&
    input.closingLine !== null &&
    input.closingLine !== undefined
  ) {
    if (input.direction === 'OVER') {
      lineClv = input.closingLine - input.recommendedLine;
    } else if (input.direction === 'UNDER') {
      lineClv = input.recommendedLine - input.closingLine;
    } else if (input.direction === 'HOME' || input.direction === 'AWAY') {
      lineClv = input.recommendedLine - input.closingLine;
    }
  }

  return {
    lineClv,
    priceClv,
    positiveLineClv: lineClv === null ? null : lineClv > 0,
    positivePriceClv: priceClv > 0,
  };
}
