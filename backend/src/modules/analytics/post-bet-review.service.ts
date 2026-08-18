import { Injectable, Logger } from '@nestjs/common';
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
          betSlip: { status: { in: ['WON', 'LOST', 'VOID'] } },
          marketId: { not: null },
        },
        include: {
          betSlip: true,
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
          this.findActualStatLine(
            market.player.id,
            market.event.startTime,
          ),
        ]);

        const expectedMinutes = rotation?.minutesMedian ?? null;
        const actualMinutes = actualStatLine?.minutes ?? null;
        const expectedUsage = null; // Only persist when a pregame usage projection becomes first-class on the wager.
        const actualUsage = actualStatLine?.usgPct || null;
        const expectedPace = null; // GameEnvironment currently stores schedule/rest, not a pregame pace projection.
        const actualPace = null;

        const attribution = attributePostBetProcess({
          expectedMinutes,
          minutesFloor: rotation?.minutesFloor ?? null,
          minutesCeiling: rotation?.minutesCeiling ?? null,
          actualMinutes,
          expectedUsage,
          actualUsage,
          expectedPace,
          actualPace,
          clvPrice: item.clvPrice,
          clvLine: item.clvLine,
        });

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
            notes: attribution.notes.join(' '),
          },
        });
        created++;
      }

      if (created > 0) this.logger.log(`Post-bet review: ${created} process reviews created`);
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
            market: {
              include: { player: true, event: { include: { homeTeam: true, awayTeam: true } } },
            },
          },
        },
      },
    });
  }

  private async findActualStatLine(playerId: string, eventStart: Date) {
    const start = new Date(eventStart.getTime() - 12 * 60 * 60 * 1000);
    const end = new Date(eventStart.getTime() + 36 * 60 * 60 * 1000);
    return this.prisma.statLine.findFirst({
      where: { playerId, gameDate: { gte: start, lte: end } },
      orderBy: { gameDate: 'asc' },
    });
  }
}
