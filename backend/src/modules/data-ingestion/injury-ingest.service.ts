import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjuryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizationService } from './normalization.service';
import {
  assessAvailability,
  AvailabilityStatus,
  SourceTier,
} from '../projection/source-quality.engine';

interface InjuryPayload {
  injuries: Array<{
    player_name?: string;
    team_name?: string;
    team_abbr?: string;
    status?: string;
    description?: string | null;
    return_eta?: string | null;
    source?: string;
    source_tier?: SourceTier;
    reported_at?: string | null;
    report_url?: string;
  }>;
  source?: string;
  source_tier?: SourceTier;
  data_quality?: 'LOW' | 'MEDIUM' | 'HIGH';
  reported_at?: string;
  fetched_at?: string;
}

@Injectable()
export class InjuryIngestService {
  private readonly logger = new Logger(InjuryIngestService.name);
  private readonly nbaSidecarUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly norm: NormalizationService,
  ) {
    this.nbaSidecarUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
  }

  async syncInjuries(): Promise<number> {
    let upserted = 0;
    try {
      const payload = await this.fetchBestAvailableInjuryPayload();
      const injuries = payload.injuries ?? [];
      const touchedPlayers = new Set<string>();

      for (const item of injuries) {
        const playerName = item.player_name?.trim() ?? '';
        if (!playerName) continue;

        const player = await this.prisma.player.findFirst({
          where: { name: { equals: playerName, mode: 'insensitive' }, isActive: true },
          select: { id: true, teamId: true },
        });
        if (!player) continue;

        const rawStatus = item.status ?? 'Questionable';
        const status = this.norm.normalizeInjuryStatus(rawStatus) as InjuryStatus;
        const source = item.source ?? payload.source ?? 'unknown';
        const sourceTier = item.source_tier ?? payload.source_tier ?? tierForSource(source);
        const reportedAt = parseReportTimestamp(
          item.reported_at ?? payload.reported_at ?? payload.fetched_at,
        );

        // Integrity invariant: return_eta is never eligible to populate reportedAt.
        await this.prisma.injuryReport.upsert({
          where: { playerId_reportedAt: { playerId: player.id, reportedAt } },
          create: {
            playerId: player.id,
            status,
            description: item.description ?? null,
            returnEta: item.return_eta ?? null,
            source,
            reportedAt,
          },
          update: {
            status,
            description: item.description ?? null,
            returnEta: item.return_eta ?? null,
            source,
            updatedAt: new Date(),
          },
        });
        touchedPlayers.add(player.id);
        upserted++;

        if (player.teamId) {
          await this.refreshAvailabilityProjection(player.id, player.teamId, sourceTier);
        }
      }

      this.logger.log(
        `Injury sync used ${payload.source ?? 'unknown'} (${payload.source_tier ?? 'unknown tier'}): ${upserted} reports`,
      );
      return upserted;
    } catch (error) {
      this.logger.warn(`Injury sync failed: ${(error as Error).message}`);
      return 0;
    }
  }

  private async fetchBestAvailableInjuryPayload(): Promise<InjuryPayload> {
    try {
      const response = await axios.get<InjuryPayload>(
        `${this.nbaSidecarUrl}/injuries/official`,
        { timeout: 30_000 },
      );
      if (response.data?.injuries?.length) return response.data;
    } catch (error) {
      this.logger.warn(
        `Official NBA injury report unavailable; degrading to Tier-3 ESPN fallback: ${(error as Error).message}`,
      );
    }

    const fallback = await axios.get<InjuryPayload>(
      `${this.nbaSidecarUrl}/injuries`,
      { timeout: 15_000 },
    );
    return {
      ...fallback.data,
      source: fallback.data?.source ?? 'espn',
      source_tier: fallback.data?.source_tier ?? 'TIER_3_REPORTING',
    };
  }

  private async refreshAvailabilityProjection(
    playerId: string,
    teamId: string,
    newestTier: SourceTier,
  ): Promise<void> {
    const now = new Date();
    const recentReports = await this.prisma.injuryReport.findMany({
      where: { playerId, reportedAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
      orderBy: { reportedAt: 'desc' },
      take: 8,
    });
    if (!recentReports.length) return;

    const observations = recentReports.map((report, index) => ({
      value: report.status as AvailabilityStatus,
      source: report.source ?? 'unknown',
      tier: index === 0 ? newestTier : tierForSource(report.source ?? 'unknown'),
      updatedAt: report.reportedAt,
    }));
    const assessment = assessAvailability(observations, now);
    const upcomingEvents = await this.prisma.event.findMany({
      where: {
        status: 'SCHEDULED',
        startTime: {
          gte: now,
          lte: new Date(now.getTime() + 36 * 60 * 60 * 1000),
        },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      select: { id: true },
    });

    for (const event of upcomingEvents) {
      await this.prisma.playerAvailabilityProjection.upsert({
        where: { eventId_playerId: { eventId: event.id, playerId } },
        create: {
          eventId: event.id,
          playerId,
          officialStatus: assessment.status as InjuryStatus | null,
          expectedAvailabilityProb: assessment.probability,
          dataQuality: assessment.dataQuality,
          source: assessment.authoritativeSource ?? 'unknown',
          sourceTier: assessment.sourceTier ?? 'LOW_PRIORITY',
          sourceUpdatedAt: recentReports[0].reportedAt,
        },
        update: {
          officialStatus: assessment.status as InjuryStatus | null,
          expectedAvailabilityProb: assessment.probability,
          dataQuality: assessment.dataQuality,
          source: assessment.authoritativeSource ?? 'unknown',
          sourceTier: assessment.sourceTier ?? 'LOW_PRIORITY',
          sourceUpdatedAt: recentReports[0].reportedAt,
          projectedAt: new Date(),
        },
      });
    }
  }

  async getActiveInjuries(): Promise<
    { playerId: string; status: InjuryStatus; description: string | null }[]
  > {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
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
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.prisma.injuryReport.findFirst({
      where: { playerId, reportedAt: { gte: since } },
      orderBy: { reportedAt: 'desc' },
      select: { status: true, description: true },
    }) as any;
  }
}

function parseReportTimestamp(value?: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function tierForSource(source: string): SourceTier {
  const normalized = source.toLowerCase();
  if (normalized.includes('official_nba') || normalized.includes('nba.com')) {
    return 'TIER_1_OFFICIAL';
  }
  if (normalized.includes('rotowire') || normalized.includes('sportradar')) {
    return 'TIER_2_HIGH_QUALITY';
  }
  if (normalized.includes('espn') || normalized.includes('reporter')) {
    return 'TIER_3_REPORTING';
  }
  if (normalized.includes('simulated')) return 'SIMULATED';
  return 'LOW_PRIORITY';
}
