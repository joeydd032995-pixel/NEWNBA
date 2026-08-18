import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DataQualityLevel,
  PlayerRotationRole,
  StarterStatus,
} from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { projectRotationMinutes } from '../../modules/projection/rotation.engine';
import {
  redistributeInjuryRole,
  ReplacementCandidate,
} from '../../modules/projection/injury-replacement.engine';
import { clamp, mean, percentile } from '../../modules/projection/projection.math';

interface PlayerHistory {
  playerId: string;
  position: string | null;
  minutes: number[];
  points: number[];
  assists: number[];
  rebounds: number[];
  fga: number[];
  fg3a: number[];
  steals: number[];
  blocks: number[];
  usage: number[];
}

interface CandidateFeatures {
  playerId: string;
  minuteCapacity: number;
  usage: number;
  handling: number;
  rebounding: number;
  shooting: number;
  threes: number;
  defense: number;
}

/**
 * Builds tonight's rotation ranges before player-stat projection and then
 * redistributes unavailable-player role components into replacement players.
 * The job never writes fabricated source observations; all outputs are model
 * projections with explicit uncertainty and data-quality levels.
 */
@Injectable()
export class RotationReplacementJob {
  private readonly logger = new Logger(RotationReplacementJob.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/10 * * * *')
  async projectUpcomingRotations(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const horizon = new Date(now.getTime() + 36 * 60 * 60_000);
      const events = await this.prisma.event.findMany({
        where: {
          status: 'SCHEDULED',
          startTime: { gte: now, lte: horizon },
        },
        include: {
          homeTeam: { include: { players: { where: { isActive: true } } } },
          awayTeam: { include: { players: { where: { isActive: true } } } },
        },
        orderBy: { startTime: 'asc' },
      });

      let written = 0;
      for (const event of events) {
        const environment = await this.prisma.gameEnvironment.findUnique({ where: { eventId: event.id } });
        const spread = await this.representativeSpread(event.id);
        written += await this.projectTeam(event, event.homeTeam, true, environment, spread);
        written += await this.projectTeam(event, event.awayTeam, false, environment, spread);
      }

      if (written > 0) this.logger.log(`Rotation/replacement projection: ${written} player rotations updated`);
      return written;
    } catch (error) {
      this.logger.error(`Rotation/replacement projection failed: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async projectTeam(
    event: any,
    team: any,
    isHome: boolean,
    environment: any,
    spread: number | null,
  ): Promise<number> {
    const playerIds = team.players.map((player: any) => player.id);
    if (!playerIds.length) return 0;

    const [statLines, lineups, availability, coach] = await Promise.all([
      this.prisma.statLine.findMany({
        where: { playerId: { in: playerIds } },
        orderBy: { gameDate: 'desc' },
        take: 320,
      }),
      this.prisma.gameLineup.findMany({
        where: {
          eventId: event.id,
          teamId: team.id,
          lineupType: { in: ['OFFICIAL_STARTERS', 'EXPECTED_STARTERS'] },
          status: { in: ['CONFIRMED', 'PROJECTED'] },
        },
        include: { players: true },
      }),
      this.prisma.playerAvailabilityProjection.findMany({
        where: { eventId: event.id, playerId: { in: playerIds } },
      }),
      this.prisma.coachRotationTendency.findFirst({
        where: { teamId: team.id },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const history = buildHistory(team.players, statLines);
    const availabilityByPlayer = new Map(availability.map((row) => [row.playerId, row]));
    const official = lineups.find((row) => row.lineupType === 'OFFICIAL_STARTERS');
    const expected = lineups.find((row) => row.lineupType === 'EXPECTED_STARTERS');
    const officialIds = new Set(official?.players.map((row) => row.playerId) ?? []);
    const expectedIds = new Set(expected?.players.map((row) => row.playerId) ?? []);
    const lineupKnown = officialIds.size > 0 || expectedIds.size > 0;
    const backToBack = Boolean(isHome ? environment?.homeBackToBack : environment?.awayBackToBack);
    const coachVolatility = coach
      ? clamp(1 - coach.closingLineupStability, 0.1, 0.9)
      : 0.4;

    const projected = new Map<string, any>();
    let written = 0;

    for (const player of team.players) {
      const playerHistory = history.get(player.id);
      if (!playerHistory || playerHistory.minutes.length < 3) continue;
      const availabilityRow = availabilityByPlayer.get(player.id);
      const starterStatus = resolveStarterStatus(player.id, officialIds, expectedIds, lineupKnown);
      const returningFromInjury = Boolean(
        availabilityRow &&
          ['QUESTIONABLE', 'GTD', 'PROBABLE'].includes(String(availabilityRow.officialStatus ?? '')),
      );

      const minutes = projectRotationMinutes({
        recentMinutes: playerHistory.minutes,
        starterStatus,
        explicitRestrictionMinutes: availabilityRow?.expectedMinutesRestriction ?? null,
        returningFromInjury,
        backToBack,
        coachVolatility,
        blowoutSpread: spread,
      });
      const role = classifyRotationRole(playerHistory);
      const closingProbability = estimateClosingProbability(minutes.minutesMedian, role, starterStatus);

      const row = await this.prisma.rotationProjection.upsert({
        where: { eventId_playerId: { eventId: event.id, playerId: player.id } },
        create: {
          eventId: event.id,
          teamId: team.id,
          playerId: player.id,
          role,
          starterStatus,
          minutesFloor: minutes.minutesFloor,
          minutesMedian: minutes.minutesMedian,
          minutesCeiling: minutes.minutesCeiling,
          minutesStdDev: minutes.minutesStdDev,
          uncertaintyScore: minutes.uncertaintyScore,
          closingProbability,
          restrictionMinutes: availabilityRow?.expectedMinutesRestriction ?? null,
          loadManagementStatus: availabilityRow?.loadManagementStatus ?? 'NONE',
          suspensionStatus: availabilityRow?.suspensionStatus ?? 'NONE',
          source: 'opportunity_first_rotation_v1',
          sourceTier: availabilityRow?.sourceTier ?? 'TIER_2_HIGH_QUALITY',
          projectedAt: new Date(),
        },
        update: {
          teamId: team.id,
          role,
          starterStatus,
          minutesFloor: minutes.minutesFloor,
          minutesMedian: minutes.minutesMedian,
          minutesCeiling: minutes.minutesCeiling,
          minutesStdDev: minutes.minutesStdDev,
          uncertaintyScore: minutes.uncertaintyScore,
          closingProbability,
          restrictionMinutes: availabilityRow?.expectedMinutesRestriction ?? null,
          loadManagementStatus: availabilityRow?.loadManagementStatus ?? 'NONE',
          suspensionStatus: availabilityRow?.suspensionStatus ?? 'NONE',
          source: 'opportunity_first_rotation_v1',
          sourceTier: availabilityRow?.sourceTier ?? 'TIER_2_HIGH_QUALITY',
          projectedAt: new Date(),
        },
      });
      projected.set(player.id, row);
      written++;
    }

    await this.applyInjuryReplacements(event.id, team.id, history, availabilityByPlayer, projected);
    return written;
  }

  private async applyInjuryReplacements(
    eventId: string,
    teamId: string,
    history: Map<string, PlayerHistory>,
    availability: Map<string, any>,
    rotations: Map<string, any>,
  ): Promise<void> {
    const absentIds = [...availability.values()]
      .filter((row) => row.expectedAvailabilityProb <= 0.25 || ['OUT', 'DOUBTFUL'].includes(String(row.officialStatus ?? '')))
      .map((row) => row.playerId)
      .filter((playerId) => rotations.has(playerId));
    if (!absentIds.length) return;

    const trackingRows = await this.prisma.playerOpportunityStat.findMany({
      where: { playerId: { in: [...rotations.keys()] } },
      orderBy: { gameDate: 'desc' },
      take: 250,
    });
    const latestTracking = new Map<string, any>();
    for (const row of trackingRows) if (!latestTracking.has(row.playerId)) latestTracking.set(row.playerId, row);

    for (const absentId of absentIds) {
      const absentHistory = history.get(absentId);
      const absentRotation = rotations.get(absentId);
      if (!absentHistory || !absentRotation) continue;

      const candidateFeatures: CandidateFeatures[] = [];
      for (const [playerId, rotation] of rotations.entries()) {
        if (playerId === absentId || absentIds.includes(playerId)) continue;
        const availabilityRow = availability.get(playerId);
        if (availabilityRow && availabilityRow.expectedAvailabilityProb < 0.5) continue;
        const playerHistory = history.get(playerId);
        if (!playerHistory) continue;
        const tracking = latestTracking.get(playerId);
        candidateFeatures.push({
          playerId,
          minuteCapacity: minuteCapacity(rotation.minutesMedian, rotation.starterStatus),
          usage: averageNormalizedUsage(playerHistory.usage),
          handling: tracking?.touches ?? mean(playerHistory.assists),
          rebounding: tracking?.reboundChances ?? mean(playerHistory.rebounds),
          shooting: mean(playerHistory.fga),
          threes: mean(playerHistory.fg3a),
          defense: mean(playerHistory.steals) + mean(playerHistory.blocks),
        });
      }
      if (!candidateFeatures.length) continue;

      const replacementCandidates = normalizeCandidateFeatures(candidateFeatures);
      const absentTracking = latestTracking.get(absentId);
      const allocations = redistributeInjuryRole(
        {
          minutes: absentRotation.minutesMedian,
          usagePossessions: absentRotation.minutesMedian * averageNormalizedUsage(absentHistory.usage),
          ballHandlingTouches: absentTracking?.touches ?? mean(absentHistory.assists),
          reboundChances: absentTracking?.reboundChances ?? mean(absentHistory.rebounds),
          shotAttempts: mean(absentHistory.fga),
          threePointAttempts: mean(absentHistory.fg3a),
          defensiveImpact: mean(absentHistory.steals) + mean(absentHistory.blocks),
        },
        replacementCandidates,
      );

      await this.prisma.injuryReplacementProjection.deleteMany({
        where: { eventId, absentPlayerId: absentId },
      });

      const quality = replacementQuality(absentTracking, replacementCandidates.length);
      for (const allocation of allocations) {
        await this.prisma.injuryReplacementProjection.create({
          data: {
            eventId,
            absentPlayerId: absentId,
            replacementPlayerId: allocation.playerId,
            minutesDelta: allocation.minutesDelta,
            usageDelta: allocation.usageDelta,
            ballHandlingDelta: allocation.ballHandlingDelta,
            reboundChanceDelta: allocation.reboundChanceDelta,
            fgaDelta: allocation.fgaDelta,
            threePointAttemptDelta: allocation.threePointAttemptDelta,
            defensiveImpact: allocation.defensiveImpact,
            confidence: allocation.confidence,
            dataQuality: quality,
            projectedAt: new Date(),
          },
        });

        const current = rotations.get(allocation.playerId);
        if (!current || allocation.minutesDelta <= 0) continue;
        const adjustedMedian = clamp(current.minutesMedian + allocation.minutesDelta, 0, 48);
        const adjustedFloor = clamp(current.minutesFloor + allocation.minutesDelta * 0.55, 0, adjustedMedian);
        const adjustedCeiling = clamp(current.minutesCeiling + allocation.minutesDelta, adjustedMedian, 48);
        const adjustedStdDev = current.minutesStdDev + (1 - allocation.confidence) * 1.5;
        const adjustedUncertainty = clamp(
          current.uncertaintyScore + (1 - allocation.confidence) * 0.15,
          0,
          1,
        );

        const updated = await this.prisma.rotationProjection.update({
          where: { eventId_playerId: { eventId, playerId: allocation.playerId } },
          data: {
            minutesFloor: adjustedFloor,
            minutesMedian: adjustedMedian,
            minutesCeiling: adjustedCeiling,
            minutesStdDev: adjustedStdDev,
            uncertaintyScore: adjustedUncertainty,
          },
        });
        rotations.set(allocation.playerId, updated);
      }
    }
  }

  private async representativeSpread(eventId: string): Promise<number | null> {
    const market = await this.prisma.market.findFirst({
      where: { eventId, marketType: 'SPREAD', isActive: true },
      include: { marketOdds: { where: { isOpen: true } } },
    });
    const lines = (market?.marketOdds ?? [])
      .map((row) => row.line)
      .filter((line): line is number => line !== null && Number.isFinite(line))
      .sort((a, b) => a - b);
    return lines.length ? percentile(lines, 0.5) : null;
  }
}

export function resolveStarterStatus(
  playerId: string,
  officialIds: Set<string>,
  expectedIds: Set<string>,
  lineupKnown: boolean,
): StarterStatus {
  if (officialIds.has(playerId)) return StarterStatus.CONFIRMED_STARTER;
  if (expectedIds.has(playerId)) return StarterStatus.EXPECTED_STARTER;
  return lineupKnown ? StarterStatus.BENCH : StarterStatus.UNKNOWN;
}

export function classifyRotationRole(history: PlayerHistory): PlayerRotationRole {
  const minutes = mean(history.minutes);
  const assists = mean(history.assists);
  const rebounds = mean(history.rebounds);
  const points = mean(history.points);
  const threes = mean(history.fg3a);
  const usage = averageNormalizedUsage(history.usage);
  const position = (history.position ?? '').toUpperCase();

  if (minutes < 11) return PlayerRotationRole.END_OF_BENCH;
  if (assists >= 6 || usage >= 0.28) return PlayerRotationRole.PRIMARY_CREATOR;
  if (assists >= 4) return PlayerRotationRole.SECONDARY_CREATOR;
  if (position.includes('C') && rebounds >= 7 && threes < 2.5) return PlayerRotationRole.RIM_BIG;
  if ((position.includes('C') || position.includes('F')) && threes >= 3) return PlayerRotationRole.STRETCH_BIG;
  if (points >= 15) return minutes < 26 ? PlayerRotationRole.BENCH_SCORER : PlayerRotationRole.SCORING_SPECIALIST;
  if (minutes < 22) return PlayerRotationRole.ROTATION_PLAYER;
  return PlayerRotationRole.CONNECTOR;
}

export function normalizeCandidateFeatures(features: CandidateFeatures[]): ReplacementCandidate[] {
  const maxOf = (selector: (row: CandidateFeatures) => number) =>
    Math.max(0, ...features.map((row) => Math.max(0, selector(row))));
  const normalize = (value: number, maximum: number) => maximum > 0 ? clamp(value / maximum, 0, 1) : 0;
  const maxima = {
    usage: maxOf((row) => row.usage),
    handling: maxOf((row) => row.handling),
    rebounding: maxOf((row) => row.rebounding),
    shooting: maxOf((row) => row.shooting),
    threes: maxOf((row) => row.threes),
    defense: maxOf((row) => row.defense),
  };

  return features.map((row) => ({
    playerId: row.playerId,
    minuteCapacity: row.minuteCapacity,
    usageAffinity: normalize(row.usage, maxima.usage),
    ballHandlingAffinity: normalize(row.handling, maxima.handling),
    reboundingAffinity: normalize(row.rebounding, maxima.rebounding),
    shootingAffinity: normalize(row.shooting, maxima.shooting),
    threePointAffinity: normalize(row.threes, maxima.threes),
    defensiveAffinity: normalize(row.defense, maxima.defense),
  }));
}

function buildHistory(players: any[], rows: any[]): Map<string, PlayerHistory> {
  const byPlayer = new Map<string, PlayerHistory>();
  for (const player of players) {
    byPlayer.set(player.id, {
      playerId: player.id,
      position: player.position,
      minutes: [], points: [], assists: [], rebounds: [], fga: [], fg3a: [], steals: [], blocks: [], usage: [],
    });
  }
  for (const row of rows) {
    const history = byPlayer.get(row.playerId);
    if (!history || history.minutes.length >= 20) continue;
    history.minutes.push(row.minutes ?? 0);
    history.points.push(row.points ?? 0);
    history.assists.push(row.assists ?? 0);
    history.rebounds.push(row.rebounds ?? 0);
    history.fga.push(row.fga ?? 0);
    history.fg3a.push(row.fg3a ?? 0);
    history.steals.push(row.steals ?? 0);
    history.blocks.push(row.blocks ?? 0);
    history.usage.push(row.usgPct ?? 0);
  }
  return byPlayer;
}

function estimateClosingProbability(
  minutesMedian: number,
  role: PlayerRotationRole,
  starterStatus: StarterStatus,
): number {
  let probability = clamp((minutesMedian - 18) / 22, 0.05, 0.85);
  if (starterStatus === StarterStatus.CONFIRMED_STARTER) probability += 0.08;
  if ([PlayerRotationRole.PRIMARY_CREATOR, PlayerRotationRole.SECONDARY_CREATOR].includes(role)) probability += 0.07;
  return clamp(probability, 0.02, 0.97);
}

function minuteCapacity(minutesMedian: number, starterStatus: StarterStatus): number {
  if (starterStatus === StarterStatus.BENCH || starterStatus === StarterStatus.UNKNOWN) {
    return clamp(34 - minutesMedian, 4, 18);
  }
  return clamp(42 - minutesMedian, 1, 7);
}

function averageNormalizedUsage(values: number[]): number {
  const normalized = values.map((value) => value > 1 ? value / 100 : value).filter(Number.isFinite);
  return clamp(mean(normalized), 0, 1);
}

function replacementQuality(absentTracking: any, candidateCount: number): DataQualityLevel {
  if (absentTracking && candidateCount >= 4) return DataQualityLevel.HIGH;
  if (candidateCount >= 3) return DataQualityLevel.MEDIUM;
  return DataQualityLevel.LOW;
}
