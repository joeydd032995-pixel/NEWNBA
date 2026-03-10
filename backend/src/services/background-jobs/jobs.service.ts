import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVService } from '../../modules/ev/ev.service';
import { ArbitrageService } from '../../modules/arbitrage/arbitrage.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { OddsApiService } from '../odds-api/odds-api.service';
import { NbaDataService } from '../nba-data/nba-data.service';
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
  private isNbaSyncRunning = false;

  constructor(
    private evService: EVService,
    private arbitrageService: ArbitrageService,
    private prisma: PrismaService,
    private oddsApi: OddsApiService,
    private nbaData: NbaDataService,
  ) {}

  onModuleInit() {
    this.logger.log('Background jobs service initialized');
    if (this.oddsApi.isEnabled) {
      this.logger.log('Odds API is enabled — live odds sync active');
    } else {
      this.logger.warn('ODDS_API_KEY not set — odds sync disabled, using simulation fallback');
    }
    if (this.nbaData.isEnabled) {
      this.logger.log('NBA Data sidecar enabled — daily stat sync active');
    } else {
      this.logger.warn('NBA_DATA_URL not set — NBA stat sync disabled');
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

  /**
   * Daily at 07:00 UTC (03:00 ET): sync real game logs from stats.nba.com
   * into the StatLine table via the nba-data sidecar.
   * Only runs when NBA_DATA_URL is configured.
   */
  @Cron('0 7 * * *')
  async syncNbaStats() {
    if (!this.nbaData.isEnabled || this.isNbaSyncRunning) return;
    this.isNbaSyncRunning = true;
    try {
      this.logger.log('NBA stat sync starting…');
      await this.syncPlayerGameLogs();
    } catch (e) {
      this.logger.error('NBA stat sync failed:', e.message);
    } finally {
      this.isNbaSyncRunning = false;
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

  /**
   * Fetch game logs from the nba-data sidecar and upsert into StatLine.
   * Matches players by name (case-insensitive) against our DB.
   * Skips players not in our DB (won't create unknowns).
   */
  private async syncPlayerGameLogs() {
    // 1. Get active players from sidecar
    const nbaPlayers = await this.nbaData.getActivePlayers();
    this.logger.log(`NBA sync: ${nbaPlayers.length} active players retrieved`);

    // 2. Load all DB players for name matching
    const dbPlayers = await this.prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const nameMap = new Map<string, string>(); // lowercased name → db player id
    for (const p of dbPlayers) {
      nameMap.set(p.name.toLowerCase(), p.id);
    }

    // 3. Load a recent dummy event to attach orphaned stat lines to
    // (StatLine requires eventId; we create a "sync" event if none exists)
    const syncEvent = await this.prisma.event.findFirst({
      where: { status: 'FINAL' },
      orderBy: { startTime: 'desc' },
    });
    if (!syncEvent) {
      this.logger.warn('No FINAL events found — cannot attach stat lines');
      return;
    }

    let synced = 0;
    let skipped = 0;

    for (const nbaPlayer of nbaPlayers) {
      const dbPlayerId = nameMap.get(nbaPlayer.name.toLowerCase());
      if (!dbPlayerId) { skipped++; continue; }

      let logs;
      try {
        logs = await this.nbaData.getPlayerGameLogs(nbaPlayer.nba_id, '2024-25', 5);
      } catch (e) {
        this.logger.warn(`Failed to fetch logs for ${nbaPlayer.name}: ${e.message}`);
        continue;
      }

      for (const log of logs) {
        const gameDate = new Date(log.game_date);
        // Try to find an existing StatLine for this player on this date
        const existing = await this.prisma.statLine.findFirst({
          where: { playerId: dbPlayerId, gameDate },
        });
        if (existing) continue; // already have this game

        await this.prisma.statLine.create({
          data: {
            playerId: dbPlayerId,
            eventId: syncEvent.id, // best available event anchor
            season: log.season,
            gameDate,
            points: log.points,
            rebounds: log.rebounds,
            assists: log.assists,
            steals: log.steals,
            blocks: log.blocks,
            turnovers: log.turnovers,
            minutes: log.minutes,
            fgm: log.fgm,
            fga: log.fga,
            fgPct: log.fg_pct,
            fg3m: log.fg3m,
            fg3a: log.fg3a,
            fg3Pct: log.fg3_pct,
            ftm: log.ftm,
            fta: log.fta,
            ftPct: log.ft_pct,
            plusMinus: log.plus_minus,
            usgPct: log.usg_pct,
            tsPct: log.ts_pct,
            efgPct: log.efg_pct,
            bpm: log.bpm,
          },
        }).catch(() => null); // ignore unique constraint violations
        synced++;
      }
    }

    this.logger.log(`NBA stat sync complete: ${synced} new stat lines synced, ${skipped} players not in DB`);
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
