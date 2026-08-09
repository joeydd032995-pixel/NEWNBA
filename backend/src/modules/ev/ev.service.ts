import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * EVService - Expected Value calculation and analysis
 *
 * Calculates positive expected value opportunities by comparing true probabilities
 * (derived from best-available odds across books) with book odds.
 * Identifies and persists positive-EV opportunities for user consumption.
 */
@Injectable()
export class EVService {
  private readonly logger = new Logger(EVService.name);

  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * Calculate EV for all outcomes in a single market
   *
   * Fetches odds across all books for each outcome, removes vig to determine
   * true probability, then calculates EV vs. each book's odds. Persists positive
   * EV opportunities to the EVMetrics table.
   *
   * @param marketId - Market ID to analyze
   * @param trueProbs - Optional override true probabilities by outcome. If not provided,
   *                    calculated by removing vig from best-available odds.
   * @returns Array of EV results with positive EV only, including book name, odds, EV, Kelly fraction
   * @throws Logs errors for database persistence failures but does not throw
   *
   * @example
   * const evs = await evService.calculateEVForMarket('market-123');
   * // Returns: [{
   * //   marketOddsId: 'mo-456',
   * //   bookName: 'DraftKings',
   * //   outcome: 'Home Team',
   * //   odds: -110,
   * //   ev: 5.25,
   * //   evPct: 0.0525,
   * //   trueProb: 0.515,
   * //   impliedProb: 0.476,
   * //   kellyFraction: 0.03
   * // }, ...]
   */
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

  /**
   * Get limited, filtered EV feed for user dashboard
   *
   * Returns recent positive EV opportunities with optional filtering by sport, minimum EV threshold,
   * and result limit (default 50). Results are cached for 30 seconds and enriched with public betting splits
   * (e.g., "62% of bettors on Home Team"). Cache is cleared on background scans to ensure
   * fresh data is returned after each odds update cycle.
   *
   * @param filters - Optional filter object:
   *   - sport?: string - Filter by sport slug (e.g., 'nba', 'nfl')
   *   - minEV?: number - Minimum EV % threshold (e.g., 0.05 for 5%)
   *   - marketType?: string - Currently documented for future use; filtering not yet implemented
   *   - limit?: number - Maximum results to return (default: 50)
   *
   * @returns Array of EVMetric objects enriched with market/event details and public betting splits
   * @throws No exceptions thrown; Prisma and cache errors are handled internally and logged
   *
   * @example
   * const feed = await evService.getEVFeed({
   *   sport: 'nba',
   *   minEV: 0.03,
   *   limit: 25
   * });
   * // Returns [{
   * //   id: 'ev-789',
   * //   marketId: 'market-123',
   * //   outcome: 'Home Team',
   * //   bookOdds: -110,
   * //   ev: 8.50,
   * //   evPct: 0.085,
   * //   trueProb: 0.525,
   * //   calculatedAt: Date,
   * //   market: { event: { homeTeam, awayTeam, startTime }, ... },
   * //   publicSplit: { pctBets: 0.62, pctMoney: 0.68 }
   * // }, ...]
   */
  async getEVFeed(filters: {
    sport?: string;
    minEV?: number;
    marketType?: string;
    limit?: number;
  } = {}) {
    const cacheKey = `ev:feed:${JSON.stringify(filters)}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    // Only use cache if it has items — an empty cache result is stale since the
    // background scan may have just populated the DB
    if (cached?.length) return cached;

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const evMetrics = await this.prisma.eVMetrics.findMany({
      where: {
        calculatedAt: { gte: twoHoursAgo },
        evPct: { gte: filters.minEV ?? 0 },
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

    // Enrich each metric with latest public betting split for that market/outcome
    const enriched = await Promise.all(
      evMetrics.map(async (m) => {
        const publicSplit = await this.prisma.publicBettingSplit
          .findFirst({
            where: { marketId: m.marketId, outcome: m.outcome },
            orderBy: { snappedAt: 'desc' },
            select: { pctBets: true, pctMoney: true },
          })
          .catch(() => null);
        return { ...m, publicSplit };
      }),
    );

    await this.cache.set(cacheKey, enriched, 30); // 30s TTL
    return enriched;
  }

  /**
   * Scan all active markets for EV opportunities (background job)
   *
   * Invoked by the scheduled background job (every 1 minute) to recalculate EV across
   * all active sports betting markets. Clears cache on completion so next feed request
   * returns fresh results.
   *
   * Errors during individual market scans are logged but do not halt the full scan.
   *
   * @returns Array of all positive EV opportunities found across all markets
   * @throws No exceptions; all errors logged to console
   *
   * @example
   * // Called from jobs.service.ts every minute
   * const allEVs = await evService.scanAllMarkets();
   * console.log(`Found ${allEVs.length} positive EV opportunities`);
   */
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

    // WARNING: Clears ALL caches (EV feed, odds, models, leaderboard, etc.), not just EV feed.
    // This may impact other feeds' performance. Consider implementing selective cache invalidation.
    await this.cache.reset().catch(() => null);
    return results;
  }
}
