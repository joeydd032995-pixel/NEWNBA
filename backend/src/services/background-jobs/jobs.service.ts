import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVService } from '../../modules/ev/ev.service';
import { ArbitrageService } from '../../modules/arbitrage/arbitrage.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { OddsApiService } from '../odds-api/odds-api.service';
import { MarketType } from '@prisma/client';

// Map Odds API market key → our MarketType enum
const MARKET_KEY_MAP: Record<string, MarketType> = {
  h2h: MarketType.MONEYLINE,
  spreads: MarketType.SPREAD,
  totals: MarketType.TOTAL,
  player_props: MarketType.PLAYER_PROP,
};

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private isEVScanRunning = false;
  private isArbScanRunning = false;
  private isOddsSyncRunning = false;

  constructor(
    private evService: EVService,
    private arbitrageService: ArbitrageService,
    private prisma: PrismaService,
    private oddsApi: OddsApiService,
  ) {}

  onModuleInit() {
    this.logger.log('Background jobs service initialized');
    if (this.oddsApi.isEnabled) {
      this.logger.log('Odds API is enabled — live odds sync active');
    } else {
      this.logger.warn('ODDS_API_KEY not set — odds sync disabled, using simulation fallback');
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runEVCalculation() {
    if (this.isEVScanRunning) return;
    this.isEVScanRunning = true;
    try {
      this.logger.debug('Running EV calculation job...');
      const results = await this.evService.scanAllMarkets();
      this.logger.debug(`EV scan complete: ${results.length} positive EV opportunities found`);
    } catch (e) {
      this.logger.error('EV calculation job failed:', e.message);
    } finally {
      this.isEVScanRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runArbitrageScan() {
    if (this.isArbScanRunning) return;
    this.isArbScanRunning = true;
    try {
      this.logger.debug('Running arbitrage scan job...');
      const opps = await this.arbitrageService.scanAllArbitrage();
      this.logger.debug(`Arb scan complete: ${opps.length} arbitrage opportunities found`);
    } catch (e) {
      this.logger.error('Arbitrage scan job failed:', e.message);
    } finally {
      this.isArbScanRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredOpportunities() {
    try {
      const deleted = await this.prisma.arbitrageOpportunity.updateMany({
        where: { expiresAt: { lt: new Date() }, isActive: true },
        data: { isActive: false },
      });
      if (deleted.count > 0) {
        this.logger.debug(`Marked ${deleted.count} expired arbitrage opportunities as inactive`);
      }
    } catch (e) {
      this.logger.error('Cleanup job failed:', e.message);
    }
  }

  /**
   * Every 5 minutes: sync live NBA odds from the Odds API when a key is available.
   * Falls back to simulated odds movement in dev when no key is configured.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncOdds() {
    if (this.isOddsSyncRunning) return;
    this.isOddsSyncRunning = true;
    try {
      if (this.oddsApi.isEnabled) {
        await this.fetchAndPersistLiveOdds();
      } else {
        await this.simulateOddsMovement();
      }
    } catch (e) {
      this.logger.error('Odds sync failed:', e.message);
    } finally {
      this.isOddsSyncRunning = false;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async fetchAndPersistLiveOdds() {
    const events = await this.oddsApi.getOdds('basketball_nba');
    if (!events.length) return;

    // Resolve our DB books by slug
    const books = await this.prisma.book.findMany({ where: { isActive: true } });
    const bookBySlug = new Map(books.map((b) => [b.slug, b]));

    // Resolve our DB events by external API id (stored in the name field as fallback)
    // We match on commence_time + teams
    const dbEvents = await this.prisma.event.findMany({
      where: { status: { in: ['SCHEDULED', 'LIVE'] } },
      include: { homeTeam: true, awayTeam: true },
    });

    let updated = 0;

    for (const apiEvent of events) {
      const dbEvent = dbEvents.find(
        (e) =>
          e.homeTeam.name.toLowerCase().includes(apiEvent.home_team.toLowerCase()) ||
          e.awayTeam.name.toLowerCase().includes(apiEvent.away_team.toLowerCase()),
      );
      if (!dbEvent) continue;

      for (const bookmaker of apiEvent.bookmakers) {
        const book = bookBySlug.get(bookmaker.key);
        if (!book) continue;

        for (const market of bookmaker.markets) {
          const marketType = MARKET_KEY_MAP[market.key];
          if (!marketType) continue;

          let dbMarket = await this.prisma.market.findFirst({
            where: { eventId: dbEvent.id, marketType },
          });
          if (!dbMarket) {
            dbMarket = await this.prisma.market.create({
              data: { eventId: dbEvent.id, sportId: dbEvent.sportId, marketType },
            });
          }

          for (const outcome of market.outcomes) {
            const existing = await this.prisma.marketOdds.findFirst({
              where: { marketId: dbMarket.id, bookId: book.id, outcome: outcome.name },
            });

            if (existing) {
              if (existing.odds !== outcome.price) {
                await this.prisma.oddsHistory.create({
                  data: { marketOddsId: existing.id, odds: existing.odds, line: existing.line },
                });
                await this.prisma.marketOdds.update({
                  where: { id: existing.id },
                  data: { odds: outcome.price, line: outcome.point ?? null },
                });
                updated++;
              }
            } else {
              await this.prisma.marketOdds.create({
                data: {
                  marketId: dbMarket.id,
                  bookId: book.id,
                  outcome: outcome.name,
                  odds: outcome.price,
                  line: outcome.point ?? null,
                },
              });
              updated++;
            }
          }
        }
      }
    }

    this.logger.log(`Live odds sync: ${updated} odds updated from ${events.length} API events`);
  }

  private async simulateOddsMovement() {
    const marketOdds = await this.prisma.marketOdds.findMany({
      where: { isOpen: true },
      take: 100,
    });

    let moved = 0;
    for (const mo of marketOdds) {
      const movement = (Math.random() - 0.5) * 4; // ±2 points
      const newOdds = Math.round(mo.odds + movement);
      if (newOdds !== mo.odds) {
        await this.prisma.oddsHistory.create({
          data: { marketOddsId: mo.id, odds: mo.odds, line: mo.line },
        });
        await this.prisma.marketOdds.update({ where: { id: mo.id }, data: { odds: newOdds } });
        moved++;
      }
    }
    if (moved > 0) this.logger.debug(`Simulated odds movement: ${moved} odds updated`);
  }
}
