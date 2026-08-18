import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { NbaDataService, NbaOfficialArenaRow } from '../nba-data/nba-data.service';

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
 * No travel/altitude/time-zone values are synthesized here. Arena identity is
 * separately fetched from current first-party NBA team profiles when available.
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
    threeInFour: gamesWithin(4) >= 2,
    fourInSix: gamesWithin(6) >= 3,
    previousEventId: previous.id,
  };
}

@Injectable()
export class ScheduleEnvironmentJob {
  private readonly logger = new Logger(ScheduleEnvironmentJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly nbaData?: NbaDataService,
  ) {}

  /** Refresh rest-density inputs every six hours and before the normal evening slate. */
  @Cron('12 */6 * * *')
  async refreshScheduleEnvironment(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const horizon = new Date(now.getTime() + 48 * 60 * 60_000);
      const historyStart = new Date(now.getTime() - 8 * 24 * 60 * 60_000);
      const [upcoming, history, arenaByTeam] = await Promise.all([
        this.prisma.event.findMany({
          where: {
            status: 'SCHEDULED',
            startTime: { gte: now, lte: horizon },
            sport: { slug: 'nba' },
          },
          include: {
            homeTeam: { select: { abbreviation: true } },
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
        this.loadOfficialArenaMap(),
      ]);

      let updated = 0;
      for (const event of upcoming) {
        const home = deriveTeamScheduleContext(event.homeTeamId, event.startTime, history);
        const away = deriveTeamScheduleContext(event.awayTeamId, event.startTime, history);
        const restAdvantageHours =
          home.restDays === null || away.restDays === null
            ? 0
            : (home.restDays - away.restDays) * 24;
        const officialArena = arenaByTeam.get(event.homeTeam.abbreviation.toUpperCase()) ?? null;

        const data = {
          ...(officialArena ? {
            arenaName: officialArena.arena,
            arenaCity: officialArena.city,
          } : {}),
          homeRestDays: home.restDays,
          awayRestDays: away.restDays,
          homeBackToBack: home.backToBack,
          awayBackToBack: away.backToBack,
          homeThreeInFour: home.threeInFour,
          awayThreeInFour: away.threeInFour,
          homeFourInSix: home.fourInSix,
          awayFourInSix: away.fourInSix,
          restAdvantageHours,
          // Mixed provenance is explicit. Do not label the whole environment
          // row Tier 1 because schedule-density fields are derived locally.
          source: officialArena
            ? 'newnba_event_schedule_derivation+nba_team_profile'
            : 'newnba_event_schedule_derivation',
          sourceTier: null,
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

  private async loadOfficialArenaMap(): Promise<Map<string, NbaOfficialArenaRow>> {
    const result = new Map<string, NbaOfficialArenaRow>();
    if (!this.nbaData?.isEnabled) return result;
    try {
      const payload = await this.nbaData.getOfficialArenas();
      for (const row of payload.arenas ?? []) {
        if (!row.arena || !row.city || row.data_quality === 'LOW') continue;
        result.set(row.team_abbr.toUpperCase(), row);
      }
    } catch (error) {
      this.logger.warn(`Official NBA arena profiles unavailable: ${(error as Error).message}`);
    }
    return result;
  }
}
