import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewsIngestService {
  private readonly logger = new Logger(NewsIngestService.name);
  private readonly nbaSidecarUrl: string;

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.nbaSidecarUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
  }

  async syncNews(): Promise<number> {
    let inserted = 0;
    try {
      const resp = await firstValueFrom(
        this.http.get<{ items: any[] }>(`${this.nbaSidecarUrl}/news`, {
          timeout: 15000,
        } as any),
      );
      const items = (resp as any).data?.items ?? [];

      for (const item of items) {
        const externalId: string = item.id ?? item.link ?? '';
        if (!externalId) continue;

        const exists = await this.prisma.newsItem.findUnique({ where: { externalId } });
        if (exists) continue;

        let playerId: string | null = null;
        if (item.player_name) {
          const player = await this.prisma.player.findFirst({
            where: { name: { equals: item.player_name, mode: 'insensitive' } },
            select: { id: true },
          });
          playerId = player?.id ?? null;
        }

        let teamId: string | null = null;
        if (item.team_abbr) {
          const team = await this.prisma.team.findFirst({
            where: { abbreviation: { equals: item.team_abbr, mode: 'insensitive' } },
            select: { id: true },
          });
          teamId = team?.id ?? null;
        }

        await this.prisma.newsItem.create({
          data: {
            externalId,
            headline: item.headline ?? '',
            summary: item.summary ?? null,
            url: item.url ?? null,
            source: item.source ?? 'espn',
            playerId,
            teamId,
            publishedAt: item.published_at ? new Date(item.published_at) : new Date(),
          },
        });
        inserted++;
      }
    } catch (e) {
      this.logger.warn(`News sync failed: ${(e as Error).message}`);
    }
    return inserted;
  }

  async getRecentNews(limit = 20): Promise<any[]> {
    return this.prisma.newsItem.findMany({
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: {
        player: { select: { name: true, team: { select: { abbreviation: true } } } },
        team: { select: { name: true, abbreviation: true } },
      },
    });
  }

  async getPlayerNews(playerId: string, limit = 10): Promise<any[]> {
    return this.prisma.newsItem.findMany({
      where: { playerId },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }
}
