import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RefereeRole } from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';
import {
  NbaDataService,
  NbaOfficialPerson,
  NbaRefereeAssignmentRow,
} from '../nba-data/nba-data.service';

const OFFICIAL_TEAM_LABELS: Record<string, string[]> = {
  ATL: ['ATLANTA'], BOS: ['BOSTON'], BKN: ['BROOKLYN'], CHA: ['CHARLOTTE'],
  CHI: ['CHICAGO'], CLE: ['CLEVELAND'], DAL: ['DALLAS'], DEN: ['DENVER'],
  DET: ['DETROIT'], GSW: ['GOLDEN STATE'], HOU: ['HOUSTON'], IND: ['INDIANA'],
  LAC: ['LA CLIPPERS', 'LOS ANGELES CLIPPERS'],
  LAL: ['LA LAKERS', 'LOS ANGELES LAKERS'],
  MEM: ['MEMPHIS'], MIA: ['MIAMI'], MIL: ['MILWAUKEE'], MIN: ['MINNESOTA'],
  NOP: ['NEW ORLEANS'], NYK: ['NEW YORK'], OKC: ['OKLAHOMA CITY'], ORL: ['ORLANDO'],
  PHI: ['PHILADELPHIA'], PHX: ['PHOENIX'], POR: ['PORTLAND'], SAC: ['SACRAMENTO'],
  SAS: ['SAN ANTONIO'], TOR: ['TORONTO'], UTA: ['UTAH'], WAS: ['WASHINGTON'],
};

type EventCandidate = {
  id: string;
  homeTeam: { name: string; city: string | null; abbreviation: string };
  awayTeam: { name: string; city: string | null; abbreviation: string };
};

@Injectable()
export class RefereeAssignmentJob {
  private readonly logger = new Logger(RefereeAssignmentJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nbaData: NbaDataService,
  ) {}

  /**
   * NBA Official posts game-day crews around 09:00 ET. Hourly polling provides
   * resilience to delayed publication without creating synthetic assignments.
   */
  @Cron('20 * * * *')
  async syncOfficialAssignments(now = new Date()): Promise<number> {
    if (this.running || !this.nbaData.isEnabled) return 0;
    this.running = true;
    try {
      const feed = await this.nbaData.getOfficialRefereeAssignments();
      if (!feed.assignments.length) return 0;

      const events = await this.prisma.event.findMany({
        where: {
          status: { in: ['SCHEDULED', 'LIVE'] },
          startTime: {
            gte: new Date(now.getTime() - 8 * 60 * 60_000),
            lte: new Date(now.getTime() + 36 * 60 * 60_000),
          },
        },
        include: { homeTeam: true, awayTeam: true },
      });

      let persisted = 0;
      const confirmedAt = validDate(feed.fetched_at) ?? now;
      for (const assignment of feed.assignments) {
        const event = matchRefereeEvent(assignment.game, events);
        if (!event) {
          this.logger.debug(`No unique NBA event match for official crew row: ${assignment.game}`);
          continue;
        }

        persisted += await this.persistOfficial(event.id, assignment.crew_chief, RefereeRole.CREW_CHIEF, confirmedAt);
        persisted += await this.persistOfficial(event.id, assignment.referee, RefereeRole.REFEREE, confirmedAt);
        persisted += await this.persistOfficial(event.id, assignment.umpire, RefereeRole.UMPIRE, confirmedAt);
        persisted += await this.persistOfficial(event.id, assignment.alternate, RefereeRole.ALTERNATE, confirmedAt);
      }

      if (persisted > 0) this.logger.log(`Official referee assignments: ${persisted} crew positions persisted`);
      return persisted;
    } catch (error) {
      this.logger.warn(`Official referee assignment sync unavailable: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async persistOfficial(
    eventId: string,
    official: NbaOfficialPerson | null,
    role: RefereeRole,
    confirmedAt: Date,
  ): Promise<number> {
    if (!official?.name) return 0;
    let referee = await this.prisma.referee.findFirst({
      where: { name: { equals: official.name, mode: 'insensitive' } },
    });
    if (!referee) {
      referee = await this.prisma.referee.create({ data: { name: official.name } });
    }

    await this.prisma.refereeAssignment.upsert({
      where: { eventId_refereeId: { eventId, refereeId: referee.id } },
      create: {
        eventId,
        refereeId: referee.id,
        role,
        source: 'official_nba_referee_assignments',
        sourceTier: 'TIER_1_OFFICIAL',
        confirmedAt,
      },
      update: {
        role,
        source: 'official_nba_referee_assignments',
        sourceTier: 'TIER_1_OFFICIAL',
        confirmedAt,
      },
    });
    return 1;
  }
}

export function matchRefereeEvent(game: string, events: EventCandidate[]): EventCandidate | null {
  const parts = game.split('@').map((part) => normalizeTeamLabel(part));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [awayLabel, homeLabel] = parts;
  const matches = events.filter((event) =>
    teamMatchesLabel(event.awayTeam, awayLabel) && teamMatchesLabel(event.homeTeam, homeLabel),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function teamMatchesLabel(team: EventCandidate['homeTeam'], label: string): boolean {
  const aliases = new Set<string>([
    team.abbreviation,
    team.name,
    team.city ?? '',
    `${team.city ?? ''} ${team.name}`,
    ...(OFFICIAL_TEAM_LABELS[team.abbreviation] ?? []),
  ].map(normalizeTeamLabel).filter(Boolean));
  return aliases.has(normalizeTeamLabel(label));
}

function normalizeTeamLabel(value: string): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bTHE\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
