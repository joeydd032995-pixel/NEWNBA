import { DecisionInput, DecisionResult, DataQuality } from './projection.types';
import {
  americanToImplied,
  expectedValue,
  noVigTwoWay,
  probabilityToAmerican,
} from './projection.math';
import { probabilityOver, probabilityUnder } from './opportunity-projection.engine';

const QUALITY_UNCERTAINTY: Record<DataQuality, number> = {
  HIGH: 0.025,
  MEDIUM: 0.045,
  LOW: 0.075,
};

export function evaluateDecision(input: DecisionInput): DecisionResult {
  const { distribution, market } = input;
  const overProb = probabilityOver(distribution, market.line);
  const underProb = probabilityUnder(distribution, market.line);
  const noVig = noVigTwoWay(market.overOdds, market.underOdds);
  const overEv = expectedValue(overProb, market.overOdds);
  const underEv = expectedValue(underProb, market.underOdds);
  const overEdge = overProb - noVig.over;
  const underEdge = underProb - noVig.under;

  const side = overEv >= underEv ? 'OVER' : 'UNDER';
  const probability = side === 'OVER' ? overProb : underProb;
  const odds = side === 'OVER' ? market.overOdds : market.underOdds;
  const noVigProbability = side === 'OVER' ? noVig.over : noVig.under;
  const rawImpliedProbability = americanToImplied(odds);
  const estimatedEv = side === 'OVER' ? overEv : underEv;
  const edgeProbability = side === 'OVER' ? overEdge : underEdge;
  const uncertaintyMargin =
    input.modelUncertaintyMargin ?? QUALITY_UNCERTAINTY[input.dataQuality];

  const unresolved = Boolean(
    input.unresolvedAvailability ||
      input.unresolvedLineup ||
      input.unresolvedMinutesRestriction,
  );
  const edgeExceedsUncertainty = edgeProbability > uncertaintyMargin;
  const materiallyPositive = estimatedEv >= 0.025 && edgeProbability > 0;

  let decision: DecisionResult['decision'] = 'PASS';
  if (unresolved && estimatedEv > 0.08 && edgeProbability > uncertaintyMargin * 1.5) {
    decision = 'WAIT';
  } else if (unresolved) {
    decision = estimatedEv > 0 ? 'WAIT' : 'PASS';
  } else if (estimatedEv <= 0 || edgeProbability <= 0) {
    decision = 'PASS';
  } else if (!edgeExceedsUncertainty) {
    decision = 'LEAN';
  } else if (
    input.dataQuality === 'HIGH' &&
    estimatedEv >= 0.07 &&
    edgeProbability >= uncertaintyMargin * 1.75
  ) {
    decision = 'STRONG_BET';
  } else if (materiallyPositive) {
    decision = 'BET';
  } else {
    decision = 'LEAN';
  }

  // A large move is not automatically bad, but it makes an old thesis stale.
  if (input.materiallyMoved && decision === 'STRONG_BET') decision = 'BET';

  const newsDecision: DecisionResult['newsDecision'] = unresolved
    ? estimatedEv > 0.1 && edgeProbability > uncertaintyMargin * 2
      ? 'BET_NOW'
      : estimatedEv > 0
        ? 'WAIT'
        : 'PASS'
    : decision === 'PASS'
      ? 'PASS'
      : 'BET_NOW';

  const confidence: DecisionResult['confidence'] =
    input.dataQuality === 'HIGH' && edgeProbability >= uncertaintyMargin * 1.75
      ? 'HIGH'
      : input.dataQuality === 'LOW' || edgeProbability <= uncertaintyMargin
        ? 'LOW'
        : 'MODERATE';

  const playableToLine =
    decision === 'BET' || decision === 'STRONG_BET'
      ? findPlayableLine(input, side, 0.01)
      : null;
  const playableToOdds =
    decision === 'BET' || decision === 'STRONG_BET'
      ? maxPlayableAmericanPrice(probability, 0.01)
      : null;

  const primaryRisk = selectPrimaryRisk(input, side);
  const contrarianCase = buildContrarianCase(input, side);

  return {
    decision,
    newsDecision,
    side: decision === 'PASS' ? 'PASS' : side,
    marketLine: market.line,
    odds: decision === 'PASS' ? null : odds,
    probability,
    rawImpliedProbability,
    noVigProbability,
    estimatedEv,
    edgeProbability,
    fairLine: distribution.median,
    playableToLine,
    playableToOdds,
    confidence,
    dataQuality: input.dataQuality,
    primaryRisk,
    contrarianCase,
    checks: {
      currentInformation: !unresolved,
      rotationUnderstood: !input.unresolvedLineup,
      marketVerified: Number.isFinite(market.line) && Number.isFinite(odds),
      minutesDefensible: !input.unresolvedMinutesRestriction,
      opportunityDefensible: input.dataQuality !== 'LOW',
      edgeExceedsUncertainty,
      vigConsidered: true,
      opposingCaseEvaluated: true,
      withinPlayableRange: playableToLine !== null || decision === 'PASS' || decision === 'WAIT' || decision === 'LEAN',
    },
  };
}

/**
 * Find the furthest half-point threshold that remains positive EV at the current
 * price. For OVER this moves upward; for UNDER it moves downward.
 */
export function findPlayableLine(
  input: DecisionInput,
  side: 'OVER' | 'UNDER',
  minimumEv = 0,
): number {
  const startingLine = input.market.line;
  const odds = side === 'OVER' ? input.market.overOdds : input.market.underOdds;
  let playable = startingLine;

  for (let step = 1; step <= 30; step++) {
    const candidate = startingLine + (side === 'OVER' ? 0.5 * step : -0.5 * step);
    if (candidate < 0) break;
    const probability =
      side === 'OVER'
        ? probabilityOver(input.distribution, candidate)
        : probabilityUnder(input.distribution, candidate);
    if (expectedValue(probability, odds) < minimumEv) break;
    playable = candidate;
  }
  return playable;
}

/** Return the worst American price that still preserves target EV at model p. */
export function maxPlayableAmericanPrice(probability: number, minimumEv = 0): number {
  if (probability <= 0 || probability >= 1) return probabilityToAmerican(probability);
  const requiredDecimal = (1 + minimumEv) / probability;
  if (requiredDecimal <= 1) return probabilityToAmerican(probability);
  return requiredDecimal >= 2
    ? Math.floor((requiredDecimal - 1) * 100)
    : Math.ceil(-100 / (requiredDecimal - 1));
}

function selectPrimaryRisk(input: DecisionInput, side: 'OVER' | 'UNDER'): string {
  if (input.unresolvedAvailability) return 'Player availability is unresolved and can invalidate the minutes/role distribution.';
  if (input.unresolvedMinutesRestriction) return 'A possible minutes restriction can materially shift the projection distribution.';
  if (input.unresolvedLineup) return 'Starting lineup and rotation uncertainty can change opportunity allocation.';
  if (input.materiallyMoved) return 'The market has materially moved; the original price edge may be decaying.';
  if (side === 'OVER') return 'Lower-than-projected minutes or opportunity volume is the clearest path to the Over failing.';
  return 'Higher-than-projected minutes, usage, or conversion is the clearest path to the Under failing.';
}

function buildContrarianCase(input: DecisionInput, side: 'OVER' | 'UNDER'): string {
  const p25 = input.distribution.percentiles.p25;
  const p75 = input.distribution.percentiles.p75;
  if (side === 'OVER') {
    return `The lower quartile is ${p25.toFixed(2)}; a normal downside realization in minutes/opportunity can leave the result below ${input.market.line}.`;
  }
  return `The upper quartile is ${p75.toFixed(2)}; a normal upside realization in minutes/opportunity can carry the result above ${input.market.line}.`;
}
