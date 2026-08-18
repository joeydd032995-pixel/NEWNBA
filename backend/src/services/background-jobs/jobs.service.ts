import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVService } from '../../modules/ev/ev.service';
import { ArbitrageService } from '../../modules/arbitrage/arbitrage.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { OddsApiService } from '../odds-api/odds-api.service';
import { NbaDataService } from '../nba-data/nba-data.service';
import { BallDontLieService } from '../balldontlie/balldontlie.service';
import { MarketType, SubscriptionStatus } from '@prisma/client';
import { DataIngestionService } from '../../modules/data-ingestion/data-ingestion.service';
import { InjuryIngestService } from '../../modules/data-ingestion/injury-ingest.service';
import { NewsIngestService } from '../../modules/data-ingestion/news-ingest.service';
import { PublicBettingService } from '../../modules/data-ingestion/public-betting.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

const MARKET_KEY_MAP: Record<string, MarketType> = {
  h2h: MarketType.MONEYLINE,
  spreads: MarketType.SPREAD,
  totals: MarketType.TOTAL,
};

const PROP_STAT_TYPE_MAP: Record<string, string> = {
  player_points: 'POINTS',
  player_rebounds: 'REBOUNDS',
  player_assists: 'ASSISTS',
  player_threes: 'THREES',
  player_blocks: 'BLOCKS',
  player_steals: 'STEALS',
};

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private isEVScanRunning = false;
  private isArbScanRunning = false;
  private isOddsSyncRunning = false;
  private isNbaSyncRunning = false;
  private isBdlSyncRunning = false;
  private isSnapshotRunning = false;
  private isInjuryRunning = false;
  private isNewsRunning = false;
  private isPublicBettingRunning = false;
  private isAlertEvalRunning = false;

  constructor(
    private evService: EVService,
    private arbitrageService: ArbitrageService,
    private prisma: PrismaService,
    private oddsApi: OddsApiService,
    private nbaData: NbaDataService,
    private bdl: BallDontLieService,
    private dataIngestion: DataIngestionService,
    private injuryIngest: InjuryIngestService,
    private newsIngest: NewsIngestService,
    private publicBetting: PublicBettingService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.logger.log('Background jobs service initialized');
    if (this.oddsApi.isEnabled) {
      this.logger.log('Odds API is enabled — live odds sync active');
    } else {
      this.logger.warn('ODDS_API_KEY not set — odds sync disabled; no synthetic market data will be written');
    }
    if (this.nbaData.isEnabled) {
      this.logger.log('NBA Data sidecar enabled — daily stat sync active');
    } else {
      this.logger.warn('NBA_DATA_URL not set — NBA stat sync disabled');
    }
    if (this.bdl.isEnabled) {
      this.logger.log('BallDontLie API enabled — daily player stat sync active');
    } else {
      this.logger.warn('BALLDONTLIE_API_KEY not set — BallDontLie sync disabled');
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
   * Every 30 minutes: sync verified live NBA odds from The Odds API.
   *
   * Integrity invariant: if the configured market source is unavailable, this
   * job writes nothing. Synthetic odds must never enter market, snapshot, EV or
   * CLV tables, including in development environments.
   */
  @Cron('*/30 * * * *')
  async syncOdds() {
    if (this.isOddsSyncRunning) return;
    this.isOddsSyncRunning = true;
    try {
      if (!this.oddsApi.isEnabled) {
        this.logger.warn('Odds sync skipped: ODDS_API_KEY not configured; refusing to create synthetic market data');
        return;
      }
      await this.fetchAndPersistLiveOdds();
    } catch (e) {
      const status = e?.response?.status;
      this.logger.error(`Odds sync failed [${status ?? 'no HTTP status'}]: ${e.message}`);
      if (status === 401) {
        this.logger.warn('Odds sync authentication failed — check ODDS_API_KEY');
      }
    } finally {
      this.isOddsSyncRunning = false;
    }
  }

  /** Daily at 07:00 UTC: sync real game logs from stats.nba.com. */
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

  async triggerOddsSync(): Promise<string> {
    if (!this.oddsApi.isEnabled) return 'ODDS_API_KEY not configured; no synthetic odds will be generated';
    if (this.isOddsSyncRunning) return 'Odds sync already running';
    void this.syncOdds();
    return 'Odds sync triggered';
  }

  async triggerNbaSync(): Promise<string> {
    if (!this.nbaData.isEnabled) return 'NBA_DATA_URL not configured';
    if (this.isNbaSyncRunning) return 'NBA stat sync already running';
    void this.syncNbaStats();
    return 'NBA stat sync triggered';
  }

  async triggerBdlSync(): Promise<string> {
    if (!this.bdl.isEnabled) return 'BALLDONTLIE_API_KEY not configured';
    if (this.isBdlSyncRunning) return 'BDL sync already running';
    void this.syncBallDontLieStats();
    return 'BallDontLie stat sync triggered';
  }

  private async fetchAndPersistLiveOdds() {
    const events = await this.oddsApi.getOdds('basketball_nba', 'h2h,spreads,totals');
    if (!events.length) return;

    const currentSeason = await this.nbaData.getCurrentSeason().catch(() => undefined);
    const books = await this.prisma.book.findMany({ where: { isActive: true } });
    const bookBySlug = new Map<string, any>(books.map((book) => [book.slug, book]));
    const dbEvents = await this.prisma.event.findMany({
      where: { status: { in: ['SCHEDULED', 'LIVE'] } },
      include: { homeTeam: true, awayTeam: true },
    });

    const nbaSport = await this.prisma.sport.findFirst({ where: { slug: 'nba' } });
    const allTeams = nbaSport
      ? await this.prisma.team.findMany({ where: { sportId: nbaSport.id, isActive: true } })
      : [];

    const findTeam = (apiName: string) =>
      allTeams.find(
        (team) =>
          team.name.toLowerCase() === apiName.toLowerCase() ||
          team.name.toLowerCase().includes(apiName.toLowerCase()) ||
          apiName.toLowerCase().includes(team.name.toLowerCase()) ||
          apiName.toLowerCase().includes(team.city?.toLowerCase() ?? '____'),
      );

    let updated = 0;
    for (const apiEvent of events) {
      let dbEvent = dbEvents.find(
        (event) =>
          (event.homeTeam.name.toLowerCase().includes(apiEvent.home_team.toLowerCase()) ||
            apiEvent.home_team.toLowerCase().includes(event.homeTeam.name.toLowerCase())) &&
          (event.awayTeam.name.toLowerCase().includes(apiEvent.away_team.toLowerCase()) ||
            apiEvent.away_team.toLowerCase().includes(event.awayTeam.name.toLowerCase())),
      );

      if (!dbEvent && nbaSport) {
        const homeTeam = findTeam(apiEvent.home_team);
        const awayTeam = findTeam(apiEvent.away_team);
        if (homeTeam && awayTeam) {
          try {
            const created = await this.prisma.event.create({
              data: {
                sportId: nbaSport.id,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                startTime: new Date(apiEvent.commence_time),
                status: 'SCHEDULED',
                season: currentSeason,
              },
              include: { homeTeam: true, awayTeam: true },
            });
            dbEvents.push(created);
            dbEvent = created;
            this.logger.log(`Created new event: ${apiEvent.away_team} @ ${apiEvent.home_team}`);
          } catch (e) {
            this.logger.warn(`Could not create event for ${apiEvent.away_team} @ ${apiEvent.home_team}: ${e.message}`);
          }
        } else {
          this.logger.warn(`Team not found in DB — home: "${apiEvent.home_team}", away: "${apiEvent.away_team}"`);
        }
      }
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
              if (existing.odds !== outcome.price || existing.line !== (outcome.point ?? null)) {
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
    await this.syncPlayerPropsOdds(events, bookBySlug, dbEvents);
  }

  private static readonly PROP_MARKETS =
    'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals';

  private async syncPlayerPropsOdds(
    events: Awaited<ReturnType<typeof this.oddsApi.getOdds>>,
    bookBySlug: Map<string, any>,
    dbEvents: any[],
  ) {
    let propUpdated = 0;

    for (const apiEvent of events) {
      const dbEvent = dbEvents.find(
        (event) =>
          (event.homeTeam.name.toLowerCase().includes(apiEvent.home_team.toLowerCase()) ||
            apiEvent.home_team.toLowerCase().includes(event.homeTeam.name.toLowerCase())) &&
          (event.awayTeam.name.toLowerCase().includes(apiEvent.away_team.toLowerCase()) ||
            apiEvent.away_team.toLowerCase().includes(event.awayTeam.name.toLowerCase())),
      );
      if (!dbEvent) continue;

      let eventWithProps: Awaited<ReturnType<typeof this.oddsApi.getEventOdds>>;
      try {
        eventWithProps = await this.oddsApi.getEventOdds(
          'basketball_nba',
          apiEvent.id,
          JobsService.PROP_MARKETS,
        );
      } catch (e) {
        this.logger.warn('Rate limited during player props sync — aborting remaining events');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!eventWithProps) continue;

      for (const bookmaker of eventWithProps.bookmakers) {
        const book = bookBySlug.get(bookmaker.key);
        if (!book) continue;

        for (const market of bookmaker.markets) {
          const propStatType = PROP_STAT_TYPE_MAP[market.key];
          if (!propStatType) continue;

          for (const outcome of market.outcomes) {
            const playerName = (outcome as any).description as string | undefined;
            if (!playerName) continue;

            const player = await this.prisma.player.findFirst({
              where: {
                name: { equals: playerName, mode: 'insensitive' },
                isActive: true,
              },
            });
            if (!player) continue;

            let dbMarket = await this.prisma.market.findFirst({
              where: {
                eventId: dbEvent.id,
                marketType: 'PLAYER_PROP',
                playerId: player.id,
                propStatType: propStatType as any,
              },
            });
            if (!dbMarket) {
              dbMarket = await this.prisma.market.create({
                data: {
                  eventId: dbEvent.id,
                  sportId: dbEvent.sportId,
                  marketType: 'PLAYER_PROP',
                  playerId: player.id,
                  propStatType: propStatType as any,
                  description: `${playerName} ${propStatType}`,
                },
              });
            }

            const rawDirection = String(outcome.name ?? '').toLowerCase();
            if (rawDirection !== 'over' && rawDirection !== 'under') continue;
            const direction = rawDirection;
            const line = outcome.point ?? null;

            const existing = await this.prisma.marketOdds.findFirst({
              where: { marketId: dbMarket.id, bookId: book.id, outcome: direction },
            });

            if (existing) {
              if (existing.odds !== outcome.price || existing.line !== line) {
                await this.prisma.oddsHistory.create({
                  data: { marketOddsId: existing.id, odds: existing.odds, line: existing.line },
                });
                await this.prisma.marketOdds.update({
                  where: { id: existing.id },
                  data: { odds: outcome.price, line },
                });
                propUpdated++;
              }
            } else {
              await this.prisma.marketOdds.create({
                data: {
                  marketId: dbMarket.id,
                  bookId: book.id,
                  outcome: direction,
                  odds: outcome.price,
                  line,
                },
              });
              propUpdated++;
            }
          }
        }
      }
    }

    if (propUpdated > 0) this.logger.log(`Player props sync: ${propUpdated} prop odds updated`);
  }

  @Cron('0 8 * * *')
  async syncBallDontLieStats() {
    if (!this.bdl.isEnabled || this.isBdlSyncRunning) return;
    this.isBdlSyncRunning = true;
    try {
      this.logger.log('BallDontLie stat sync starting…');
      await this.discoverBdlPlayerIds();
      await this.syncBdlStats();
    } catch (e) {
      this.logger.error('BallDontLie stat sync failed:', e.message);
    } finally {
      this.isBdlSyncRunning = false;
    }
  }

  private async discoverBdlPlayerIds() {
    const unmatched = await this.prisma.player.findMany({
      where: { isActive: true, bdlId: null },
      select: { id: true, name: true },
    });
    if (unmatched.length === 0) {
      this.logger.debug('BDL discovery: all players already matched');
      return;
    }

    let matched = 0;
    for (const player of unmatched) {
      try {
        const results = await this.bdl.searchPlayers(player.name);
        const match = results.find(
          (result) => `${result.first_name} ${result.last_name}`.toLowerCase() === player.name.toLowerCase(),
        );
        if (match) {
          await this.prisma.player.update({
            where: { id: player.id },
            data: { bdlId: match.id },
          }).catch(() => null);
          matched++;
        }
      } catch (e) {
        this.logger.warn(`BDL discovery failed for ${player.name}: ${e.message}`);
      }
    }
    this.logger.log(`BDL discovery: ${matched}/${unmatched.length} players matched`);
  }

  private async syncBdlStats() {
    const players = await this.prisma.player.findMany({
      where: { isActive: true, bdlId: { not: null } },
      select: { id: true, bdlId: true },
    });
    if (players.length === 0) {
      this.logger.debug('BDL sync: no matched players yet');
      return;
    }

    const bdlToDb = new Map<number, string>();
    for (const player of players) bdlToDb.set(player.bdlId!, player.id);

    const seasonLabel = await this.nbaData.getCurrentSeason();
    const currentSeason = Number(seasonLabel.slice(0, 4));
    if (!Number.isInteger(currentSeason)) throw new Error(`Invalid NBA season label: ${seasonLabel}`);

    const BATCH = 100;
    const bdlIds = players.map((player) => player.bdlId!);
    let inserted = 0;

    for (let i = 0; i < bdlIds.length; i += BATCH) {
      const batch = bdlIds.slice(i, i + BATCH);
      let stats: Awaited<ReturnType<BallDontLieService['getAllPlayerStatsForSeason']>>;
      try {
        stats = await this.bdl.getAllPlayerStatsForSeason(batch, currentSeason);
      } catch (e) {
        this.logger.warn(`BDL stat fetch failed for batch ${i}: ${e.message}`);
        continue;
      }

      const anchorEvent = await this.prisma.event.findFirst({
        where: { status: 'FINAL' },
        orderBy: { startTime: 'desc' },
      });
      if (!anchorEvent) {
        this.logger.warn('BDL sync: no FINAL events found');
        break;
      }

      for (const stat of stats) {
        const dbPlayerId = bdlToDb.get(stat.player.id);
        if (!dbPlayerId) continue;
        const gameDate = new Date(stat.game.date);
        const existing = await this.prisma.statLine.findFirst({ where: { playerId: dbPlayerId, gameDate } });
        if (existing) continue;

        const parseMin = (value: string): number => {
          if (!value || !value.includes(':')) return parseFloat(value) || 0;
          const [minutes, seconds] = value.split(':').map(Number);
          return minutes + seconds / 60;
        };

        const minutes = parseMin(stat.min);
        const points = stat.pts ?? 0;
        const fga = stat.fga ?? 0;
        const fta = stat.fta ?? 0;
        const fgm = stat.fgm ?? 0;
        const fg3m = stat.fg3m ?? 0;
        const tsPct = (fga + fta) > 0 ? points / (2 * (fga + 0.475 * fta)) : 0;
        const efgPct = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0;

        await this.prisma.statLine.create({
          data: {
            playerId: dbPlayerId,
            eventId: anchorEvent.id,
            season: seasonLabel,
            gameDate,
            points,
            rebounds: stat.reb ?? 0,
            assists: stat.ast ?? 0,
            steals: stat.stl ?? 0,
            blocks: stat.blk ?? 0,
            turnovers: stat.turnover ?? 0,
            minutes,
            fgm,
            fga,
            fgPct: stat.fg_pct ?? 0,
            fg3m,
            fg3a: stat.fg3a ?? 0,
            fg3Pct: stat.fg3_pct ?? 0,
            ftm: stat.ftm ?? 0,
            fta,
            ftPct: stat.ft_pct ?? 0,
            plusMinus: 0,
            usgPct: 0,
            tsPct: Math.round(tsPct * 10000) / 10000,
            efgPct: Math.round(efgPct * 10000) / 10000,
            bpm: 0,
          },
        }).catch(() => null);
        inserted++;
      }
    }
    this.logger.log(`BDL sync complete: ${inserted} new stat lines inserted`);
  }

  private async syncPlayerGameLogs() {
    const currentSeason = await this.nbaData.getCurrentSeason();
    const nbaPlayers = await this.nbaData.getActivePlayers(currentSeason);
    this.logger.log(`NBA sync: ${nbaPlayers.length} active players retrieved for ${currentSeason}`);

    const dbPlayers = await this.prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const nameMap = new Map<string, string>();
    for (const player of dbPlayers) nameMap.set(player.name.toLowerCase(), player.id);

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
      if (!dbPlayerId) {
        skipped++;
        continue;
      }

      let logs;
      try {
        logs = await this.nbaData.getPlayerGameLogs(nbaPlayer.nba_id, currentSeason, 5);
      } catch (e) {
        this.logger.warn(`Failed to fetch logs for ${nbaPlayer.name}: ${e.message}`);
        continue;
      }

      for (const log of logs) {
        const gameDate = new Date(log.game_date);
        const existing = await this.prisma.statLine.findFirst({ where: { playerId: dbPlayerId, gameDate } });
        if (existing) continue;

        await this.prisma.statLine.create({
          data: {
            playerId: dbPlayerId,
            eventId: syncEvent.id,
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
        }).catch(() => null);
        synced++;
      }
    }

    this.logger.log(`NBA stat sync complete: ${synced} new stat lines synced, ${skipped} players not in DB`);
  }

  @Cron('*/15 * * * *')
  async snapshotOddsJob() {
    if (this.isSnapshotRunning) return;
    this.isSnapshotRunning = true;
    try {
      const count = await this.dataIngestion.snapshotOdds();
      if (count > 0) this.logger.debug(`Odds snapshot: ${count} entries recorded`);
    } catch (e) {
      this.logger.error('Odds snapshot job failed:', e.message);
    } finally {
      this.isSnapshotRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectLineMovementsJob() {
    try {
      const moves = await this.dataIngestion.detectLineMovements(3);
      if (moves.length > 0) {
        this.logger.log(`Line movement alert: ${moves.length} significant move(s) detected`);
      }
    } catch (e) {
      this.logger.error('Line movement detection failed:', e.message);
    }
  }

  /** Tier-3 fallback every 30 minutes until the official Phase-4 report adapter supersedes it. */
  @Cron('*/30 * * * *')
  async syncInjuriesJob() {
    if (this.isInjuryRunning) return;
    this.isInjuryRunning = true;
    try {
      const count = await this.injuryIngest.syncInjuries();
      if (count > 0) this.logger.log(`Injury sync: ${count} reports updated`);
    } catch (e) {
      this.logger.error('Injury sync job failed:', e.message);
    } finally {
      this.isInjuryRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncNewsJob() {
    if (this.isNewsRunning) return;
    this.isNewsRunning = true;
    try {
      const count = await this.newsIngest.syncNews();
      if (count > 0) this.logger.log(`News sync: ${count} new items`);
    } catch (e) {
      this.logger.error('News sync job failed:', e.message);
    } finally {
      this.isNewsRunning = false;
    }
  }

  @Cron('*/30 * * * *')
  async syncPublicBettingJob() {
    if (this.isPublicBettingRunning) return;
    this.isPublicBettingRunning = true;
    try {
      const count = await this.publicBetting.syncPublicBetting();
      this.logger.debug(`Public betting sync: ${count} verified splits updated`);
    } catch (e) {
      this.logger.error('Public betting sync failed:', e.message);
    } finally {
      this.isPublicBettingRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluateAlertsJob() {
    if (this.isAlertEvalRunning) return;
    this.isAlertEvalRunning = true;
    try {
      const fired = await this.notifications.evaluateAllAlerts();
      if (fired > 0) this.logger.log(`Alert evaluation: ${fired} notification(s) fired`);
    } catch (e) {
      this.logger.error('Alert evaluation job failed:', e.message);
    } finally {
      this.isAlertEvalRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireTrialsJob() {
    try {
      const result = await this.prisma.user.updateMany({
        where: { subscriptionStatus: SubscriptionStatus.TRIALING, trialEndsAt: { lt: new Date() } },
        data: { planType: 'FREE', subscriptionStatus: SubscriptionStatus.EXPIRED },
      });
      if (result.count > 0) {
        this.logger.log(`Trial expiry: downgraded ${result.count} user(s) to FREE`);
      }
    } catch (e) {
      this.logger.error('Trial expiry job failed:', e.message);
    }
  }
}
