import { Injectable } from '@nestjs/common';
import { PropStatType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { PlayerPropProjectionAssembler } from './player-prop-projection.assembler';
import {
  evaluateBinaryDecision,
  evaluateDecision,
} from '../projection/decision.engine';
import {
  probabilityOver,
  probabilityUnder,
} from '../projection/opportunity-projection.engine';
import { AnalysisMode } from '../projection/projection.types';

@Injectable()
export class PlayerPropsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly projectionAssembler: PlayerPropProjectionAssembler,
  ) {}

  /** Map a PropStatType to the computed numeric value from a StatLine. */
  computeStatValue(statLine: any, statType: PropStatType): number {
    switch (statType) {
      case PropStatType.POINTS: return statLine.points;
      case PropStatType.REBOUNDS: return statLine.rebounds;
      case PropStatType.ASSISTS: return statLine.assists;
      case PropStatType.STEALS: return statLine.steals;
      case PropStatType.BLOCKS: return statLine.blocks;
      case PropStatType.THREES: return statLine.fg3m;
      case PropStatType.TURNOVERS: return statLine.turnovers;
      case PropStatType.STOCKS: return statLine.steals + statLine.blocks;
      case PropStatType.MINUTES: return statLine.minutes;
      case PropStatType.PRA: return statLine.points + statLine.rebounds + statLine.assists;
      case PropStatType.PR: return statLine.points + statLine.rebounds;
      case PropStatType.PA: return statLine.points + statLine.assists;
      case PropStatType.RA: return statLine.rebounds + statLine.assists;
      case PropStatType.DOUBLE_DOUBLE:
        return [statLine.points, statLine.rebounds, statLine.assists, statLine.steals, statLine.blocks]
          .filter((value) => value >= 10).length >= 2 ? 1 : 0;
      case PropStatType.TRIPLE_DOUBLE:
        return [statLine.points, statLine.rebounds, statLine.assists, statLine.steals, statLine.blocks]
          .filter((value) => value >= 10).length >= 3 ? 1 : 0;
      default: return 0;
    }
  }

  /** Historical hit rates remain context only; they are never the true-probability source. */
  async getHitRate(
    playerId: string,
    statType: PropStatType,
    line: number,
    lastN: number,
    direction: 'over' | 'under' = 'over',
  ): Promise<{ hits: number; total: number; rate: number }> {
    const statLines = await this.prisma.statLine.findMany({
      where: { playerId },
      orderBy: { gameDate: 'desc' },
      take: lastN,
    });
    if (statLines.length === 0) return { hits: 0, total: 0, rate: 0.5 };

    let hits = 0;
    for (const statLine of statLines) {
      const value = this.computeStatValue(statLine, statType);
      if (direction === 'over' ? value > line : value < line) hits++;
    }
    return { hits, total: statLines.length, rate: hits / statLines.length };
  }

  async getPlayerPropsFeed(filters: {
    statType?: PropStatType;
    overUnder?: 'over' | 'under' | 'both';
    gameId?: string;
    minOdds?: number;
    maxOdds?: number;
    minHitRate?: number;
    maxHitRate?: number;
    lastN?: number;
    sport?: string;
    limit?: number;
    mode?: AnalysisMode;
  } = {}) {
    const {
      statType,
      overUnder = 'both',
      gameId,
      minOdds = -1000,
      maxOdds = 1000,
      minHitRate = 0,
      maxHitRate = 100,
      lastN = 10,
      limit = 100,
      mode = 'STANDARD',
    } = filters;

    const markets = await this.prisma.market.findMany({
      where: {
        marketType: { in: ['PLAYER_PROP', 'PLAYER_PROP_ALTERNATE'] },
        isActive: true,
        ...(statType && { propStatType: statType }),
        ...(gameId && { eventId: gameId }),
        ...(filters.sport && { sport: { slug: filters.sport } }),
      },
      include: {
        player: { include: { team: true } },
        event: { include: { homeTeam: true, awayTeam: true, sport: true } },
        marketOdds: {
          where: { isOpen: true },
          include: {
            book: true,
            oddsHistory: { orderBy: { recordedAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results: any[] = [];

    for (const market of markets) {
      if (!market.player || !market.propStatType || market.marketOdds.length === 0) continue;

      const [assembly, availability] = await Promise.all([
        this.projectionAssembler.assemble({
          playerId: market.player.id,
          eventId: market.event.id,
          statType: market.propStatType,
          mode,
        }),
        this.prisma.playerAvailabilityProjection.findUnique({
          where: { eventId_playerId: { eventId: market.event.id, playerId: market.player.id } },
        }).catch(() => null),
      ]);
      if (!assembly) continue;

      const binaryMarket =
        market.propStatType === PropStatType.DOUBLE_DOUBLE ||
        market.propStatType === PropStatType.TRIPLE_DOUBLE;
      const representativeLine = binaryMarket
        ? 0.5
        : market.marketOdds.find((row) => row.line !== null)?.line ?? assembly.distribution.median;

      const [l5o, l10o, l15o, l20o, l5u, l10u, l15u, l20u] = await Promise.all([
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 5, 'over'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 10, 'over'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 15, 'over'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 20, 'over'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 5, 'under'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 10, 'under'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 15, 'under'),
        this.getHitRate(market.player.id, market.propStatType, representativeLine, 20, 'under'),
      ]);

      const hitRateMap: Record<number, number> = {
        5: l5o.rate,
        10: l10o.rate,
        15: l15o.rate,
        20: l20o.rate,
      };
      const primaryHitRate = (hitRateMap[lastN] ?? l10o.rate) * 100;
      if (primaryHitRate < minHitRate || primaryHitRate > maxHitRate) continue;

      const notExpectedToPlay = availability ? availability.expectedAvailabilityProb < 0.2 : false;
      const unresolvedAvailability = !availability || (
        availability.expectedAvailabilityProb >= 0.2 && availability.expectedAvailabilityProb < 0.8
      );
      const unresolvedLineup = !assembly.inputs.rotationAvailable;
      const unresolvedMinutesRestriction = assembly.qualityReasons.includes('MINUTES_RESTRICTION_UNRESOLVED');

      const outcomes = market.marketOdds
        .filter((row) => row.odds >= minOdds && row.odds <= maxOdds)
        .filter((row) => {
          const outcome = normalizeOutcome(row.outcome);
          if (binaryMarket) return outcome === 'yes' || outcome === 'no';
          if (overUnder === 'both') return outcome === 'over' || outcome === 'under';
          return outcome === overUnder;
        })
        .map((row) => {
          const outcome = normalizeOutcome(row.outcome);
          const line = row.line ?? representativeLine;
          let trueProb = 0.5;
          if (binaryMarket) {
            trueProb = outcome === 'yes' ? assembly.distribution.mean : 1 - assembly.distribution.mean;
          } else {
            trueProb = outcome === 'over'
              ? probabilityOver(assembly.distribution, line)
              : probabilityUnder(assembly.distribution, line);
          }
          const ev = this.analyticsService.calcEV(trueProb, row.odds);
          return {
            bookId: row.book.id,
            bookName: row.book.name,
            bookSlug: row.book.slug,
            outcome,
            odds: row.odds,
            line: row.line,
            probabilitySource: 'OPPORTUNITY_FIRST',
            modelProbability: trueProb,
            materiallyMoved: hasMateriallyMoved(row),
            ...ev,
          };
        });

      if (outcomes.length === 0) continue;

      const pairedDecisions: any[] = [];
      const groups = groupOddsByBookAndLine(market.marketOdds, binaryMarket);
      for (const group of groups) {
        const materiallyMoved = group.rows.some(hasMateriallyMoved);
        let decision: any = null;

        if (binaryMarket) {
          const yes = group.rows.find((row) => normalizeOutcome(row.outcome) === 'yes');
          const no = group.rows.find((row) => normalizeOutcome(row.outcome) === 'no');
          if (!yes || !no) continue;
          decision = evaluateBinaryDecision({
            probabilityYes: assembly.distribution.mean,
            yesOdds: yes.odds,
            noOdds: no.odds,
            dataQuality: assembly.dataQuality,
            unresolvedAvailability,
            unresolvedLineup,
            unresolvedMinutesRestriction,
            materiallyMoved,
          });
        } else {
          const over = group.rows.find((row) => normalizeOutcome(row.outcome) === 'over');
          const under = group.rows.find((row) => normalizeOutcome(row.outcome) === 'under');
          if (!over || !under || group.line === null) continue;
          decision = evaluateDecision({
            distribution: assembly.distribution,
            market: {
              line: group.line,
              overOdds: over.odds,
              underOdds: under.odds,
              sportsbook: over.book.name,
            },
            dataQuality: assembly.dataQuality,
            unresolvedAvailability,
            unresolvedLineup,
            unresolvedMinutesRestriction,
            materiallyMoved,
          });
        }

        if (notExpectedToPlay) {
          decision = {
            ...decision,
            decision: 'PASS',
            newsDecision: 'PASS',
            side: 'PASS',
            confidence: 'HIGH',
            primaryRisk: 'Player is currently projected below 20% availability; no pregame prop is actionable.',
          };
        }

        pairedDecisions.push({
          bookId: group.bookId,
          bookName: group.bookName,
          line: group.line,
          probabilitySource: 'OPPORTUNITY_FIRST',
          ...decision,
        });
      }

      const bestEV = outcomes.reduce((best, current) => current.evPct > best.evPct ? current : best);
      const bestDecision = pairedDecisions
        .filter((row) => row.decision === 'BET' || row.decision === 'STRONG_BET')
        .sort((a, b) => b.estimatedEv - a.estimatedEv)[0] ?? null;

      results.push({
        marketId: market.id,
        marketType: market.marketType,
        player: {
          id: market.player.id,
          name: market.player.name,
          position: market.player.position,
          team: market.player.team?.abbreviation,
          teamName: market.player.team?.name,
        },
        event: {
          id: market.event.id,
          home: market.event.homeTeam.abbreviation,
          away: market.event.awayTeam.abbreviation,
          startTime: market.event.startTime,
        },
        statType: market.propStatType,
        description: market.description,
        line: representativeLine,
        hitRate: {
          contextOnly: true,
          l5: Math.round(l5o.rate * 100),
          l10: Math.round(l10o.rate * 100),
          l15: Math.round(l15o.rate * 100),
          l20: Math.round(l20o.rate * 100),
          l5Under: Math.round(l5u.rate * 100),
          l10Under: Math.round(l10u.rate * 100),
          l15Under: Math.round(l15u.rate * 100),
          l20Under: Math.round(l20u.rate * 100),
        },
        projection: {
          mean: assembly.distribution.mean,
          median: assembly.distribution.median,
          stdDev: assembly.distribution.stdDev,
          percentiles: assembly.distribution.percentiles,
          uncertainty: assembly.distribution.uncertainty,
          pointEstimate: assembly.distribution.pointEstimate,
          equation: assembly.distribution.opportunityEquation,
          trials: assembly.distribution.trials,
          seed: assembly.distribution.seed,
        },
        dataQuality: {
          level: assembly.dataQuality,
          reasons: assembly.qualityReasons,
        },
        availability: availability ? {
          probability: availability.expectedAvailabilityProb,
          status: availability.officialStatus,
          starterStatus: availability.starterStatus,
          source: availability.source,
          sourceTier: availability.sourceTier,
          sourceUpdatedAt: availability.sourceUpdatedAt,
        } : null,
        projectionInputs: assembly.inputs,
        bestEV,
        bestDecision,
        decisions: pairedDecisions,
        outcomes,
      });
    }

    // Opportunity-First screening: actionable EV first, then data quality and model EV.
    results.sort((a, b) => {
      const aActionable = a.bestDecision ? 1 : 0;
      const bActionable = b.bestDecision ? 1 : 0;
      if (aActionable !== bActionable) return bActionable - aActionable;
      const qualityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
      const qualityDiff = qualityRank[b.dataQuality.level] - qualityRank[a.dataQuality.level];
      if (qualityDiff !== 0) return qualityDiff;
      return b.bestEV.evPct - a.bestEV.evPct;
    });

    return results.slice(0, limit);
  }

  async getCheatSheet(playerId: string, statType: PropStatType, line: number) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    });
    if (!player) return null;

    const statLines = await this.prisma.statLine.findMany({
      where: { playerId },
      orderBy: { gameDate: 'desc' },
      take: 20,
      include: {
        event: {
          include: {
            homeTeam: { select: { id: true, abbreviation: true } },
            awayTeam: { select: { id: true, abbreviation: true } },
          },
        },
      },
    });

    const defTiers = await this.computeDefenseTiersForStatType(statType);
    const trend = statLines.map((statLine, index) => {
      const statValue = this.computeStatValue(statLine, statType);
      const isHome = statLine.event.homeTeamId === player.teamId;
      const opponentTeam = isHome ? statLine.event.awayTeam : statLine.event.homeTeam;
      const opponentAbbr = opponentTeam?.abbreviation ?? '?';
      const opponentTeamId = isHome ? statLine.event.awayTeamId : statLine.event.homeTeamId;

      let isB2B = false;
      if (index < statLines.length - 1) {
        const diffMs = new Date(statLine.gameDate).getTime() - new Date(statLines[index + 1].gameDate).getTime();
        isB2B = diffMs / (1000 * 60 * 60 * 24) <= 1.5;
      }

      const gameDate = statLine.gameDate instanceof Date
        ? statLine.gameDate.toISOString().split('T')[0]
        : String(statLine.gameDate).split('T')[0];

      return {
        gameDate,
        matchup: `${isHome ? 'vs' : '@'} ${opponentAbbr}`,
        isHome,
        isB2B,
        statValue,
        hitOver: statValue > line,
        opponentTeamAbbr: opponentAbbr,
        defRankTier: defTiers[opponentTeamId ?? ''] ?? 'medium',
      };
    });

    const splitCalc = (games: typeof trend) => {
      const hits = games.filter((game) => game.hitOver).length;
      return {
        hits,
        total: games.length,
        rate: games.length > 0 ? Math.round((hits / games.length) * 100) : null,
      };
    };

    const splits = {
      home: splitCalc(trend.filter((game) => game.isHome)),
      away: splitCalc(trend.filter((game) => !game.isHome)),
      b2b: splitCalc(trend.filter((game) => game.isB2B)),
      rest: splitCalc(trend.filter((game) => !game.isB2B)),
      vsEasyDef: splitCalc(trend.filter((game) => game.defRankTier === 'easy')),
      vsMedDef: splitCalc(trend.filter((game) => game.defRankTier === 'medium')),
      vsHardDef: splitCalc(trend.filter((game) => game.defRankTier === 'hard')),
    };

    const seasonAvg = trend.length > 0
      ? Math.round((trend.reduce((sum, game) => sum + game.statValue, 0) / trend.length) * 10) / 10
      : 0;

    const injury = await this.prisma.injuryReport
      .findFirst({ where: { playerId }, orderBy: { reportedAt: 'desc' } })
      .catch(() => null);
    const news = await this.prisma.newsItem
      .findMany({ where: { playerId }, orderBy: { publishedAt: 'desc' }, take: 3 })
      .catch(() => []);

    return {
      player: {
        id: player.id,
        name: player.name,
        position: player.position ?? '',
        team: player.team?.abbreviation ?? '',
        teamName: player.team?.name ?? '',
      },
      injury,
      news,
      trend,
      splits,
      seasonAvg,
      line,
      statType,
    };
  }

  private async computeDefenseTiersForStatType(
    statType: PropStatType,
  ): Promise<Record<string, 'easy' | 'medium' | 'hard'>> {
    const allTeams = await this.prisma.team.findMany({
      where: { sport: { slug: 'nba' }, isActive: true },
      select: { id: true },
    });

    const teamAvgs: Array<{ teamId: string; avg: number }> = [];
    for (const team of allTeams) {
      const oppStats = await this.prisma.statLine.findMany({
        where: {
          event: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
          player: { teamId: { not: team.id } },
        },
        select: {
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          turnovers: true,
          fg3m: true,
          minutes: true,
        },
        take: 200,
      });
      if (oppStats.length === 0) continue;
      const avg = oppStats.reduce((sum, statLine) => sum + this.computeStatValue(statLine, statType), 0) / oppStats.length;
      teamAvgs.push({ teamId: team.id, avg });
    }

    teamAvgs.sort((a, b) => a.avg - b.avg);
    const count = teamAvgs.length;
    const result: Record<string, 'easy' | 'medium' | 'hard'> = {};
    teamAvgs.forEach(({ teamId }, index) => {
      if (index < Math.floor(count / 3)) result[teamId] = 'hard';
      else if (index < Math.floor((2 * count) / 3)) result[teamId] = 'medium';
      else result[teamId] = 'easy';
    });
    return result;
  }

  async getPlayersWithProps() {
    return this.prisma.player.findMany({
      where: {
        propMarkets: {
          some: {
            isActive: true,
            marketType: { in: ['PLAYER_PROP', 'PLAYER_PROP_ALTERNATE'] },
          },
        },
      },
      include: { team: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAnalyzerData(marketId: string) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        player: { include: { team: true } },
        event: { include: { homeTeam: true, awayTeam: true } },
        marketOdds: { where: { isOpen: true }, take: 1 },
      },
    });
    if (!market?.player || !market.propStatType) return null;

    const statType = market.propStatType;
    const line = market.marketOdds[0]?.line ?? (
      statType === PropStatType.DOUBLE_DOUBLE || statType === PropStatType.TRIPLE_DOUBLE ? 0.5 : 0
    );
    const playerId = market.player.id;
    const playerTeamId = market.player.teamId;
    const event = market.event;
    const opponentTeamId = event.homeTeamId === playerTeamId ? event.awayTeamId : event.homeTeamId;

    const latestSeason = await this.prisma.statLine.findFirst({
      where: { playerId },
      orderBy: { gameDate: 'desc' },
      select: { season: true },
    });
    const seasonStats = latestSeason
      ? await this.prisma.statLine.findMany({
          where: { playerId, season: latestSeason.season },
          orderBy: { gameDate: 'desc' },
        })
      : [];

    const seasonHits = seasonStats.filter((statLine) => this.computeStatValue(statLine, statType) > line).length;
    const seasonHitRate = seasonStats.length > 0
      ? Math.round((seasonHits / seasonStats.length) * 100)
      : null;

    const h2hEvents = await this.prisma.event.findMany({
      where: { OR: [{ homeTeamId: opponentTeamId }, { awayTeamId: opponentTeamId }] },
      select: { id: true },
    });
    const h2hStats = await this.prisma.statLine.findMany({
      where: { playerId, eventId: { in: h2hEvents.map((item) => item.id) } },
      orderBy: { gameDate: 'desc' },
    });
    const h2hHits = h2hStats.filter((statLine) => this.computeStatValue(statLine, statType) > line).length;
    const h2hHitRate = h2hStats.length > 0
      ? Math.round((h2hHits / h2hStats.length) * 100)
      : null;

    const allTeams = await this.prisma.team.findMany({
      where: { sport: { slug: 'nba' }, isActive: true },
      select: { id: true },
    });
    const defAvgs: Record<string, number> = {};
    for (const team of allTeams) {
      const oppStats = await this.prisma.statLine.findMany({
        where: {
          event: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
          player: { teamId: { not: team.id } },
        },
        select: {
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          turnovers: true,
          fg3m: true,
          minutes: true,
        },
      });
      defAvgs[team.id] = oppStats.length === 0
        ? 0
        : oppStats.reduce((sum, statLine) => sum + this.computeStatValue(statLine, statType), 0) / oppStats.length;
    }

    const sorted = Object.entries(defAvgs).sort((a, b) => b[1] - a[1]);
    const easiestIndex = sorted.findIndex(([id]) => id === opponentTeamId);
    const defRank = easiestIndex >= 0 ? sorted.length - easiestIndex : Math.ceil(sorted.length / 2);
    const opponentAvg = defAvgs[opponentTeamId] ?? 0;
    const leagueAvg = sorted.length > 0
      ? sorted.reduce((sum, [, value]) => sum + value, 0) / sorted.length
      : 0;

    const projection = await this.projectionAssembler.assemble({
      playerId,
      eventId: event.id,
      statType,
      mode: 'DEEP',
    });

    return {
      defRank,
      defRankTotal: sorted.length,
      defAvgAllowed: Math.round(opponentAvg * 10) / 10,
      leagueAvg: Math.round(leagueAvg * 10) / 10,
      seasonHitRate,
      seasonGames: seasonStats.length,
      h2hHitRate,
      h2hGames: h2hStats.length,
      projection: projection ? {
        mean: projection.distribution.mean,
        median: projection.distribution.median,
        percentiles: projection.distribution.percentiles,
        uncertainty: projection.distribution.uncertainty,
        dataQuality: projection.dataQuality,
        qualityReasons: projection.qualityReasons,
        inputs: projection.inputs,
        probabilitySource: 'OPPORTUNITY_FIRST',
      } : null,
    };
  }
}

function normalizeOutcome(value: string): string {
  return value.trim().toLowerCase();
}

function hasMateriallyMoved(row: any): boolean {
  const previous = row.oddsHistory?.[0];
  if (!previous) return false;
  const lineMove = previous.line !== null && row.line !== null
    ? Math.abs(row.line - previous.line)
    : 0;
  const currentImplied = americanImplied(row.odds);
  const priorImplied = americanImplied(previous.odds);
  return lineMove >= 1 || Math.abs(currentImplied - priorImplied) >= 0.03;
}

function americanImplied(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function groupOddsByBookAndLine(rows: any[], binary: boolean) {
  const groups = new Map<string, { bookId: string; bookName: string; line: number | null; rows: any[] }>();
  for (const row of rows) {
    const line = binary ? null : row.line ?? null;
    const key = `${row.book.id}:${line ?? 'binary'}`;
    const existing = groups.get(key) ?? {
      bookId: row.book.id,
      bookName: row.book.name,
      line,
      rows: [],
    };
    existing.rows.push(row);
    groups.set(key, existing);
  }
  return [...groups.values()];
}
