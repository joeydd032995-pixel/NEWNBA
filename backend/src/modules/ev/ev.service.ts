import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * EVService - Expected Value calculation and analysis.
 *
 * Existing behavior is preserved for compatibility: when an independent model
 * probability is not supplied, the service can still use a cross-book no-vig
 * market baseline. The persisted modelUsed field makes that provenance explicit
 * so a market-derived baseline is never confused with an Opportunity-First model.
 */
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

    const byOutcome: Record<string, typeof marketOdds> = {};
    for (const marketOdd of marketOdds) {
      if (!byOutcome[marketOdd.outcome]) byOutcome[marketOdd.outcome] = [];
      byOutcome[marketOdd.outcome].push(marketOdd);
    }

    const outcomes = Object.keys(byOutcome);
    const bestOdds = outcomes.map((outcome) =>
      Math.max(...byOutcome[outcome].map((odd) => odd.odds)),
    );
    const noVigProbs = this.analyticsService.removeVig(bestOdds);
    const probabilitySource = trueProbs
      ? 'independent_model_override'
      : 'market_no_vig_baseline';

    const probMap: Record<string, number> = {};
    outcomes.forEach((outcome, index) => {
      probMap[outcome] = trueProbs?.[outcome] ?? noVigProbs[index];
    });

    const results: Array<
      {
        marketOddsId: string;
        bookName: string;
        outcome: string;
        odds: number;
        probabilitySource: string;
      } & ReturnType<AnalyticsService['calcEV']>
    > = [];

    for (const marketOdd of marketOdds) {
      const trueProb = probMap[marketOdd.outcome] ?? 0.5;
      const evResult = this.analyticsService.calcEV(trueProb, marketOdd.odds);

      if (!evResult.isPositiveEV) continue;

      results.push({
        marketOddsId: marketOdd.id,
        bookName: marketOdd.book.name,
        outcome: marketOdd.outcome,
        odds: marketOdd.odds,
        probabilitySource,
        ...evResult,
      });

      const market = await this.prisma.market.findUnique({ where: { id: marketId } });
      if (!market) continue;

      await this.prisma.eVMetrics.create({
        data: {
          marketId,
          eventId: market.eventId,
          outcome: marketOdd.outcome,
          bookOdds: marketOdd.odds,
          trueProb,
          impliedProb: evResult.impliedProb,
          ev: evResult.ev,
          evPct: evResult.evPct,
          kellyFraction: evResult.kellyFraction,
          modelUsed: probabilitySource,
        },
      }).catch((error) =>
        this.logger.error(`Failed to save EV metric for market ${marketId}: ${error.message}`),
      );
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
    if (cached?.length) return cached;

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const evMetrics = await this.prisma.eVMetrics.findMany({
      where: {
        calculatedAt: { gte: twoHoursAgo },
        evPct: { gte: filters.minEV ?? 0 },
        ...(filters.sport && {
          market: { sport: { slug: filters.sport } },
        }),
        ...(filters.marketType && {
          market: { marketType: filters.marketType as any },
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

    const enriched = await Promise.all(
      evMetrics.map(async (metric) => {
        const publicSplit = await this.prisma.publicBettingSplit
          .findFirst({
            where: {
              marketId: metric.marketId,
              outcome: metric.outcome,
              source: { not: 'simulated' },
            },
            orderBy: { snappedAt: 'desc' },
            select: { pctBets: true, pctMoney: true, source: true, snappedAt: true },
          })
          .catch(() => null);
        return { ...metric, publicSplit };
      }),
    );

    await this.cache.set(cacheKey, enriched, 30);
    return enriched;
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
      } catch (error) {
        this.logger.error(`Failed to calculate EV for market ${market.id}: ${error.message}`);
      }
    }

    await this.cache.reset().catch(() => null);
    return results;
  }
}
