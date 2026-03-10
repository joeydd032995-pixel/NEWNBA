import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

export interface ArbitrageLeg {
  bookId: string;
  bookName: string;
  outcome: string;
  odds: number;
  impliedProb: number;
  stake: number;
}

export interface ArbitrageResult {
  marketId: string;
  legs: ArbitrageLeg[];
  totalStake: number;
  profitPct: number;
  profit: number;
  impliedProbSum: number;
}

@Injectable()
export class ArbitrageService {
  private readonly logger = new Logger(ArbitrageService.name);

  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /**
   * Calculate arbitrage for a set of odds across books
   * Returns arbitrage opportunity if profit > 0
   */
  findArbitrage(
    outcomes: Array<{ bookId: string; bookName: string; outcome: string; odds: number }>,
    totalStake: number = 100,
  ): ArbitrageResult | null {
    // Group by outcome, find best odds per outcome
    const byOutcome: Record<string, { bookId: string; bookName: string; odds: number }> = {};
    for (const o of outcomes) {
      if (!byOutcome[o.outcome] || o.odds > byOutcome[o.outcome].odds) {
        byOutcome[o.outcome] = { bookId: o.bookId, bookName: o.bookName, odds: o.odds };
      }
    }

    const outcomeKeys = Object.keys(byOutcome);
    if (outcomeKeys.length < 2) return null;

    // Calculate implied probabilities
    const impliedProbs = outcomeKeys.map(k => this.analyticsService.americanToImplied(byOutcome[k].odds));
    const impliedSum = impliedProbs.reduce((a, b) => a + b, 0);

    // Arbitrage exists when sum of implied probabilities < 1
    if (impliedSum >= 1) return null;

    // Calculate optimal stakes
    const profitPct = (1 / impliedSum - 1);
    const legs: ArbitrageLeg[] = outcomeKeys.map((outcome, i) => {
      const book = byOutcome[outcome];
      const stake = totalStake * (impliedProbs[i] / impliedSum);
      return {
        bookId: book.bookId,
        bookName: book.bookName,
        outcome,
        odds: book.odds,
        impliedProb: impliedProbs[i],
        stake: Math.round(stake * 100) / 100,
      };
    });

    const profit = totalStake * profitPct;

    return {
      marketId: '',
      legs,
      totalStake,
      profitPct,
      profit: Math.round(profit * 100) / 100,
      impliedProbSum: impliedSum,
    };
  }

  async scanMarketArbitrage(marketId: string): Promise<ArbitrageResult | null> {
    const marketOdds = await this.prisma.marketOdds.findMany({
      where: { marketId, isOpen: true },
      include: { book: true },
    });

    const outcomes = marketOdds.map(mo => ({
      bookId: mo.bookId,
      bookName: mo.book.name,
      outcome: mo.outcome,
      odds: mo.odds,
    }));

    const arb = this.findArbitrage(outcomes);
    if (!arb) return null;

    arb.marketId = marketId;

    // Get eventId
    const market = await this.prisma.market.findUnique({ where: { id: marketId } });
    if (!market) {
      this.logger.warn(`Market ${marketId} not found; skipping arbitrage opportunity save`);
      return arb;
    }

    // Save to DB
    await this.prisma.arbitrageOpportunity.create({
      data: {
        marketId,
        eventId: market.eventId,
        legs: arb.legs as any,
        profit: arb.profit,
        profitPct: arb.profitPct,
        totalStake: arb.totalStake,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      },
    });

    return arb;
  }

  async scanAllArbitrage() {
    const markets = await this.prisma.market.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const opportunities: ArbitrageResult[] = [];
    for (const market of markets) {
      try {
        const arb = await this.scanMarketArbitrage(market.id);
        if (arb) opportunities.push(arb);
      } catch (e) {
        this.logger.error(`Failed to scan market ${market.id} for arbitrage: ${e.message}`);
      }
    }

    // Invalidate all arb feed cache variants so next request reflects fresh data
    await this.cache.reset().catch(() => null);
    return opportunities;
  }

  async getArbitrageFeed(filters: {
    sport?: string;
    minProfit?: number;
    limit?: number;
  } = {}) {
    const cacheKey = `arb:feed:${JSON.stringify(filters)}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const results = await this.prisma.arbitrageOpportunity.findMany({
      where: {
        isActive: true,
        profitPct: { gte: (filters.minProfit ?? 0) / 100 },
        expiresAt: { gte: new Date() },
      },
      include: {
        event: { include: { homeTeam: true, awayTeam: true, sport: true } },
        market: true,
      },
      orderBy: { profitPct: 'desc' },
      take: filters.limit ?? 50,
    });

    await this.cache.set(cacheKey, results, 30); // 30s TTL
    return results;
  }
}
