import { Injectable } from '@nestjs/common';
import { PropStatType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class PlayerPropsService {
  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  /** Map a PropStatType to the computed numeric value from a StatLine */
  computeStatValue(statLine: any, statType: PropStatType): number {
    switch (statType) {
      case PropStatType.POINTS:   return statLine.points;
      case PropStatType.REBOUNDS: return statLine.rebounds;
      case PropStatType.ASSISTS:  return statLine.assists;
      case PropStatType.STEALS:   return statLine.steals;
      case PropStatType.BLOCKS:   return statLine.blocks;
      case PropStatType.THREES:   return statLine.fg3m;
      case PropStatType.MINUTES:  return statLine.minutes;
      case PropStatType.PRA:      return statLine.points + statLine.rebounds + statLine.assists;
      case PropStatType.PR:       return statLine.points + statLine.rebounds;
      case PropStatType.PA:       return statLine.points + statLine.assists;
      case PropStatType.RA:       return statLine.rebounds + statLine.assists;
      default:                    return 0;
    }
  }

  /** Calculate hit rate for a player prop line over last N games */
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
    for (const sl of statLines) {
      const val = this.computeStatValue(sl, statType);
      if (direction === 'over' ? val > line : val < line) hits++;
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
    } = filters;

    const markets = await this.prisma.market.findMany({
      where: {
        marketType: 'PLAYER_PROP',
        isActive: true,
        ...(statType && { propStatType: statType }),
        ...(gameId && { eventId: gameId }),
        ...(filters.sport && { sport: { slug: filters.sport } }),
      },
      include: {
        player: {
          include: { team: true },
        },
        event: {
          include: { homeTeam: true, awayTeam: true, sport: true },
        },
        marketOdds: {
          where: { isOpen: true },
          include: { book: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results: any[] = [];

    for (const market of markets) {
      if (!market.player || !market.propStatType) continue;

      // Get odds for both outcomes across books
      const overOdds  = market.marketOdds.filter(o => o.outcome === 'over');
      const underOdds = market.marketOdds.filter(o => o.outcome === 'under');

      // Determine the line
      const line = market.marketOdds[0]?.line ?? 0;

      // Compute hit rates for L5, L10, L15, L20 for both over and under
      const [l5o, l10o, l15o, l20o, l5u, l10u, l15u, l20u] = await Promise.all([
        this.getHitRate(market.player.id, market.propStatType, line, 5,  'over'),
        this.getHitRate(market.player.id, market.propStatType, line, 10, 'over'),
        this.getHitRate(market.player.id, market.propStatType, line, 15, 'over'),
        this.getHitRate(market.player.id, market.propStatType, line, 20, 'over'),
        this.getHitRate(market.player.id, market.propStatType, line, 5,  'under'),
        this.getHitRate(market.player.id, market.propStatType, line, 10, 'under'),
        this.getHitRate(market.player.id, market.propStatType, line, 15, 'under'),
        this.getHitRate(market.player.id, market.propStatType, line, 20, 'under'),
      ]);
      // Aliases for clarity
      const l5 = l5o; const l10 = l10o; const l15 = l15o; const l20 = l20o;

      // Primary hit rate for filtering (based on lastN, using over rate as primary signal)
      const hitRateMap: Record<number, number> = { 5: l10o.rate, 10: l10o.rate, 15: l15o.rate, 20: l20o.rate };
      const primaryHitRate = (hitRateMap[lastN] ?? l10o.rate) * 100;

      if (primaryHitRate < minHitRate || primaryHitRate > maxHitRate) continue;

      // Build per-book odds rows filtered by direction and odds range
      const outcomes: any[] = [];

      const addOutcome = (oddsRows: typeof overOdds, direction: 'over' | 'under') => {
        const dirHitRate = direction === 'over' ? l10o.rate : l10u.rate;
        for (const mo of oddsRows) {
          if (mo.odds < minOdds || mo.odds > maxOdds) continue;
          const evResult = this.analyticsService.calcEV(dirHitRate, mo.odds);
          outcomes.push({
            bookName: mo.book.name,
            bookSlug: mo.book.slug,
            outcome: direction,
            odds: mo.odds,
            line: mo.line,
            ...evResult,
          });
        }
      };

      if (overUnder === 'over' || overUnder === 'both')  addOutcome(overOdds,  'over');
      if (overUnder === 'under' || overUnder === 'both') addOutcome(underOdds, 'under');

      if (outcomes.length === 0) continue;

      // Best EV outcome
      const bestEV = outcomes.reduce((a, b) => (a.evPct > b.evPct ? a : b));

      results.push({
        marketId: market.id,
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
        line,
        hitRate: {
          l5:  Math.round(l5o.rate  * 100),
          l10: Math.round(l10o.rate * 100),
          l15: Math.round(l15o.rate * 100),
          l20: Math.round(l20o.rate * 100),
          l5Under:  Math.round(l5u.rate  * 100),
          l10Under: Math.round(l10u.rate * 100),
          l15Under: Math.round(l15u.rate * 100),
          l20Under: Math.round(l20u.rate * 100),
        },
        bestEV,
        outcomes,
      });
    }

    // Sort by best EV descending
    results.sort((a, b) => b.bestEV.evPct - a.bestEV.evPct);
    return results.slice(0, limit);
  }

  // ─── Phase 2: Player Cheat Sheet ─────────────────────────────────────────

  async getCheatSheet(playerId: string, statType: PropStatType, line: number) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    });
    if (!player) return null;

    // Last 20 stat lines with event team info
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

    // Build per-game trend; statLines[0] = most recent, statLines[i+1] = earlier
    const trend = statLines.map((sl, i) => {
      const statValue = this.computeStatValue(sl, statType);
      const isHome = sl.event.homeTeamId === player.teamId;
      const opponentTeam = isHome ? sl.event.awayTeam : sl.event.homeTeam;
      const opponentAbbr = opponentTeam?.abbreviation ?? '?';
      const opponentTeamId = isHome ? sl.event.awayTeamId : sl.event.homeTeamId;

      // B2B: this game's date minus the previous (earlier) game's date <= 1.5 days
      let isB2B = false;
      if (i < statLines.length - 1) {
        const diffMs =
          new Date(sl.gameDate).getTime() -
          new Date(statLines[i + 1].gameDate).getTime();
        isB2B = diffMs / (1000 * 60 * 60 * 24) <= 1.5;
      }

      const gameDate =
        sl.gameDate instanceof Date
          ? sl.gameDate.toISOString().split('T')[0]
          : String(sl.gameDate).split('T')[0];

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
      const hits = games.filter((g) => g.hitOver).length;
      return {
        hits,
        total: games.length,
        rate: games.length > 0 ? Math.round((hits / games.length) * 100) : null,
      };
    };

    const splits = {
      home:      splitCalc(trend.filter((g) => g.isHome)),
      away:      splitCalc(trend.filter((g) => !g.isHome)),
      b2b:       splitCalc(trend.filter((g) => g.isB2B)),
      rest:      splitCalc(trend.filter((g) => !g.isB2B)),
      vsEasyDef: splitCalc(trend.filter((g) => g.defRankTier === 'easy')),
      vsMedDef:  splitCalc(trend.filter((g) => g.defRankTier === 'medium')),
      vsHardDef: splitCalc(trend.filter((g) => g.defRankTier === 'hard')),
    };

    const seasonAvg =
      trend.length > 0
        ? Math.round(
            (trend.reduce((s, g) => s + g.statValue, 0) / trend.length) * 10,
          ) / 10
        : 0;

    // Latest injury report
    const injury = await this.prisma.injuryReport
      .findFirst({ where: { playerId }, orderBy: { reportedAt: 'desc' } })
      .catch(() => null);

    // Recent news
    const news = await this.prisma.newsItem
      .findMany({
        where: { playerId },
        orderBy: { publishedAt: 'desc' },
        take: 3,
      })
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
          fg3m: true,
          minutes: true,
        },
        take: 200,
      });
      if (oppStats.length === 0) continue;
      const avg =
        oppStats.reduce((s, sl) => s + this.computeStatValue(sl, statType), 0) /
        oppStats.length;
      teamAvgs.push({ teamId: team.id, avg });
    }

    // Ascending: lowest avg = hardest defense
    teamAvgs.sort((a, b) => a.avg - b.avg);
    const n = teamAvgs.length;
    const result: Record<string, 'easy' | 'medium' | 'hard'> = {};
    teamAvgs.forEach(({ teamId }, i) => {
      if (i < Math.floor(n / 3)) result[teamId] = 'hard';
      else if (i < Math.floor((2 * n) / 3)) result[teamId] = 'medium';
      else result[teamId] = 'easy';
    });
    return result;
  }

  async getPlayersWithProps() {
    return this.prisma.player.findMany({
      where: {
        propMarkets: { some: { isActive: true } },
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
    const line = market.marketOdds[0]?.line ?? 0;
    const playerId = market.player.id;
    const playerTeamId = market.player.teamId;
    const event = market.event;
    const opponentTeamId =
      event.homeTeamId === playerTeamId ? event.awayTeamId : event.homeTeamId;

    // Season hit rate
    const currentYear = new Date().getFullYear();
    const seasonStats = await this.prisma.statLine.findMany({
      where: {
        playerId,
        OR: [
          { season: currentYear.toString() },
          { season: `${currentYear - 1}-${currentYear.toString().slice(2)}` },
        ],
      },
      orderBy: { gameDate: 'desc' },
    });
    let seasonHits = 0;
    for (const sl of seasonStats) {
      if (this.computeStatValue(sl, statType) > line) seasonHits++;
    }
    const seasonHitRate =
      seasonStats.length > 0
        ? Math.round((seasonHits / seasonStats.length) * 100)
        : null;

    // H2H hit rate — player's games vs. this opponent
    const h2hEvents = await this.prisma.event.findMany({
      where: {
        OR: [{ homeTeamId: opponentTeamId }, { awayTeamId: opponentTeamId }],
      },
      select: { id: true },
    });
    const h2hEventIds = h2hEvents.map((e) => e.id);
    const h2hStats = await this.prisma.statLine.findMany({
      where: { playerId, eventId: { in: h2hEventIds } },
      orderBy: { gameDate: 'desc' },
    });
    let h2hHits = 0;
    for (const sl of h2hStats) {
      if (this.computeStatValue(sl, statType) > line) h2hHits++;
    }
    const h2hHitRate =
      h2hStats.length > 0
        ? Math.round((h2hHits / h2hStats.length) * 100)
        : null;

    // Opponent defensive ranking for this stat type
    // For each team: average stat value allowed from opposing players
    const allTeams = await this.prisma.team.findMany({
      where: { sport: { slug: 'nba' }, isActive: true },
      select: { id: true },
    });

    const defAvgs: Record<string, number> = {};
    for (const team of allTeams) {
      const oppStats = await this.prisma.statLine.findMany({
        where: {
          event: {
            OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
          },
          player: { teamId: { not: team.id } },
        },
        select: {
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          fg3m: true,
          minutes: true,
        },
      });
      if (oppStats.length === 0) {
        defAvgs[team.id] = 0;
        continue;
      }
      const total = oppStats.reduce(
        (s, sl) => s + this.computeStatValue(sl, statType),
        0,
      );
      defAvgs[team.id] = total / oppStats.length;
    }

    // Sort descending: index 0 = most allowed (easiest/worst defense), last = fewest (hardest/best defense)
    const sorted = Object.entries(defAvgs).sort((a, b) => b[1] - a[1]);
    // easiestIdx 0 → rank 30 for player (green), hardestIdx last → rank 1 (red)
    const easiestIndex = sorted.findIndex(([id]) => id === opponentTeamId);
    // rank 30 = easiest (index 0), rank 1 = hardest (index last)
    const defRank =
      easiestIndex >= 0 ? sorted.length - easiestIndex : Math.ceil(sorted.length / 2);
    const opponentAvg = defAvgs[opponentTeamId] ?? 0;
    const leagueAvg =
      sorted.length > 0
        ? sorted.reduce((s, [, v]) => s + v, 0) / sorted.length
        : 0;

    return {
      defRank,
      defRankTotal: sorted.length,
      defAvgAllowed: Math.round(opponentAvg * 10) / 10,
      leagueAvg: Math.round(leagueAvg * 10) / 10,
      seasonHitRate,
      seasonGames: seasonStats.length,
      h2hHitRate,
      h2hGames: h2hStats.length,
    };
  }
}
