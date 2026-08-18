import { Injectable, Logger } from '@nestjs/common';
import {
  BetDirection,
  ConfidenceBucket,
  DecisionClass,
  PropStatType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerPropProjectionAssembler } from '../player-props/player-prop-projection.assembler';
import {
  evaluateBinaryDecision,
  evaluateDecision,
} from '../projection/decision.engine';
import {
  probabilityOver,
  probabilityUnder,
} from '../projection/opportunity-projection.engine';
import {
  americanToImplied,
  expectedValue,
  mean,
  percentile,
} from '../projection/projection.math';

export const OPPORTUNITY_MODEL_VERSION = 'opportunity-first-v1';

type OddsRow = {
  id: string;
  bookId: string;
  outcome: string;
  odds: number;
  line: number | null;
  book: { id: string; name: string };
};

export interface MinuteBand {
  floor: number;
  median: number;
  ceiling: number;
  stdDev: number;
}

/**
 * Resolve one exact sportsbook selection without guessing between books.
 * Explicit `bookId` always scopes the search. Otherwise a row is inferred only
 * when outcome + price + line identify one unique sportsbook.
 */
export function resolveTrackedOddsRow(
  rows: OddsRow[],
  selection: {
    bookId?: string | null;
    outcome: string;
    odds: number;
    line?: number | null;
    direction?: string | null;
  },
): OddsRow | null {
  const normalize = (value: string) => value.trim().toLowerCase();
  const direction = normalize(selection.direction ?? '');
  const outcome = normalize(selection.outcome);
  const expectedLine = selection.line ?? null;
  const lineMatches = (row: OddsRow) =>
    expectedLine === null || row.line === null || Math.abs(row.line - expectedLine) < 1e-9;
  const outcomeMatches = (row: OddsRow) => {
    const candidate = normalize(row.outcome);
    if (candidate === outcome) return true;
    return ['over', 'under', 'yes', 'no'].includes(direction) && candidate === direction;
  };

  const scoped = selection.bookId
    ? rows.filter((row) => row.bookId === selection.bookId)
    : rows;
  const exact = scoped.filter((row) =>
    outcomeMatches(row) &&
    row.odds === selection.odds &&
    lineMatches(row),
  );
  if (exact.length === 1) return exact[0];

  // If the sportsbook is explicit, price drift between UI selection and write
  // time is allowed only for a unique outcome/line row; the original wager odds
  // remain stored on BetSlipItem.
  if (selection.bookId) {
    const sameSelection = scoped.filter((row) => outcomeMatches(row) && lineMatches(row));
    if (sameSelection.length === 1) return sameSelection[0];
  }
  return null;
}

export function inferTrackedDirection(outcome: string, explicit?: BetDirection | null): BetDirection {
  if (explicit) return explicit;
  const normalized = outcome.trim().toLowerCase();
  if (normalized.includes('over')) return BetDirection.OVER;
  if (normalized.includes('under')) return BetDirection.UNDER;
  if (normalized === 'yes') return BetDirection.YES;
  if (normalized === 'no') return BetDirection.NO;
  if (normalized === 'home') return BetDirection.HOME;
  if (normalized === 'away') return BetDirection.AWAY;
  return BetDirection.OTHER;
}

export function deriveHistoricalMinuteBand(minutes: number[]): MinuteBand {
  const sorted = minutes.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { floor: 0, median: 0, ceiling: 0, stdDev: 0 };
  const median = percentile(sorted, 0.5);
  const floor = Math.max(0, percentile(sorted, 0.15));
  const ceiling = Math.max(median, percentile(sorted, 0.85));
  const variance = mean(sorted.map((value) => Math.pow(value - median, 2)));
  return { floor, median, ceiling, stdDev: Math.max(1, Math.sqrt(variance)) };
}

@Injectable()
export class WagerProjectionSnapshotService {
  private readonly logger = new Logger(WagerProjectionSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assembler: PlayerPropProjectionAssembler,
  ) {}

  async captureForItem(itemId: string): Promise<any | null> {
    try {
      const item = await this.prisma.betSlipItem.findUnique({
        where: { id: itemId },
        include: {
          projectionSnapshot: true,
          market: {
            include: {
              player: true,
              event: true,
              marketOdds: {
                where: { isOpen: true },
                include: { book: true },
              },
            },
          },
        },
      });
      if (!item || item.projectionSnapshot) return item?.projectionSnapshot ?? null;
      const market = item.market;
      if (!market?.player || !market.propStatType) return null;
      if (!['PLAYER_PROP', 'PLAYER_PROP_ALTERNATE'].includes(market.marketType)) return null;

      const assembly = await this.assembler.assemble({
        playerId: market.player.id,
        eventId: market.eventId,
        statType: market.propStatType,
        mode: 'STANDARD',
      });
      if (!assembly) {
        this.logger.debug(`No defensible projection available for wager item ${itemId}; snapshot skipped`);
        return null;
      }

      const direction = inferTrackedDirection(item.outcome, item.direction);
      const binary =
        market.propStatType === PropStatType.DOUBLE_DOUBLE ||
        market.propStatType === PropStatType.TRIPLE_DOUBLE;
      const trackedOdds = resolveTrackedOddsRow(market.marketOdds as OddsRow[], {
        bookId: item.bookId,
        outcome: item.outcome,
        odds: item.odds,
        line: item.recommendedLine,
        direction,
      });
      const marketLine = binary
        ? 0.5
        : item.recommendedLine ?? trackedOdds?.line ?? null;
      if (!binary && marketLine === null) {
        this.logger.debug(`No exact line available for wager item ${itemId}; snapshot skipped`);
        return null;
      }

      const probability = binary
        ? direction === BetDirection.NO
          ? 1 - assembly.distribution.mean
          : assembly.distribution.mean
        : direction === BetDirection.UNDER
          ? probabilityUnder(assembly.distribution, marketLine!)
          : probabilityOver(assembly.distribution, marketLine!);
      const rawImpliedProbability = americanToImplied(item.odds);
      const standaloneEv = expectedValue(probability, item.odds);

      const availability = await this.prisma.playerAvailabilityProjection.findUnique({
        where: {
          eventId_playerId: {
            eventId: market.eventId,
            playerId: market.player.id,
          },
        },
      }).catch(() => null);
      const unresolvedAvailability = !availability || (
        availability.expectedAvailabilityProb >= 0.2 && availability.expectedAvailabilityProb < 0.8
      );
      const unresolvedLineup = !assembly.inputs.rotationAvailable;
      const unresolvedMinutesRestriction = assembly.qualityReasons.includes('MINUTES_RESTRICTION_UNRESOLVED');

      const paired = trackedOdds
        ? market.marketOdds.filter((row) =>
            row.bookId === trackedOdds.bookId &&
            (binary || row.line === trackedOdds.line),
          ) as OddsRow[]
        : [];
      let decision: ReturnType<typeof evaluateDecision> | ReturnType<typeof evaluateBinaryDecision> | null = null;
      if (binary) {
        const yes = paired.find((row) => row.outcome.trim().toLowerCase() === 'yes');
        const no = paired.find((row) => row.outcome.trim().toLowerCase() === 'no');
        if (yes && no) {
          decision = evaluateBinaryDecision({
            probabilityYes: assembly.distribution.mean,
            yesOdds: yes.odds,
            noOdds: no.odds,
            dataQuality: assembly.dataQuality,
            unresolvedAvailability,
            unresolvedLineup,
            unresolvedMinutesRestriction,
          });
        }
      } else {
        const over = paired.find((row) => row.outcome.trim().toLowerCase() === 'over');
        const under = paired.find((row) => row.outcome.trim().toLowerCase() === 'under');
        if (over && under && marketLine !== null) {
          decision = evaluateDecision({
            distribution: assembly.distribution,
            market: {
              line: marketLine,
              overOdds: over.odds,
              underOdds: under.odds,
              sportsbook: trackedOdds?.book.name,
            },
            dataQuality: assembly.dataQuality,
            unresolvedAvailability,
            unresolvedLineup,
            unresolvedMinutesRestriction,
          });
        }
      }

      const minuteBand = await this.resolveMinuteBand(market.eventId, market.player.id);
      const equation = assembly.distribution.opportunityEquation;
      const uncertainty = assembly.distribution.uncertainty;
      const percentiles = assembly.distribution.percentiles;
      const decisionClass = decision?.decision as DecisionClass | undefined;
      const confidenceBucket = decision?.confidence as ConfidenceBucket | undefined;

      const snapshot = await this.prisma.wagerProjectionSnapshot.create({
        data: {
          betSlipItemId: item.id,
          modelVersion: OPPORTUNITY_MODEL_VERSION,
          analysisMode: 'STANDARD',
          statType: market.propStatType,
          seed: assembly.distribution.seed,
          trials: assembly.distribution.trials,
          mean: assembly.distribution.mean,
          median: assembly.distribution.median,
          stdDev: assembly.distribution.stdDev,
          p05: percentiles.p05,
          p10: percentiles.p10,
          p25: percentiles.p25,
          p50: percentiles.p50,
          p75: percentiles.p75,
          p90: percentiles.p90,
          p95: percentiles.p95,
          minutesFloor: minuteBand.floor,
          minutesMedian: minuteBand.median,
          minutesCeiling: minuteBand.ceiling,
          minutesStdDev: minuteBand.stdDev,
          opportunityRatePerMinute: equation.opportunityRatePerMinute,
          opportunityRateSource: equation.opportunityRateSource,
          conversionRate: equation.conversionRate,
          contextAdjustment: equation.contextAdjustment,
          paceAdjustment: equation.paceAdjustment,
          pppAdjustment: equation.pppAdjustment,
          uncertaintyMinutes: uncertainty.minutes,
          uncertaintyOpportunity: uncertainty.opportunity,
          uncertaintyConversion: uncertainty.conversion,
          uncertaintyContext: uncertainty.context,
          uncertaintyPace: uncertainty.pace,
          uncertaintyTotal: uncertainty.total,
          dataQuality: assembly.dataQuality,
          modelProbability: probability,
          rawImpliedProbability,
          noVigProbability: decision?.noVigProbability ?? null,
          estimatedEv: decision?.estimatedEv ?? standaloneEv,
          edgeProbability: decision?.edgeProbability ?? probability - rawImpliedProbability,
          decisionClass: decisionClass ?? null,
          newsDecision: decision?.newsDecision ?? null,
          marketLine,
          marketOdds: item.odds,
          playableToLine: decision?.playableToLine ?? null,
          playableToOdds: decision?.playableToOdds ?? null,
          qualityReasonCodes: assembly.qualityReasons,
        },
      });

      const itemUpdates: any = {
        propStatType: item.propStatType ?? market.propStatType,
        direction,
        recommendedLine: item.recommendedLine ?? trackedOdds?.line ?? null,
      };
      if (!item.bookId && trackedOdds) itemUpdates.bookId = trackedOdds.bookId;
      if (!item.decisionClass && decisionClass) itemUpdates.decisionClass = decisionClass;
      if (!item.confidenceBucket && confidenceBucket) itemUpdates.confidenceBucket = confidenceBucket;
      await this.prisma.betSlipItem.update({ where: { id: item.id }, data: itemUpdates });

      return snapshot;
    } catch (error) {
      this.logger.warn(`Projection snapshot capture failed for ${itemId}: ${(error as Error).message}`);
      return null;
    }
  }

  private async resolveMinuteBand(eventId: string, playerId: string): Promise<MinuteBand> {
    const rotation = await this.prisma.rotationProjection.findUnique({
      where: { eventId_playerId: { eventId, playerId } },
    });
    if (rotation) {
      return {
        floor: rotation.minutesFloor,
        median: rotation.minutesMedian,
        ceiling: rotation.minutesCeiling,
        stdDev: rotation.minutesStdDev,
      };
    }
    const recent = await this.prisma.statLine.findMany({
      where: { playerId },
      orderBy: { gameDate: 'desc' },
      take: 20,
      select: { minutes: true },
    });
    return deriveHistoricalMinuteBand(recent.map((row) => row.minutes));
  }
}
