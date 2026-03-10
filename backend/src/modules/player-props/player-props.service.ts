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
  private computeStatValue(statLine: any, statType: PropStatType): number {
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

  async getPlayersWithProps() {
    return this.prisma.player.findMany({
      where: {
        propMarkets: { some: { isActive: true } },
      },
      include: { team: true },
      orderBy: { name: 'asc' },
    });
  }
}
