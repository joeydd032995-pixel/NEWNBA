import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { classifyReportingSource } from './news-source-registry';

interface NewsPayloadItem {
  id?: string;
  link?: string;
  headline?: string;
  summary?: string | null;
  url?: string | null;
  source?: string | null;
  source_key?: string | null;
  source_class?: string | null;
  source_tier?: string | null;
  reporter_name?: string | null;
  player_name?: string | null;
  team_abbr?: string | null;
  published_at?: string | null;
}

@Injectable()
export class NewsIngestService {
  private readonly logger = new Logger(NewsIngestService.name);
  private readonly nbaSidecarUrl: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.nbaSidecarUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
  }

  async syncNews(): Promise<number> {
    let inserted = 0;
    try {
      const resp = await axios.get<{ items: NewsPayloadItem[] }>(`${this.nbaSidecarUrl}/news`, { timeout: 15000 });
      const items = resp.data?.items ?? [];

      for (const item of items) {
        const externalId = String(item.id ?? item.link ?? '').trim();
        if (!externalId) continue;

        const exists = await this.prisma.newsItem.findUnique({ where: { externalId } });
        if (exists) continue;

        const source = String(item.source ?? 'unknown').trim().toLowerCase();
        // Simulated reporting is never evidence, even if a future upstream
        // adapter accidentally labels it as a normal source.
        if (source.includes('simulated')) {
          this.logger.warn(`Rejected simulated news evidence ${externalId}`);
          continue;
        }

        const assessment = classifyReportingSource({
          source,
          sourceKey: item.source_key,
          sourceClass: item.source_class,
          sourceTier: item.source_tier,
          reporterName: item.reporter_name,
        });

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

        const publishedAt = parsePublishedAt(item.published_at);
        await this.prisma.newsItem.create({
          data: {
            externalId,
            headline: item.headline ?? '',
            summary: item.summary ?? null,
            url: item.url ?? null,
            source,
            sourceKey: assessment.sourceKey,
            sourceTier: assessment.sourceTier,
            sourceClass: assessment.sourceClass,
            dataQuality: assessment.dataQuality,
            playerId,
            teamId,
            publishedAt,
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

function parsePublishedAt(value?: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
