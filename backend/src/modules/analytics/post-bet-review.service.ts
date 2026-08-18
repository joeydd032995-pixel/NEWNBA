import { Injectable, Logger } from '@nestjs/common';
import { LegSettlementStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { attributePostBetProcess } from './post-bet-attribution';

@Injectable()
export class PostBetReviewService {
  private readonly logger = new Logger(PostBetReviewService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('25 * * * *')
  async reviewPendingSettledBets(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const items = await this.prisma.betSlipItem.findMany({
        where: {
          postBetReview: null,
          settlementStatus: { not: LegSettlementStatus.PENDING },
          marketId: { not: null },
        },
        include: {
          betSlip: true,
          projectionSnapshot: true,
          market: {
            include: {
              player: true,
              event: { include: { environment: true } },
            },
          },
        },
        take: 250,
      });

      let created = 0;
      for (const item of items) {
        const market = item.market;
        if (!market?.player || !market.event) continue;

        const [rotation, actualStatLine] = await Promise.all([
          this.prisma.rotationProjection.findUnique({
            where: {
              eventId_playerId: {
                eventId: market.event.id,
                playerId: market.player.id,
              },
            },
          }).catch(() => null),
          this.prisma.statLine.findFirst({
            where: {
              playerId: market.player.id,
              eventId: market.event.id,
            },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        // Recommendation-time snapshot is authoritative when present. Rotation
        // rows are a fallback only for older tracked wagers without a snapshot.
        const expectedMinutes = item.projectionSnapshot?.minutesMedian ?? rotation?.minutesMedian ?? null;
        const minutesFloor = item.projectionSnapshot?.minutesFloor ?? rotation?.minutesFloor ?? null;
        const minutesCeiling = item.projectionSnapshot?.minutesCeiling ?? rotation?.minutesCeiling ?? null;
        const actualMinutes = actualStatLine?.minutes ?? null;

        // Usage and game pace remain null until they are stored as immutable
        // recommendation-time fields; do not reconstruct them from later data.
        const expectedUsage = null;
        const actualUsage = actualStatLine?.usgPct ?? null;
        const expectedPace = null;
        const actualPace = null;

        const attribution = attributePostBetProcess({
          expectedMinutes,
          minutesFloor,
          minutesCeiling,
          actualMinutes,
          expectedUsage,
          actualUsage,
          expectedPace,
          actualPace,
          clvPrice: item.clvPrice,
          clvLine: item.clvLine,
        });

        const outcomeContext = `Leg settlement: ${item.settlementStatus}${
          item.actualValue !== null ? `; actual value ${item.actualValue}` : ''
        }.`;

        await this.prisma.postBetReview.create({
          data: {
            betSlipItemId: item.id,
            processGrade: attribution.processGrade,
            expectedMinutes,
            actualMinutes,
            minutesProjectionError: attribution.minutesProjectionError,
            expectedUsage,
            actualUsage,
            usageProjectionError: attribution.usageProjectionError,
            expectedPace,
            actualPace,
            paceProjectionError: attribution.paceProjectionError,
            rotationError: attribution.rotationError,
            marketTimingError: attribution.marketTimingError,
            varianceDominated: attribution.varianceDominated,
            primaryError: attribution.primaryError,
            notes: `${outcomeContext} ${attribution.notes.join(' ')}`.trim(),
          },
        });
        created++;
      }

      if (created > 0) this.logger.log(`Post-bet review: ${created} exact-event process reviews created`);
      return created;
    } catch (error) {
      this.logger.error(`Post-bet review failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  async getRecentReviews(limit = 100) {
    return this.prisma.postBetReview.findMany({
      orderBy: { reviewedAt: 'desc' },
      take: limit,
      include: {
        betSlipItem: {
          include: {
            book: true,
            projectionSnapshot: true,
            market: {
              include: { player: true, event: { include: { homeTeam: true, awayTeam: true } } },
            },
          },
        },
      },
    });
  }
}
