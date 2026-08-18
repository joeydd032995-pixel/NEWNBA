import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BetDirection,
  BetSlipStatus,
  LegSettlementStatus,
  MarketType,
  PropStatType,
  WagerStructure,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  americanToDecimal,
  settleBinaryLeg,
  settleParlay,
  settleStatLeg,
} from '../parlay/settlement.engine';

/**
 * Settles tracked wagers only from exact final-game player StatLines.
 *
 * Unsupported game/team markets intentionally remain PENDING until a verified
 * settlement adapter exists. No score, outcome or stat is inferred from a
 * mismatched event or reconstructed from a current roster.
 */
@Injectable()
export class TrackedWagerSettlementJob {
  private readonly logger = new Logger(TrackedWagerSettlementJob.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/15 * * * *')
  async settlePendingTrackedWagers(): Promise<{
    settledLegs: number;
    settledSlips: number;
    pendingUnsupported: number;
  }> {
    if (this.running) return { settledLegs: 0, settledSlips: 0, pendingUnsupported: 0 };
    this.running = true;
    let settledLegs = 0;
    let settledSlips = 0;
    let pendingUnsupported = 0;

    try {
      const slips = await this.prisma.betSlip.findMany({
        where: {
          status: BetSlipStatus.SUBMITTED,
          items: { some: { settlementStatus: LegSettlementStatus.PENDING } },
        },
        include: {
          items: {
            include: {
              market: {
                include: {
                  event: { select: { id: true, status: true } },
                  player: { select: { id: true } },
                },
              },
            },
          },
        },
        take: 250,
      });

      for (const slip of slips) {
        for (const item of slip.items) {
          if (item.settlementStatus !== LegSettlementStatus.PENDING) continue;
          const result = await this.resolvePlayerPropLeg(item);
          if (!result) {
            if (item.market?.event?.status === 'FINAL') pendingUnsupported++;
            continue;
          }
          await this.prisma.betSlipItem.update({
            where: { id: item.id },
            data: {
              settlementStatus: result.status,
              actualValue: result.actualValue,
              settlementSource: 'exact_event_stat_line',
              settledAt: new Date(),
            },
          });
          settledLegs++;
        }

        if (await this.finalizeSlip(slip.id)) settledSlips++;
      }

      if (settledLegs || settledSlips || pendingUnsupported) {
        this.logger.log(
          `Tracked settlement: ${settledLegs} legs, ${settledSlips} slips, ${pendingUnsupported} final-event unsupported legs still pending`,
        );
      }
      return { settledLegs, settledSlips, pendingUnsupported };
    } catch (error) {
      this.logger.error(`Tracked settlement failed: ${(error as Error).message}`);
      return { settledLegs, settledSlips, pendingUnsupported };
    } finally {
      this.running = false;
    }
  }

  private async resolvePlayerPropLeg(item: any): Promise<{
    status: LegSettlementStatus;
    actualValue: number;
  } | null> {
    const market = item.market;
    if (!market || market.event?.status !== 'FINAL') return null;
    if (
      market.marketType !== MarketType.PLAYER_PROP &&
      market.marketType !== MarketType.PLAYER_PROP_ALTERNATE
    ) return null;
    if (!market.player?.id || !market.propStatType) return null;

    const statLine = await this.prisma.statLine.findFirst({
      where: { playerId: market.player.id, eventId: market.event.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!statLine) return null;

    const actualValue = statValue(statLine, market.propStatType);
    if (
      market.propStatType === PropStatType.DOUBLE_DOUBLE ||
      market.propStatType === PropStatType.TRIPLE_DOUBLE
    ) {
      if (item.direction !== BetDirection.YES && item.direction !== BetDirection.NO) return null;
      const status = settleBinaryLeg({
        direction: item.direction,
        actualResult: actualValue >= 1,
      }) as LegSettlementStatus;
      return { status, actualValue };
    }

    if (item.direction !== BetDirection.OVER && item.direction !== BetDirection.UNDER) return null;
    if (item.recommendedLine === null || item.recommendedLine === undefined) return null;
    const status = settleStatLeg({
      direction: item.direction,
      line: item.recommendedLine,
      actualValue,
    }) as LegSettlementStatus;
    return { status, actualValue };
  }

  private async finalizeSlip(slipId: string): Promise<boolean> {
    const slip = await this.prisma.betSlip.findUnique({
      where: { id: slipId },
      include: { items: true },
    });
    if (!slip || slip.status !== BetSlipStatus.SUBMITTED) return false;
    if (slip.items.some((item) => item.settlementStatus === LegSettlementStatus.PENDING)) return false;

    const settledAt = new Date();
    if (slip.structure === WagerStructure.PARLAY) {
      const ticketStake = slip.ticketStake ?? slip.totalStake;
      const result = settleParlay(
        slip.items.map((item) => ({
          status: item.settlementStatus,
          americanOdds: item.odds,
        })),
        ticketStake,
      );
      if (result.status === 'PENDING') return false;
      await this.prisma.betSlip.update({
        where: { id: slip.id },
        data: {
          status: result.status as BetSlipStatus,
          totalOdds: result.decimalOdds,
          settlementPayout: result.stakeReturned,
          settlementProfitLoss: result.profitLoss,
          settledAt,
        },
      });
      return true;
    }

    let payout = 0;
    for (const item of slip.items) {
      if (item.settlementStatus === LegSettlementStatus.WIN) {
        payout += item.stake * americanToDecimal(item.odds);
      } else if (
        item.settlementStatus === LegSettlementStatus.PUSH ||
        item.settlementStatus === LegSettlementStatus.VOID
      ) {
        payout += item.stake;
      }
    }
    await this.prisma.betSlip.update({
      where: { id: slip.id },
      data: {
        status: BetSlipStatus.SETTLED,
        settlementPayout: payout,
        settlementProfitLoss: payout - slip.totalStake,
        settledAt,
      },
    });
    return true;
  }
}

export function statValue(statLine: any, statType: PropStatType): number {
  switch (statType) {
    case PropStatType.POINTS: return statLine.points;
    case PropStatType.REBOUNDS: return statLine.rebounds;
    case PropStatType.ASSISTS: return statLine.assists;
    case PropStatType.STEALS: return statLine.steals;
    case PropStatType.BLOCKS: return statLine.blocks;
    case PropStatType.THREES: return statLine.fg3m;
    case PropStatType.TURNOVERS: return statLine.turnovers;
    case PropStatType.STOCKS: return statLine.steals + statLine.blocks;
    case PropStatType.MINUTES: return statLine.minutes;
    case PropStatType.PRA: return statLine.points + statLine.rebounds + statLine.assists;
    case PropStatType.PR: return statLine.points + statLine.rebounds;
    case PropStatType.PA: return statLine.points + statLine.assists;
    case PropStatType.RA: return statLine.rebounds + statLine.assists;
    case PropStatType.DOUBLE_DOUBLE:
      return [statLine.points, statLine.rebounds, statLine.assists, statLine.steals, statLine.blocks]
        .filter((value) => value >= 10).length >= 2 ? 1 : 0;
    case PropStatType.TRIPLE_DOUBLE:
      return [statLine.points, statLine.rebounds, statLine.assists, statLine.steals, statLine.blocks]
        .filter((value) => value >= 10).length >= 3 ? 1 : 0;
    default: return 0;
  }
}
