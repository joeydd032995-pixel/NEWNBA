export type ProjectionStat =
  | 'POINTS'
  | 'REBOUNDS'
  | 'ASSISTS'
  | 'THREES'
  | 'TURNOVERS'
  | 'STEALS'
  | 'BLOCKS';

export type AnalysisMode = 'FAST' | 'STANDARD' | 'DEEP';
export type DataQuality = 'LOW' | 'MEDIUM' | 'HIGH';
export type DecisionClass = 'PASS' | 'WAIT' | 'LEAN' | 'BET' | 'STRONG_BET';
export type NewsDecision = 'BET_NOW' | 'WAIT' | 'PASS';
export type GameScript = 'COMPETITIVE' | 'FAVORITE_CONTROL' | 'UNDERDOG_LEADS' | 'DISRUPTION';

export interface DistributionInput {
  floor: number;
  median: number;
  ceiling: number;
  stdDev?: number;
}

export interface UncertaintyInputs {
  minutesStdDev: number;
  opportunityRateStdDev: number;
  conversionRateStdDev: number;
  contextStdDev: number;
  paceStdDev: number;
}

export interface GameScriptInput {
  script: GameScript;
  probability: number;
  minutesMultiplier: number;
  opportunityMultiplier: number;
  conversionMultiplier?: number;
  contextMultiplier?: number;
}

export interface OpportunityProjectionInput {
  stat: ProjectionStat;
  analysisMode: AnalysisMode;
  seed: number;
  trials?: number;

  minutes: DistributionInput;
  opportunityRatePerMinute: number;
  conversionRate: number;
  contextAdjustment: number;

  baselinePace?: number;
  expectedPace?: number;
  playerOpportunityShare?: number;
  expectedPossessions?: number;

  uncertainty: UncertaintyInputs;
  scripts: GameScriptInput[];

  foulTroubleProbability?: number;
  foulMinutesPenalty?: number;
  blowoutProbability?: number;
  blowoutMinutesPenalty?: number;

  dataQuality: DataQuality;
  unresolvedAvailability?: boolean;
  unresolvedLineup?: boolean;
  unresolvedMinutesRestriction?: boolean;
}

export interface ProjectionDistribution {
  stat: ProjectionStat;
  trials: number;
  seed: number;
  mean: number;
  median: number;
  stdDev: number;
  percentiles: {
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  samples: number[];
  uncertainty: {
    minutes: number;
    opportunity: number;
    conversion: number;
    context: number;
    pace: number;
    total: number;
  };
  pointEstimate: number;
  opportunityEquation: {
    expectedMinutes: number;
    opportunityRatePerMinute: number;
    conversionRate: number;
    contextAdjustment: number;
    paceAdjustment: number;
  };
}

export interface MarketPriceInput {
  line: number;
  overOdds: number;
  underOdds: number;
  sportsbook?: string;
  openingLine?: number;
  openingOverOdds?: number;
  openingUnderOdds?: number;
}

export interface DecisionInput {
  distribution: ProjectionDistribution;
  market: MarketPriceInput;
  dataQuality: DataQuality;
  modelUncertaintyMargin?: number;
  unresolvedAvailability?: boolean;
  unresolvedLineup?: boolean;
  unresolvedMinutesRestriction?: boolean;
  materiallyMoved?: boolean;
}

export interface DecisionResult {
  decision: DecisionClass;
  newsDecision: NewsDecision;
  side: 'OVER' | 'UNDER' | 'PASS';
  marketLine: number;
  odds: number | null;
  probability: number;
  rawImpliedProbability: number;
  noVigProbability: number;
  estimatedEv: number;
  edgeProbability: number;
  fairLine: number;
  playableToLine: number | null;
  playableToOdds: number | null;
  confidence: 'LOW' | 'MODERATE' | 'HIGH';
  dataQuality: DataQuality;
  primaryRisk: string;
  contrarianCase: string;
  checks: {
    currentInformation: boolean;
    rotationUnderstood: boolean;
    marketVerified: boolean;
    minutesDefensible: boolean;
    opportunityDefensible: boolean;
    edgeExceedsUncertainty: boolean;
    vigConsidered: boolean;
    opposingCaseEvaluated: boolean;
    withinPlayableRange: boolean;
  };
}
