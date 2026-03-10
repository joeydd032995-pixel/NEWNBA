import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class EVService {
  private readonly logger = new Logger(EVService.name);

  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async calculateEVForMarket(marketId: string, trueProbs?: Record<string, number>) {
    const marketOdds = await this.prisma.marketOdds.findMany({
      where: { marketId, isOpen: true },
      include: { book: true },
    });

    if (marketOdds.length === 0) return [];

    // Group by outcome
    const byOutcome: Record<string, typeof marketOdds> = {};
    for (const mo of marketOdds) {
      if (!byOutcome[mo.outcome]) byOutcome[mo.outcome] = [];
      byOutcome[mo.outcome].push(mo);
    }

    // Calculate true probabilities by removing vig (use best-line no-vig)
    const outcomes = Object.keys(byOutcome);
    const bestOdds = outcomes.map(outcome => {
      const odds = byOutcome[outcome];
      return Math.max(...odds.map(o => o.odds));
    });

    const noVigProbs = this.analyticsService.removeVig(bestOdds);
    const probMap: Record<string, number> = {};
    outcomes.forEach((outcome, i) => {
      probMap[outcome] = trueProbs?.[outcome] ?? noVigProbs[i];
    });

    // Calculate EV for each book/outcome combo
    const results: Array<{ marketOddsId: string; bookName: string; outcome: string; odds: number } & ReturnType<AnalyticsService['calcEV']>> = [];
    for (const mo of marketOdds) {
      const trueProb = probMap[mo.outcome] ?? 0.5;
      const evResult = this.analyticsService.calcEV(trueProb, mo.odds);

      if (evResult.isPositiveEV) {
        results.push({
          marketOddsId: mo.id,
          bookName: mo.book.name,
          outcome: mo.outcome,
          odds: mo.odds,
          ...evResult,
        });

        // Save to DB
        const market = await this.prisma.market.findUnique({ where: { id: marketId } });
        if (market) {
          await this.prisma.eVMetrics.create({
            data: {
              marketId,
              eventId: market.eventId,
              outcome: mo.outcome,
              bookOdds: mo.odds,
              trueProb,
              impliedProb: evResult.impliedProb,
              ev: evResult.ev,
              evPct: evResult.evPct,
              kellyFraction: evResult.kellyFraction,
            },
          }).catch((e) => this.logger.error(`Failed to save EV metric for market ${marketId}: ${e.message}`));
        }
      }
    }

    return results;
  }

  async getEVFeed(filters: {
    sport?: string;
    minEV?: number;
    marketType?: string;
    limit?: number;
  } = {}) {
    const cacheKey = `ev:feed:${JSON.stringify(filters)}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const evMetrics = await this.prisma.eVMetrics.findMany({
      where: {
        createdAt: { gte: twoHoursAgo },
        ev: { gte: filters.minEV ?? 0 },
        ...(filters.sport && {
          market: { sport: { slug: filters.sport } },
        }),
      },
      include: {
        market: {
          include: {
            event: {
              include: { homeTeam: true, awayTeam: true, sport: true },
            },
            sport: true,
          },
        },
      },
      orderBy: { evPct: 'desc' },
      take: filters.limit ?? 50,
    });

    await this.cache.set(cacheKey, evMetrics, 30); // 30s TTL
    return evMetrics;
  }

  async scanAllMarkets() {
    const markets = await this.prisma.market.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const results: Awaited<ReturnType<typeof this.calculateEVForMarket>> = [];
    for (const market of markets) {
      try {
        const evs = await this.calculateEVForMarket(market.id);
        results.push(...evs);
      } catch (e) {
        this.logger.error(`Failed to calculate EV for market ${market.id}: ${e.message}`);
      }
    }

    // Invalidate all EV feed cache variants so next request reflects fresh data
    await this.cache.reset().catch(() => null);
    return results;
  }
}
