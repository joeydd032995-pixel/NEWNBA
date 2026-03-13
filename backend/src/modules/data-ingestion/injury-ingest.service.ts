import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizationService } from './normalization.service';
import { InjuryStatus } from '@prisma/client';

@Injectable()
export class InjuryIngestService {
  private readonly logger = new Logger(InjuryIngestService.name);
  private readonly nbaSidecarUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private norm: NormalizationService,
  ) {
    this.nbaSidecarUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
  }

  async syncInjuries(): Promise<number> {
    let upserted = 0;
    try {
      const resp = await axios.get<{ injuries: any[] }>(`${this.nbaSidecarUrl}/injuries`, { timeout: 15000 });
      const injuries = resp.data?.injuries ?? [];

      for (const item of injuries) {
        const playerName: string = item.player_name ?? '';
        if (!playerName) continue;

        const player = await this.prisma.player.findFirst({
          where: { name: { equals: playerName, mode: 'insensitive' }, isActive: true },
          select: { id: true },
        });
        if (!player) continue;

        const rawStatus: string = item.status ?? 'Questionable';
        const status = this.norm.normalizeInjuryStatus(rawStatus) as InjuryStatus;
        const reportedAt = item.reported_at ? new Date(item.reported_at) : new Date();

        await this.prisma.injuryReport.upsert({
          where: { playerId_reportedAt: { playerId: player.id, reportedAt } },
          create: {
            playerId: player.id,
            status,
            description: item.description ?? null,
            returnEta: item.return_eta ?? null,
            source: item.source ?? 'espn',
            reportedAt,
          },
          update: {
            status,
            description: item.description ?? null,
            returnEta: item.return_eta ?? null,
            updatedAt: new Date(),
          },
        });
        upserted++;
      }
    } catch (e) {
      this.logger.warn(`Injury sync failed: ${(e as Error).message}`);
    }
    return upserted;
  }

  async getActiveInjuries(): Promise<
    { playerId: string; status: InjuryStatus; description: string | null }[]
  > {
    const since = new Date();
    since.setHours(since.getHours() - 48);
    return this.prisma.injuryReport.findMany({
      where: {
        reportedAt: { gte: since },
        status: { in: ['OUT', 'DOUBTFUL', 'GTD', 'QUESTIONABLE'] },
      },
      select: { playerId: true, status: true, description: true },
      orderBy: { reportedAt: 'desc' },
      distinct: ['playerId'],
    }) as any;
  }

  async getPlayerInjuryStatus(
    playerId: string,
  ): Promise<{ status: InjuryStatus; description: string | null } | null> {
    const since = new Date();
    since.setHours(since.getHours() - 48);
    const report = await this.prisma.injuryReport.findFirst({
      where: { playerId, reportedAt: { gte: since } },
      orderBy: { reportedAt: 'desc' },
      select: { status: true, description: true },
    });
    return report as any;
  }
}
