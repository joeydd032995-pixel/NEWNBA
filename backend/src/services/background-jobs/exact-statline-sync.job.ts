import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { NbaDataService } from '../nba-data/nba-data.service';
import {
  CandidateEvent,
  resolveStatLogEvent,
} from './statline-event-resolver';

/**
 * Exact replacement for generic-anchor StatLine ingestion.
 *
 * Each nba_api game log must resolve uniquely by matchup + game date. Unresolved
 * rows are skipped. Existing same-player/same-date rows may have eventId repaired
 * only when this exact resolver identifies the actual event.
 */
@Injectable()
export class ExactStatLineSyncJob {
  private readonly logger = new Logger(ExactStatLineSyncJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nbaData: NbaDataService,
  ) {}

  @Cron('45 7 * * *')
  async syncRecentExactLogs(): Promise<{ created: number; updated: number; skipped: number }> {
    if (this.running || !this.nbaData.isEnabled) return { created: 0, updated: 0, skipped: 0 };
    this.running = true;
    try {
      const season = await this.nbaData.getCurrentSeason();
      const [activePlayers, dbPlayers, events] = await Promise.all([
        this.nbaData.getActivePlayers(season),
        this.prisma.player.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.event.findMany({
          where: {
            sport: { slug: 'nba' },
            status: { in: ['FINAL', 'LIVE'] },
          },
          include: {
            homeTeam: { select: { abbreviation: true } },
            awayTeam: { select: { abbreviation: true } },
          },
          orderBy: { startTime: 'desc' },
          take: 350,
        }),
      ]);

      const dbByName = new Map(dbPlayers.map((player) => [normalizePlayerName(player.name), player.id]));
      const candidates: CandidateEvent[] = events.map((event) => ({
        id: event.id,
        startTime: event.startTime,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
      }));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const nbaPlayer of activePlayers) {
        const playerId = dbByName.get(normalizePlayerName(nbaPlayer.name));
        if (!playerId) continue;

        let logs;
        try {
          logs = await this.nbaData.getPlayerGameLogs(nbaPlayer.nba_id, season, 12);
        } catch (error) {
          skipped++;
          this.logger.debug(`Exact game-log fetch unavailable for ${nbaPlayer.name}: ${(error as Error).message}`);
          continue;
        }

        for (const log of logs) {
          const gameDate = new Date(log.game_date);
          const resolvedEvent = resolveStatLogEvent(
            { gameDate, matchup: log.matchup },
            candidates,
          );
          if (!resolvedEvent) {
            skipped++;
            continue;
          }

          const data = {
            eventId: resolvedEvent.id,
            season: log.season || season,
            gameDate,
            points: log.points,
            rebounds: log.rebounds,
            assists: log.assists,
            steals: log.steals,
            blocks: log.blocks,
            turnovers: log.turnovers,
            minutes: log.minutes,
            fgm: log.fgm,
            fga: log.fga,
            fgPct: log.fg_pct,
            fg3m: log.fg3m,
            fg3a: log.fg3a,
            fg3Pct: log.fg3_pct,
            ftm: log.ftm,
            fta: log.fta,
            ftPct: log.ft_pct,
            plusMinus: log.plus_minus,
            usgPct: log.usg_pct,
            tsPct: log.ts_pct,
            efgPct: log.efg_pct,
            bpm: log.bpm,
          };

          const existing = await this.prisma.statLine.findFirst({
            where: {
              playerId,
              gameDate: {
                gte: startOfUtcDay(gameDate),
                lt: startOfUtcDay(new Date(gameDate.getTime() + 24 * 60 * 60_000)),
              },
            },
            orderBy: { createdAt: 'asc' },
          });

          if (existing) {
            await this.prisma.statLine.update({
              where: { id: existing.id },
              data,
            });
            updated++;
          } else {
            await this.prisma.statLine.create({
              data: { playerId, ...data },
            });
            created++;
          }
        }
      }

      this.logger.log(
        `Exact StatLine sync complete: ${created} created, ${updated} updated/repaired, ${skipped} unresolved/skipped`,
      );
      return { created, updated, skipped };
    } catch (error) {
      this.logger.error(`Exact StatLine sync failed: ${(error as Error).message}`);
      return { created: 0, updated: 0, skipped: 0 };
    } finally {
      this.running = false;
    }
  }
}

export function normalizePlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
