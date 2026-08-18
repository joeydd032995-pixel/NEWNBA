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
  const side = overEv >= underEv ? 'OVER' : 'UNDER';
  const probability = side === 'OVER' ? overProb : underProb;
  const odds = side === 'OVER' ? market.overOdds : market.underOdds;
  const noVigProbability = side === 'OVER' ? noVig.over : noVig.under;
  const edgeProbability = probability - noVigProbability;
  const estimatedEv = side === 'OVER' ? overEv : underEv;
  const gate = classifyEdge({
    dataQuality: input.dataQuality,
    probability,
    odds,
    noVigProbability,
    unresolved: hasUnresolvedNews(input),
    materiallyMoved: input.materiallyMoved,
    modelUncertaintyMargin: input.modelUncertaintyMargin,
  });

  const playableToLine = gate.actionable ? findPlayableLine(input, side, 0.01) : null;
  const playableToOdds = gate.actionable ? maxPlayableAmericanPrice(probability, 0.01) : null;

  return {
    decision: gate.decision,
    newsDecision: gate.newsDecision,
    side: gate.decision === 'PASS' ? 'PASS' : side,
    marketLine: market.line,
    odds: gate.decision === 'PASS' ? null : odds,
    probability,
    rawImpliedProbability: americanToImplied(odds),
    noVigProbability,
    estimatedEv,
    edgeProbability,
    fairLine: distribution.median,
    playableToLine,
    playableToOdds,
    confidence: gate.confidence,
    dataQuality: input.dataQuality,
    primaryRisk: selectPrimaryRisk(input, side),
    contrarianCase: buildContrarianCase(input, side),
    checks: buildChecks(input, gate.edgeExceedsUncertainty, playableToLine),
  };
}

/**
 * Price YES/NO markets such as double-double and triple-double from a modeled
 * event probability. No recent hit-rate substitution is allowed.
 */
export function evaluateBinaryDecision(input: {
  probabilityYes: number;
  yesOdds: number;
  noOdds: number;
  dataQuality: DataQuality;
  unresolvedAvailability?: boolean;
  unresolvedLineup?: boolean;
  unresolvedMinutesRestriction?: boolean;
  materiallyMoved?: boolean;
  modelUncertaintyMargin?: number;
}): DecisionResult {
  const probabilityYes = Math.min(0.9999, Math.max(0.0001, input.probabilityYes));
  const probabilityNo = 1 - probabilityYes;
  const noVig = noVigTwoWay(input.yesOdds, input.noOdds);
  const yesEv = expectedValue(probabilityYes, input.yesOdds);
  const noEv = expectedValue(probabilityNo, input.noOdds);
  const side = yesEv >= noEv ? 'YES' : 'NO';
  const probability = side === 'YES' ? probabilityYes : probabilityNo;
  const odds = side === 'YES' ? input.yesOdds : input.noOdds;
  const noVigProbability = side === 'YES' ? noVig.over : noVig.under;
  const unresolved = Boolean(
    input.unresolvedAvailability || input.unresolvedLineup || input.unresolvedMinutesRestriction,
  );
  const gate = classifyEdge({
    dataQuality: input.dataQuality,
    probability,
    odds,
    noVigProbability,
    unresolved,
    materiallyMoved: input.materiallyMoved,
    modelUncertaintyMargin: input.modelUncertaintyMargin,
  });
  const edgeProbability = probability - noVigProbability;
  const estimatedEv = side === 'YES' ? yesEv : noEv;
  const playableToOdds = gate.actionable ? maxPlayableAmericanPrice(probability, 0.01) : null;

  return {
    decision: gate.decision,
    newsDecision: gate.newsDecision,
    side: gate.decision === 'PASS' ? 'PASS' : side,
    marketLine: 0.5,
    odds: gate.decision === 'PASS' ? null : odds,
    probability,
    rawImpliedProbability: americanToImplied(odds),
    noVigProbability,
    estimatedEv,
    edgeProbability,
    fairLine: probabilityYes,
    playableToLine: null,
    playableToOdds,
    confidence: gate.confidence,
    dataQuality: input.dataQuality,
    primaryRisk: unresolved
      ? 'Availability or rotation uncertainty can materially change the joint milestone probability.'
      : 'The milestone requires multiple correlated stat thresholds and is inherently high variance.',
    contrarianCase: `The opposite outcome retains ${(1 - probability).toFixed(3)} modeled probability; threshold markets can fail through one missing component even when the overall stat line is strong.`,
    checks: {
      currentInformation: !unresolved,
      rotationUnderstood: !input.unresolvedLineup,
      marketVerified: Number.isFinite(input.yesOdds) && Number.isFinite(input.noOdds),
      minutesDefensible: !input.unresolvedMinutesRestriction,
      opportunityDefensible: input.dataQuality !== 'LOW',
      edgeExceedsUncertainty: gate.edgeExceedsUncertainty,
      vigConsidered: true,
      opposingCaseEvaluated: true,
      withinPlayableRange: true,
    },
  };
}

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
    const probability = side === 'OVER'
      ? probabilityOver(input.distribution, candidate)
      : probabilityUnder(input.distribution, candidate);
    if (expectedValue(probability, odds) < minimumEv) break;
    playable = candidate;
  }
  return playable;
}

export function maxPlayableAmericanPrice(probability: number, minimumEv = 0): number {
  if (probability <= 0 || probability >= 1) return probabilityToAmerican(probability);
  const requiredDecimal = (1 + minimumEv) / probability;
  if (requiredDecimal <= 1) return probabilityToAmerican(probability);
  return requiredDecimal >= 2
    ? Math.floor((requiredDecimal - 1) * 100)
    : Math.ceil(-100 / (requiredDecimal - 1));
}

function classifyEdge(input: {
  dataQuality: DataQuality;
  probability: number;
  odds: number;
  noVigProbability: number;
  unresolved: boolean;
  materiallyMoved?: boolean;
  modelUncertaintyMargin?: number;
}) {
  const estimatedEv = expectedValue(input.probability, input.odds);
  const edgeProbability = input.probability - input.noVigProbability;
  const uncertaintyMargin = input.modelUncertaintyMargin ?? QUALITY_UNCERTAINTY[input.dataQuality];
  const edgeExceedsUncertainty = edgeProbability > uncertaintyMargin;
  const materiallyPositive = estimatedEv >= 0.025 && edgeProbability > 0;

  let decision: DecisionResult['decision'] = 'PASS';
  if (input.unresolved) {
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

  if (input.materiallyMoved && decision === 'STRONG_BET') decision = 'BET';

  const newsDecision: DecisionResult['newsDecision'] = input.unresolved
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

  return {
    decision,
    newsDecision,
    confidence,
    edgeExceedsUncertainty,
    actionable: decision === 'BET' || decision === 'STRONG_BET',
  };
}

function hasUnresolvedNews(input: DecisionInput): boolean {
  return Boolean(
    input.unresolvedAvailability || input.unresolvedLineup || input.unresolvedMinutesRestriction,
  );
}

function buildChecks(input: DecisionInput, edgeExceedsUncertainty: boolean, playableToLine: number | null) {
  const unresolved = hasUnresolvedNews(input);
  return {
    currentInformation: !unresolved,
    rotationUnderstood: !input.unresolvedLineup,
    marketVerified: Number.isFinite(input.market.line) && Number.isFinite(input.market.overOdds) && Number.isFinite(input.market.underOdds),
    minutesDefensible: !input.unresolvedMinutesRestriction,
    opportunityDefensible: input.dataQuality !== 'LOW',
    edgeExceedsUncertainty,
    vigConsidered: true,
    opposingCaseEvaluated: true,
    withinPlayableRange: playableToLine !== null || unresolved || !edgeExceedsUncertainty,
  };
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
