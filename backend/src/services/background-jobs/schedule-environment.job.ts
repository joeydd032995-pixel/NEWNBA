import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../modules/prisma/prisma.service';

export interface TeamScheduleContext {
  restDays: number | null;
  backToBack: boolean;
  threeInFour: boolean;
  fourInSix: boolean;
  previousEventId: string | null;
}

interface ScheduleRow {
  id: string;
  startTime: Date;
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Compute schedule-density context exclusively from persisted NBA events.
 * No arena/travel/OT values are synthesized here; those fields remain untouched
 * until verified upstream inputs exist.
 */
export function deriveTeamScheduleContext(
  teamId: string,
  targetStart: Date,
  priorEvents: ScheduleRow[],
): TeamScheduleContext {
  const prior = priorEvents
    .filter((event) =>
      event.startTime.getTime() < targetStart.getTime() &&
      (event.homeTeamId === teamId || event.awayTeamId === teamId),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  if (!prior.length) {
    return {
      restDays: null,
      backToBack: false,
      threeInFour: false,
      fourInSix: false,
      previousEventId: null,
    };
  }

  const previous = prior[0];
  const hoursSincePrevious = (targetStart.getTime() - previous.startTime.getTime()) / 3_600_000;
  const restDays = Math.max(0, hoursSincePrevious / 24 - 1);
  const gamesWithin = (days: number) => prior.filter((event) => {
    const ageMs = targetStart.getTime() - event.startTime.getTime();
    return ageMs > 0 && ageMs <= days * 24 * 3_600_000;
  }).length;

  return {
    restDays,
    backToBack: hoursSincePrevious <= 36,
    // Includes tonight's game: two prior games in the previous 4 days => 3-in-4.
    threeInFour: gamesWithin(4) >= 2,
    // Includes tonight's game: three prior games in the previous 6 days => 4-in-6.
    fourInSix: gamesWithin(6) >= 3,
    previousEventId: previous.id,
  };
}

@Injectable()
export class ScheduleEnvironmentJob {
  private readonly logger = new Logger(ScheduleEnvironmentJob.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Refresh rest-density inputs every six hours and before the normal evening slate. */
  @Cron('12 */6 * * *')
  async refreshScheduleEnvironment(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const horizon = new Date(now.getTime() + 48 * 60 * 60_000);
      const historyStart = new Date(now.getTime() - 8 * 24 * 60 * 60_000);
      const [upcoming, history] = await Promise.all([
        this.prisma.event.findMany({
          where: {
            status: 'SCHEDULED',
            startTime: { gte: now, lte: horizon },
            sport: { slug: 'nba' },
          },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.event.findMany({
          where: {
            startTime: { gte: historyStart, lt: horizon },
            status: { in: ['FINAL', 'LIVE', 'SCHEDULED'] },
            sport: { slug: 'nba' },
          },
          select: {
            id: true,
            startTime: true,
            homeTeamId: true,
            awayTeamId: true,
          },
        }),
      ]);

      let updated = 0;
      for (const event of upcoming) {
        const home = deriveTeamScheduleContext(event.homeTeamId, event.startTime, history);
        const away = deriveTeamScheduleContext(event.awayTeamId, event.startTime, history);
        const restAdvantageHours =
          home.restDays === null || away.restDays === null
            ? 0
            : (home.restDays - away.restDays) * 24;

        const data = {
          homeRestDays: home.restDays,
          awayRestDays: away.restDays,
          homeBackToBack: home.backToBack,
          awayBackToBack: away.backToBack,
          homeThreeInFour: home.threeInFour,
          awayThreeInFour: away.threeInFour,
          homeFourInSix: home.fourInSix,
          awayFourInSix: away.fourInSix,
          restAdvantageHours,
          source: 'newnba_event_schedule_derivation',
          calculatedAt: now,
        };

        await this.prisma.gameEnvironment.upsert({
          where: { eventId: event.id },
          create: { eventId: event.id, ...data },
          update: data,
        });
        updated++;
      }

      if (updated > 0) this.logger.log(`Schedule environment refreshed for ${updated} upcoming NBA game(s)`);
      return updated;
    } catch (error) {
      this.logger.error(`Schedule environment refresh failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
