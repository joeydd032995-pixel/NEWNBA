import { Injectable } from '@nestjs/common';
import { DataQualityLevel, PropStatType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalysisMode,
  DataQuality,
  OpportunityProjectionInput,
  ProjectionDistribution,
  ProjectionStat,
} from '../projection/projection.types';
import { projectDistribution } from '../projection/opportunity-projection.engine';
import {
  combineCorrelatedDistributions,
  empiricalCorrelationMatrix,
} from '../projection/correlation.engine';
import { simulateMilestoneDistribution } from '../projection/milestone.engine';
import { clamp, mean, percentile } from '../projection/projection.math';

interface ProjectionAssembly {
  distribution: ProjectionDistribution;
  dataQuality: DataQuality;
  qualityReasons: string[];
  inputs: {
    minutesSource: 'ROTATION_PROJECTION' | 'RECENT_GAMES';
    opportunitySource: string;
    recentGames: number;
    trackingGames: number;
    rotationAvailable: boolean;
    availabilityAvailable: boolean;
    spreadForBlowoutModel: number | null;
    replacementAdjustmentActive: boolean;
    replacementSources: number;
  };
}

interface ReplacementAdjustment {
  minutesDelta: number;
  usageDelta: number;
  ballHandlingDelta: number;
  reboundChanceDelta: number;
  fgaDelta: number;
  threePointAttemptDelta: number;
  defensiveImpact: number;
  confidence: number;
  quality: DataQuality | null;
}

@Injectable()
export class PlayerPropProjectionAssembler {
  constructor(private readonly prisma: PrismaService) {}

  async assemble(params: {
    playerId: string;
    eventId: string;
    statType: PropStatType;
    mode?: AnalysisMode;
    seed?: number;
  }): Promise<ProjectionAssembly | null> {
    const mode = params.mode ?? 'STANDARD';
    const seed = params.seed ?? stableSeed(`${params.eventId}:${params.playerId}:${params.statType}`);

    const [statLines, rotation, availability, opportunityRows, spreadMarket, replacementRows] = await Promise.all([
      this.prisma.statLine.findMany({
        where: { playerId: params.playerId },
        orderBy: { gameDate: 'desc' },
        take: mode === 'DEEP' ? 30 : mode === 'STANDARD' ? 20 : 10,
      }),
      this.prisma.rotationProjection.findUnique({
        where: { eventId_playerId: { eventId: params.eventId, playerId: params.playerId } },
      }).catch(() => null),
      this.prisma.playerAvailabilityProjection.findUnique({
        where: { eventId_playerId: { eventId: params.eventId, playerId: params.playerId } },
      }).catch(() => null),
      this.prisma.playerOpportunityStat.findMany({
        where: { playerId: params.playerId },
        orderBy: { gameDate: 'desc' },
        take: mode === 'DEEP' ? 20 : 10,
      }),
      this.prisma.market.findFirst({
        where: { eventId: params.eventId, marketType: 'SPREAD', isActive: true },
        include: { marketOdds: { where: { isOpen: true }, take: 8 } },
      }),
      this.prisma.injuryReplacementProjection.findMany({
        where: { eventId: params.eventId, replacementPlayerId: params.playerId },
        orderBy: { projectedAt: 'desc' },
      }),
    ]);

    if (statLines.length < 3) return null;

    const replacement = aggregateReplacement(replacementRows);
    const minuteInput = buildMinuteDistribution(statLines.map((row) => row.minutes), rotation);
    const baseQuality = determineDataQuality(rotation, availability?.dataQuality, opportunityRows.length);
    const dataQuality = combineDataQuality(baseQuality.level, replacement.quality);
    const qualityReasons = [...baseQuality.reasons];
    if (replacementRows.length > 0) qualityReasons.push('INJURY_REPLACEMENT_MODEL_ACTIVE');
    if (replacement.quality === 'LOW') qualityReasons.push('LOW_QUALITY_REPLACEMENT_ALLOCATION');
    const spread = representativeSpread(spreadMarket?.marketOdds ?? []);
    const scripts = buildGameScripts(spread);

    const build = (stat: ProjectionStat, localSeed: number): ProjectionDistribution => {
      const baseOpportunity = buildOpportunityModel(stat, statLines, opportunityRows);
      const opportunity = applyReplacementOpportunity(
        stat,
        baseOpportunity,
        replacement,
        minuteInput.distribution.median,
        opportunityRows,
      );
      return projectDistribution({
        stat,
        analysisMode: mode,
        seed: localSeed,
        minutes: minuteInput.distribution,
        opportunityRatePerMinute: opportunity.ratePerMinute,
        conversionRate: opportunity.conversionRate,
        contextAdjustment: 1,
        uncertainty: buildUncertainty(stat, statLines, opportunityRows, minuteInput.distribution.stdDev ?? 2.5),
        scripts,
        blowoutProbability: spread === null ? undefined : spreadToBlowoutProbability(Math.abs(spread)),
        blowoutMinutesPenalty: 5,
        dataQuality,
        unresolvedAvailability: !availability || availability.expectedAvailabilityProb < 0.8,
        unresolvedLineup: !rotation || rotation.starterStatus === 'UNKNOWN',
        unresolvedMinutesRestriction: Boolean(rotation?.loadManagementStatus === 'POSSIBLE' || rotation?.restrictionMinutes),
      } satisfies OpportunityProjectionInput);
    };

    let distribution: ProjectionDistribution;
    let opportunitySource: string = params.statType;

    switch (params.statType) {
      case PropStatType.POINTS:
        distribution = build('POINTS', seed);
        break;
      case PropStatType.REBOUNDS:
        distribution = build('REBOUNDS', seed);
        opportunitySource = opportunityRows.some((row) => row.reboundChances > 0)
          ? 'REBOUND_CHANCES'
          : 'REBOUNDS_PER_MINUTE_FALLBACK';
        break;
      case PropStatType.ASSISTS:
        distribution = build('ASSISTS', seed);
        opportunitySource = opportunityRows.some((row) => row.potentialAssists > 0)
          ? 'POTENTIAL_ASSISTS'
          : 'ASSISTS_PER_MINUTE_FALLBACK';
        break;
      case PropStatType.THREES:
        distribution = build('THREES', seed);
        opportunitySource = 'THREE_POINT_ATTEMPTS';
        break;
      case PropStatType.TURNOVERS:
        distribution = build('TURNOVERS', seed);
        opportunitySource = opportunityRows.some((row) => row.touches > 0)
          ? 'TOUCHES'
          : 'TURNOVERS_PER_MINUTE_FALLBACK';
        break;
      case PropStatType.STEALS:
        distribution = build('STEALS', seed);
        opportunitySource = 'STEALS_PER_MINUTE';
        break;
      case PropStatType.BLOCKS:
        distribution = build('BLOCKS', seed);
        opportunitySource = 'BLOCKS_PER_MINUTE';
        break;
      case PropStatType.STOCKS: {
        const steals = build('STEALS', seed + 11);
        const blocks = build('BLOCKS', seed + 17);
        const matrix = empiricalMatrixOrIdentity([
          statLines.map((row) => row.steals),
          statLines.map((row) => row.blocks),
        ]);
        distribution = combineCorrelatedDistributions([steals, blocks], matrix, seed + 23, undefined, 'STOCKS');
        opportunitySource = 'STEALS_PLUS_BLOCKS_CORRELATED';
        break;
      }
      case PropStatType.PRA:
      case PropStatType.PR:
      case PropStatType.PA:
      case PropStatType.RA: {
        const componentStats = combinationComponents(params.statType);
        const components = componentStats.map((stat, index) => build(stat, seed + 31 + index * 7));
        const empiricalSeries = componentStats.map((stat) => statLines.map((row) => statValue(row, stat)));
        const matrix = empiricalMatrixOrIdentity(empiricalSeries);
        distribution = combineCorrelatedDistributions(
          components,
          matrix,
          seed + 79,
          undefined,
          params.statType as ProjectionStat,
        );
        opportunitySource = `${params.statType}_INDEPENDENT_COMPONENTS_CORRELATED`;
        break;
      }
      case PropStatType.DOUBLE_DOUBLE:
      case PropStatType.TRIPLE_DOUBLE: {
        const milestoneStats: ProjectionStat[] = ['POINTS', 'REBOUNDS', 'ASSISTS', 'STEALS', 'BLOCKS'];
        const components = milestoneStats.map((stat, index) => build(stat, seed + 101 + index * 13));
        const matrix = empiricalMatrixOrIdentity(
          milestoneStats.map((stat) => statLines.map((row) => statValue(row, stat))),
        );
        distribution = simulateMilestoneDistribution({
          components,
          correlationMatrix: matrix,
          requiredCategories: params.statType === PropStatType.DOUBLE_DOUBLE ? 2 : 3,
          threshold: 10,
          seed: seed + 211,
          stat: params.statType as 'DOUBLE_DOUBLE' | 'TRIPLE_DOUBLE',
        });
        opportunitySource = `${params.statType}_JOINT_THRESHOLD_SIMULATION`;
        break;
      }
      default:
        return null;
    }

    if (replacementRows.length > 0) opportunitySource += '_WITH_INJURY_REDISTRIBUTION';

    return {
      distribution,
      dataQuality,
      qualityReasons,
      inputs: {
        minutesSource: minuteInput.source,
        opportunitySource,
        recentGames: statLines.length,
        trackingGames: opportunityRows.length,
        rotationAvailable: Boolean(rotation),
        availabilityAvailable: Boolean(availability),
        spreadForBlowoutModel: spread,
        replacementAdjustmentActive: replacementRows.length > 0,
        replacementSources: replacementRows.length,
      },
    };
  }
}

function buildMinuteDistribution(minutes: number[], rotation: any): {
  source: 'ROTATION_PROJECTION' | 'RECENT_GAMES';
  distribution: { floor: number; median: number; ceiling: number; stdDev: number };
} {
  if (rotation) {
    return {
      source: 'ROTATION_PROJECTION',
      distribution: {
        floor: Math.max(0, rotation.minutesFloor),
        median: Math.max(0, rotation.minutesMedian),
        ceiling: Math.max(rotation.minutesMedian, rotation.minutesCeiling),
        stdDev: Math.max(0.5, rotation.minutesStdDev),
      },
    };
  }

  const sorted = minutes.filter(Number.isFinite).sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const floor = Math.max(0, percentile(sorted, 0.15));
  const ceiling = Math.max(median, percentile(sorted, 0.85));
  const variance = mean(sorted.map((value) => Math.pow(value - median, 2)));
  return {
    source: 'RECENT_GAMES',
    distribution: {
      floor,
      median,
      ceiling,
      stdDev: Math.max(1, Math.sqrt(variance)),
    },
  };
}

function buildOpportunityModel(stat: ProjectionStat, statLines: any[], trackingRows: any[]) {
  const totalMinutes = Math.max(1, statLines.reduce((sum, row) => sum + Math.max(0, row.minutes), 0));
  switch (stat) {
    case 'POINTS': {
      const opportunities = statLines.reduce((sum, row) => sum + row.fga + 0.44 * row.fta, 0);
      const production = statLines.reduce((sum, row) => sum + row.points, 0);
      return {
        ratePerMinute: opportunities / totalMinutes,
        conversionRate: opportunities > 0 ? production / opportunities : 0,
      };
    }
    case 'REBOUNDS': {
      const trackedChances = trackingRows.reduce((sum, row) => sum + Math.max(0, row.reboundChances), 0);
      const trackedMinutes = trackingRows.reduce((sum, row) => sum + Math.max(0, row.minutes), 0);
      if (trackedChances > 0 && trackedMinutes > 0) {
        const rebounds = statLines.slice(0, trackingRows.length).reduce((sum, row) => sum + row.rebounds, 0);
        return { ratePerMinute: trackedChances / trackedMinutes, conversionRate: clamp(rebounds / trackedChances, 0, 1) };
      }
      return { ratePerMinute: statLines.reduce((sum, row) => sum + row.rebounds, 0) / totalMinutes, conversionRate: 1 };
    }
    case 'ASSISTS': {
      const potential = trackingRows.reduce((sum, row) => sum + Math.max(0, row.potentialAssists), 0);
      const trackedMinutes = trackingRows.reduce((sum, row) => sum + Math.max(0, row.minutes), 0);
      if (potential > 0 && trackedMinutes > 0) {
        const assists = statLines.slice(0, trackingRows.length).reduce((sum, row) => sum + row.assists, 0);
        return { ratePerMinute: potential / trackedMinutes, conversionRate: clamp(assists / potential, 0, 1) };
      }
      return { ratePerMinute: statLines.reduce((sum, row) => sum + row.assists, 0) / totalMinutes, conversionRate: 1 };
    }
    case 'THREES': {
      const attempts = statLines.reduce((sum, row) => sum + row.fg3a, 0);
      const made = statLines.reduce((sum, row) => sum + row.fg3m, 0);
      return { ratePerMinute: attempts / totalMinutes, conversionRate: attempts > 0 ? made / attempts : 0 };
    }
    case 'TURNOVERS': {
      const touches = trackingRows.reduce((sum, row) => sum + Math.max(0, row.touches), 0);
      const trackedMinutes = trackingRows.reduce((sum, row) => sum + Math.max(0, row.minutes), 0);
      if (touches > 0 && trackedMinutes > 0) {
        const turnovers = statLines.slice(0, trackingRows.length).reduce((sum, row) => sum + row.turnovers, 0);
        return { ratePerMinute: touches / trackedMinutes, conversionRate: clamp(turnovers / touches, 0, 1) };
      }
      return { ratePerMinute: statLines.reduce((sum, row) => sum + row.turnovers, 0) / totalMinutes, conversionRate: 1 };
    }
    case 'STEALS':
      return { ratePerMinute: statLines.reduce((sum, row) => sum + row.steals, 0) / totalMinutes, conversionRate: 1 };
    case 'BLOCKS':
      return { ratePerMinute: statLines.reduce((sum, row) => sum + row.blocks, 0) / totalMinutes, conversionRate: 1 };
    default:
      return { ratePerMinute: 0, conversionRate: 1 };
  }
}

export function applyReplacementOpportunity(
  stat: ProjectionStat,
  base: { ratePerMinute: number; conversionRate: number },
  replacement: ReplacementAdjustment,
  expectedMinutes: number,
  trackingRows: any[],
): { ratePerMinute: number; conversionRate: number } {
  if (replacement.confidence <= 0 || expectedMinutes <= 0) return base;
  const confidence = clamp(replacement.confidence, 0, 1);
  let rateDelta = 0;

  switch (stat) {
    case 'POINTS':
      rateDelta = replacement.fgaDelta / expectedMinutes;
      break;
    case 'REBOUNDS':
      rateDelta = replacement.reboundChanceDelta / expectedMinutes;
      break;
    case 'THREES':
      rateDelta = replacement.threePointAttemptDelta / expectedMinutes;
      break;
    case 'ASSISTS':
    case 'TURNOVERS': {
      const touches = trackingRows.length ? mean(trackingRows.map((row) => Math.max(0, row.touches ?? 0))) : 0;
      if (touches > 0) {
        const relativeHandlingChange = clamp(replacement.ballHandlingDelta / touches, -0.5, 0.75);
        rateDelta = base.ratePerMinute * relativeHandlingChange;
      }
      break;
    }
    default:
      rateDelta = 0;
  }

  return {
    ratePerMinute: Math.max(0, base.ratePerMinute + rateDelta * confidence),
    conversionRate: base.conversionRate,
  };
}

function aggregateReplacement(rows: any[]): ReplacementAdjustment {
  if (!rows.length) {
    return {
      minutesDelta: 0,
      usageDelta: 0,
      ballHandlingDelta: 0,
      reboundChanceDelta: 0,
      fgaDelta: 0,
      threePointAttemptDelta: 0,
      defensiveImpact: 0,
      confidence: 0,
      quality: null,
    };
  }
  const qualityRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const minimumQuality = rows.reduce((current, row) =>
    qualityRank[String(row.dataQuality)] < qualityRank[current] ? String(row.dataQuality) : current,
  'HIGH');
  return {
    minutesDelta: rows.reduce((sum, row) => sum + (row.minutesDelta ?? 0), 0),
    usageDelta: rows.reduce((sum, row) => sum + (row.usageDelta ?? 0), 0),
    ballHandlingDelta: rows.reduce((sum, row) => sum + (row.ballHandlingDelta ?? 0), 0),
    reboundChanceDelta: rows.reduce((sum, row) => sum + (row.reboundChanceDelta ?? 0), 0),
    fgaDelta: rows.reduce((sum, row) => sum + (row.fgaDelta ?? 0), 0),
    threePointAttemptDelta: rows.reduce((sum, row) => sum + (row.threePointAttemptDelta ?? 0), 0),
    defensiveImpact: rows.reduce((sum, row) => sum + (row.defensiveImpact ?? 0), 0),
    confidence: mean(rows.map((row) => clamp(row.confidence ?? 0, 0, 1))),
    quality: minimumQuality as DataQuality,
  };
}

function combineDataQuality(base: DataQuality, replacement: DataQuality | null): DataQuality {
  if (!replacement) return base;
  const rank: Record<DataQuality, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return rank[replacement] < rank[base] ? replacement : base;
}

function buildUncertainty(
  stat: ProjectionStat,
  statLines: any[],
  trackingRows: any[],
  minutesStdDev: number,
) {
  const perMinuteSeries = statLines
    .filter((row) => row.minutes > 0)
    .map((row) => statValue(row, stat) / row.minutes);
  const avg = mean(perMinuteSeries);
  const rateVariance = mean(perMinuteSeries.map((value) => Math.pow(value - avg, 2)));
  const rateStd = Math.sqrt(Math.max(0, rateVariance));
  const trackingPenalty = trackingRows.length >= 5 ? 1 : 1.35;

  return {
    minutesStdDev: Math.max(0.5, minutesStdDev),
    opportunityRateStdDev: Math.max(0.01, rateStd * trackingPenalty),
    conversionRateStdDev: stat === 'STEALS' || stat === 'BLOCKS' ? 0.08 : 0.04,
    contextStdDev: trackingRows.length >= 5 ? 0.03 : 0.05,
    paceStdDev: 0.02,
  };
}

function determineDataQuality(rotation: any, availabilityQuality: DataQualityLevel | undefined, trackingGames: number) {
  const reasons: string[] = [];
  if (!rotation) reasons.push('NO_CURRENT_ROTATION_PROJECTION');
  if (!availabilityQuality) reasons.push('NO_CURRENT_AVAILABILITY_PROJECTION');
  if (trackingGames < 5) reasons.push('INSUFFICIENT_TRACKING_SAMPLE');

  if (rotation && availabilityQuality === 'HIGH' && trackingGames >= 5) {
    return { level: 'HIGH' as DataQuality, reasons };
  }
  if (rotation || availabilityQuality === 'HIGH' || trackingGames >= 5) {
    return { level: 'MEDIUM' as DataQuality, reasons };
  }
  return { level: 'LOW' as DataQuality, reasons };
}

function buildGameScripts(spread: number | null): OpportunityProjectionInput['scripts'] {
  const disruption = 0.04;
  if (spread === null) {
    return [
      { script: 'COMPETITIVE', probability: 0.90, minutesMultiplier: 1, opportunityMultiplier: 1 },
      { script: 'DISRUPTION', probability: disruption, minutesMultiplier: 0.72, opportunityMultiplier: 0.82 },
      { script: 'FAVORITE_CONTROL', probability: 0.03, minutesMultiplier: 0.92, opportunityMultiplier: 0.96 },
      { script: 'UNDERDOG_LEADS', probability: 0.03, minutesMultiplier: 1.02, opportunityMultiplier: 1.04 },
    ];
  }
  const blowout = spreadToBlowoutProbability(Math.abs(spread));
  const competitive = Math.max(0.45, 1 - disruption - blowout);
  return [
    { script: 'COMPETITIVE', probability: competitive, minutesMultiplier: 1, opportunityMultiplier: 1 },
    { script: 'FAVORITE_CONTROL', probability: blowout * 0.7, minutesMultiplier: 0.88, opportunityMultiplier: 0.94 },
    { script: 'UNDERDOG_LEADS', probability: blowout * 0.3, minutesMultiplier: 1.03, opportunityMultiplier: 1.05 },
    { script: 'DISRUPTION', probability: disruption, minutesMultiplier: 0.72, opportunityMultiplier: 0.82 },
  ];
}

function spreadToBlowoutProbability(absSpread: number): number {
  return clamp(0.05 + absSpread * 0.018, 0.05, 0.36);
}

function representativeSpread(rows: Array<{ line: number | null }>): number | null {
  const lines = rows.map((row) => row.line).filter((line): line is number => line !== null && Number.isFinite(line));
  if (!lines.length) return null;
  return percentile(lines.sort((a, b) => a - b), 0.5);
}

function combinationComponents(type: PropStatType): ProjectionStat[] {
  switch (type) {
    case PropStatType.PRA: return ['POINTS', 'REBOUNDS', 'ASSISTS'];
    case PropStatType.PR: return ['POINTS', 'REBOUNDS'];
    case PropStatType.PA: return ['POINTS', 'ASSISTS'];
    case PropStatType.RA: return ['REBOUNDS', 'ASSISTS'];
    default: return [];
  }
}

function statValue(row: any, stat: ProjectionStat): number {
  switch (stat) {
    case 'POINTS': return row.points ?? 0;
    case 'REBOUNDS': return row.rebounds ?? 0;
    case 'ASSISTS': return row.assists ?? 0;
    case 'THREES': return row.fg3m ?? 0;
    case 'TURNOVERS': return row.turnovers ?? 0;
    case 'STEALS': return row.steals ?? 0;
    case 'BLOCKS': return row.blocks ?? 0;
    case 'STOCKS': return (row.steals ?? 0) + (row.blocks ?? 0);
    case 'PRA': return (row.points ?? 0) + (row.rebounds ?? 0) + (row.assists ?? 0);
    case 'PR': return (row.points ?? 0) + (row.rebounds ?? 0);
    case 'PA': return (row.points ?? 0) + (row.assists ?? 0);
    case 'RA': return (row.rebounds ?? 0) + (row.assists ?? 0);
    case 'DOUBLE_DOUBLE': {
      return [row.points, row.rebounds, row.assists, row.steals, row.blocks].filter((value) => (value ?? 0) >= 10).length >= 2 ? 1 : 0;
    }
    case 'TRIPLE_DOUBLE': {
      return [row.points, row.rebounds, row.assists, row.steals, row.blocks].filter((value) => (value ?? 0) >= 10).length >= 3 ? 1 : 0;
    }
  }
}

function empiricalMatrixOrIdentity(series: number[][]): number[][] {
  if (series.length < 2 || series.some((values) => values.length < 5)) {
    return identityMatrix(series.length);
  }
  try {
    return empiricalCorrelationMatrix(series);
  } catch {
    return identityMatrix(series.length);
  }
}

function identityMatrix(size: number): number[][] {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
