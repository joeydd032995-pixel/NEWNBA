import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { calculateClv } from '../analytics/clv';

interface ClosingCandidate {
  odds: number;
  line: number | null;
  outcome: string;
  updatedAt: Date;
}

interface TrackedSelection {
  outcome: string;
  direction: string | null;
}

/**
 * Select the sportsbook row that represents the tracked wager.
 *
 * Exact outcome text wins. For canonical two-way player props we may safely
 * fall back to the persisted direction. We never guess HOME/AWAY team names or
 * select an arbitrary row from a multi-outcome market.
 */
export function selectClosingCandidate(
  rows: ClosingCandidate[],
  selection: TrackedSelection,
): ClosingCandidate | null {
  if (!rows.length) return null;
  const normalize = (value: string) => value.trim().toLowerCase();
  const exact = rows.find((row) => normalize(row.outcome) === normalize(selection.outcome));
  if (exact) return exact;

  const direction = selection.direction?.toLowerCase();
  if (direction === 'over' || direction === 'under' || direction === 'yes' || direction === 'no') {
    const directional = rows.find((row) => normalize(row.outcome) === direction);
    if (directional) return directional;
  }

  return rows.length === 1 ? rows[0] : null;
}

@Injectable()
export class ClosingLineJob {
  private readonly logger = new Logger(ClosingLineJob.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Capture the last verified sportsbook price around tipoff.
   *
   * The job examines submitted wagers from 15 minutes before tip through
   * 10 minutes after tip. The post-tip allowance handles scheduler/API jitter;
   * only the current persisted sportsbook row is used and no price is invented.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async capturePendingClosers(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const candidates = await this.prisma.betSlipItem.findMany({
        where: {
          closingOdds: null,
          marketId: { not: null },
          bookId: { not: null },
          betSlip: { status: 'SUBMITTED' },
        },
        include: {
          market: { include: { event: true } },
        },
        take: 500,
      });

      const windowStart = now.getTime() - 10 * 60_000;
      const windowEnd = now.getTime() + 15 * 60_000;
      let captured = 0;

      for (const item of candidates) {
        const startTime = item.market?.event?.startTime?.getTime();
        if (!startTime || startTime < windowStart || startTime > windowEnd) continue;
        if (!item.marketId || !item.bookId) continue;

        const rows = await this.prisma.marketOdds.findMany({
          where: {
            marketId: item.marketId,
            bookId: item.bookId,
            isOpen: true,
          },
          orderBy: { updatedAt: 'desc' },
        });

        const closing = selectClosingCandidate(rows, {
          outcome: item.outcome,
          direction: item.direction,
        });
        if (!closing) continue;

        const clv = calculateClv({
          recommendedLine: item.recommendedLine,
          closingLine: closing.line,
          recommendedOdds: item.odds,
          closingOdds: closing.odds,
          direction: item.direction as any,
        });

        await this.prisma.betSlipItem.update({
          where: { id: item.id },
          data: {
            closingLine: closing.line,
            closingOdds: closing.odds,
            clvLine: clv.lineClv,
            clvPrice: clv.priceClv,
            closedAt: now,
          },
        });
        captured++;
      }

      if (captured > 0) this.logger.log(`Captured ${captured} automatic closing line(s)`);
      return captured;
    } catch (error) {
      this.logger.error(`Automatic closing-line capture failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
