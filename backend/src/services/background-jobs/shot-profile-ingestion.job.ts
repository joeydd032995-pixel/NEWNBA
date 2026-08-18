import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { NbaDataService } from '../nba-data/nba-data.service';
import { NbaShotDataService } from '../nba-data/nba-shot-data.service';

@Injectable()
export class ShotProfileIngestionJob {
  private readonly logger = new Logger(ShotProfileIngestionJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nbaData: NbaDataService,
    private readonly shotData: NbaShotDataService,
  ) {}

  /**
   * Refresh official shot-location profiles once daily for players expected to
   * enter the next 36-hour rotation. Sequential requests deliberately trade
   * speed for upstream stability; failures lower coverage rather than creating
   * substitute values.
   */
  @Cron('30 9 * * *')
  async refreshUpcomingPlayerProfiles(now = new Date()): Promise<number> {
    if (this.running || !this.nbaData.isEnabled) return 0;
    this.running = true;
    try {
      const horizon = new Date(now.getTime() + 36 * 60 * 60_000);
      const rotations = await this.prisma.rotationProjection.findMany({
        where: {
          minutesMedian: { gte: 10 },
          event: {
            status: 'SCHEDULED',
            startTime: { gte: now, lte: horizon },
          },
        },
        include: { player: true },
        orderBy: { minutesMedian: 'desc' },
      });

      const uniquePlayers = new Map<string, (typeof rotations)[number]['player']>();
      for (const rotation of rotations) {
        if (!uniquePlayers.has(rotation.playerId)) uniquePlayers.set(rotation.playerId, rotation.player);
      }
      if (!uniquePlayers.size) return 0;

      const season = await this.nbaData.getCurrentSeason();
      const active = await this.nbaData.getActivePlayers(season);
      const nbaIdByName = new Map(active.map((player) => [normalizeName(player.name), player.nba_id]));

      let persisted = 0;
      for (const player of [...uniquePlayers.values()].slice(0, 180)) {
        const nbaId = nbaIdByName.get(normalizeName(player.name));
        if (!nbaId) continue;
        try {
          const result = await this.shotData.getPlayerShotProfile(nbaId, season);
          if (!result.profile || result.data_quality === 'LOW') continue;
          const profile = result.profile;
          const currentSeasonMinutes = await this.currentSeasonMinutes(player.id, season);
          const existing = await this.prisma.playerShotProfile.findFirst({
            where: {
              playerId: player.id,
              season,
              gameDate: null,
              source: 'stats.nba.com/shotchartdetail',
            },
            orderBy: { createdAt: 'desc' },
          });

          const zoneData = {
            minutes: currentSeasonMinutes,
            rimAttempts: profile.rim.attempts,
            rimFrequency: profile.rim.frequency,
            rimEfficiency: profile.rim.efficiency,
            midrangeAttempts: profile.midrange.attempts,
            midrangeFrequency: profile.midrange.frequency,
            midrangeEfficiency: profile.midrange.efficiency,
            corner3Attempts: profile.corner3.attempts,
            corner3Frequency: profile.corner3.frequency,
            corner3Efficiency: profile.corner3.efficiency,
            atb3Attempts: profile.atb3.attempts,
            atb3Frequency: profile.atb3.frequency,
            atb3Efficiency: profile.atb3.efficiency,
            ...(profile.expected_efg !== null ? { expectedEfg: profile.expected_efg } : {}),
          };

          if (existing) {
            await this.prisma.playerShotProfile.update({
              where: { id: existing.id },
              data: zoneData,
            });
          } else {
            await this.prisma.playerShotProfile.create({
              data: {
                playerId: player.id,
                season,
                gameDate: null,
                source: 'stats.nba.com/shotchartdetail',
                sourceTier: 'TIER_1_OFFICIAL',
                ...zoneData,
              },
            });
          }
          persisted++;
        } catch (error) {
          this.logger.debug(`Shot profile unavailable for ${player.name}: ${(error as Error).message}`);
        }
        await delay(350);
      }

      if (persisted > 0) this.logger.log(`Official shot profiles refreshed for ${persisted} upcoming rotation player(s)`);
      return persisted;
    } catch (error) {
      this.logger.error(`Shot-profile ingestion failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async currentSeasonMinutes(playerId: string, season: string): Promise<number> {
    const rows = await this.prisma.statLine.findMany({
      where: { playerId, season },
      select: { minutes: true },
    });
    return rows.reduce((sum, row) => sum + Math.max(0, row.minutes), 0);
  }
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
