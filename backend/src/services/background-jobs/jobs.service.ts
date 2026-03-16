import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVService } from '../../modules/ev/ev.service';
import { ArbitrageService } from '../../modules/arbitrage/arbitrage.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { OddsApiService } from '../odds-api/odds-api.service';
import { NbaDataService } from '../nba-data/nba-data.service';
import { BallDontLieService } from '../balldontlie/balldontlie.service';
import { MarketType } from '@prisma/client';
import { DataIngestionService } from '../../modules/data-ingestion/data-ingestion.service';
import { InjuryIngestService } from '../../modules/data-ingestion/injury-ingest.service';
import { NewsIngestService } from '../../modules/data-ingestion/news-ingest.service';
import { PublicBettingService } from '../../modules/data-ingestion/public-betting.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

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
      this.logger.warn('ODDS_API_KEY not set — odds sync disabled, using simulation fallback');
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
      const status = e?.response?.status;
      this.logger.error(`Odds sync failed [${status ?? 'no HTTP status'}]: ${e.message}`);
      if (status === 401) {
        this.logger.warn('Odds sync disabled until restart — check ODDS_API_KEY env var');
      }
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

  // ─── Manual triggers (for admin endpoints) ────────────────────

  async triggerOddsSync(): Promise<string> {
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

  // ─── Private helpers ──────────────────────────────────────────

  private async fetchAndPersistLiveOdds() {
    // Fetch h2h, spreads, and totals for all events
    const events = await this.oddsApi.getOdds('basketball_nba', 'h2h,spreads,totals');
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

    // Look up NBA sport and all teams for auto-creating events
    const nbaSlug = 'nba';
    const nbaSport = await this.prisma.sport.findFirst({ where: { slug: nbaSlug } });
    const allTeams = nbaSport
      ? await this.prisma.team.findMany({ where: { sportId: nbaSport.id, isActive: true } })
      : [];

    const findTeam = (apiName: string) =>
      allTeams.find(
        (t) =>
          t.name.toLowerCase() === apiName.toLowerCase() ||
          t.name.toLowerCase().includes(apiName.toLowerCase()) ||
          apiName.toLowerCase().includes(t.name.toLowerCase()) ||
          apiName.toLowerCase().includes(t.city?.toLowerCase() ?? '____'),
      );

    let updated = 0;

    for (const apiEvent of events) {
      let dbEvent = dbEvents.find(
        (e) =>
          e.homeTeam.name.toLowerCase().includes(apiEvent.home_team.toLowerCase()) ||
          apiEvent.home_team.toLowerCase().includes(e.homeTeam.name.toLowerCase()) ||
          e.awayTeam.name.toLowerCase().includes(apiEvent.away_team.toLowerCase()) ||
          apiEvent.away_team.toLowerCase().includes(e.awayTeam.name.toLowerCase()),
      );

      // If no matching DB event, create one from Odds API data
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
                season: String(new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0)),
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

    // Sync player props per event (requires separate per-event API call)
    await this.syncPlayerPropsOdds(events, bookBySlug, dbEvents);
  }

  // Valid player-prop market keys accepted by the Odds API v4
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
        (e) =>
          e.homeTeam.name.toLowerCase().includes(apiEvent.home_team.toLowerCase()) ||
          apiEvent.home_team.toLowerCase().includes(e.homeTeam.name.toLowerCase()) ||
          e.awayTeam.name.toLowerCase().includes(apiEvent.away_team.toLowerCase()) ||
          apiEvent.away_team.toLowerCase().includes(e.awayTeam.name.toLowerCase()),
      );
      if (!dbEvent) continue;

      let eventWithProps: Awaited<ReturnType<typeof this.oddsApi.getEventOdds>>;
      try {
        eventWithProps = await this.oddsApi.getEventOdds('basketball_nba', apiEvent.id, JobsService.PROP_MARKETS);
      } catch (e) {
        // 429 re-thrown by getEventOdds — stop processing to avoid further rate-limit hits
        this.logger.warn('Rate limited during player props sync — aborting remaining events');
        break;
      }
      // Small delay between per-event calls to stay within rate limits
      await new Promise((r) => setTimeout(r, 300));
      if (!eventWithProps) continue;

      for (const bookmaker of eventWithProps.bookmakers) {
        const book = bookBySlug.get(bookmaker.key);
        if (!book) continue;

        for (const market of bookmaker.markets) {
          if (market.key !== 'player_props') continue;

          for (const outcome of market.outcomes) {
            // outcome.description holds the player name for player props
            const playerName = (outcome as any).description as string | undefined;
            if (!playerName) continue;

            const player = await this.prisma.player.findFirst({
              where: {
                name: { equals: playerName, mode: 'insensitive' },
                isActive: true,
              },
            });
            if (!player) continue;

            // Determine stat type from outcome.name (e.g. "player_points", "player_rebounds")
            const statTypeMap: Record<string, string> = {
              player_points: 'POINTS',
              player_rebounds: 'REBOUNDS',
              player_assists: 'ASSISTS',
              player_threes: 'THREES',
              player_blocks: 'BLOCKS',
              player_steals: 'STEALS',
            };
            const propStatType = statTypeMap[outcome.name as string];
            if (!propStatType) continue;

            // Find or create player prop market
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

            // over/under direction comes from the bet name
            const direction = (outcome as any).name?.toLowerCase?.().includes('over') ? 'over' : 'under';
            const line = outcome.point ?? null;

            const existing = await this.prisma.marketOdds.findFirst({
              where: { marketId: dbMarket.id, bookId: book.id, outcome: direction },
            });

            if (existing) {
              if (existing.odds !== outcome.price) {
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
                data: { marketId: dbMarket.id, bookId: book.id, outcome: direction, odds: outcome.price, line },
              });
              propUpdated++;
            }
          }
        }
      }
    }

    if (propUpdated > 0) this.logger.log(`Player props sync: ${propUpdated} prop odds updated`);
  }

  /**
   * Daily at 08:00 UTC (04:00 ET): sync real game logs from BallDontLie.
   * Step 1 — discovery: match our Players to BDL player IDs by name (one-time per player).
   * Step 2 — sync: pull current-season game stats for all matched players and upsert StatLines.
   */
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

  /** Match DB players (bdlId IS NULL) to BallDontLie player IDs by name search. */
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
          (r) =>
            `${r.first_name} ${r.last_name}`.toLowerCase() === player.name.toLowerCase(),
        );
        if (match) {
          await this.prisma.player.update({
            where: { id: player.id },
            data: { bdlId: match.id },
          }).catch(() => null); // skip on unique constraint if two players share an id
          matched++;
        }
      } catch (e) {
        this.logger.warn(`BDL discovery failed for ${player.name}: ${e.message}`);
      }
    }
    this.logger.log(`BDL discovery: ${matched}/${unmatched.length} players matched`);
  }

  /** Fetch current-season game stats for all BDL-matched players and upsert StatLines. */
  private async syncBdlStats() {
    const players = await this.prisma.player.findMany({
      where: { isActive: true, bdlId: { not: null } },
      select: { id: true, bdlId: true },
    });

    if (players.length === 0) {
      this.logger.debug('BDL sync: no matched players yet');
      return;
    }

    // Build bdlId → dbPlayerId lookup
    const bdlToDb = new Map<number, string>();
    for (const p of players) {
      bdlToDb.set(p.bdlId!, p.id);
    }

    const currentSeason = new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0);
    const BATCH = 100;
    const bdlIds = players.map((p) => p.bdlId!);

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

      // Anchor event: we need a valid eventId for StatLine FK.
      // Use the most recent FINAL event we have — same approach as nba_api sync.
      const anchorEvent = await this.prisma.event.findFirst({
        where: { status: 'FINAL' },
        orderBy: { startTime: 'desc' },
      });
      if (!anchorEvent) { this.logger.warn('BDL sync: no FINAL events found'); break; }

      for (const stat of stats) {
        const dbPlayerId = bdlToDb.get(stat.player.id);
        if (!dbPlayerId) continue;

        const gameDate = new Date(stat.game.date);
        const existing = await this.prisma.statLine.findFirst({
          where: { playerId: dbPlayerId, gameDate },
        });
        if (existing) continue;

        // Parse "MM:SS" → decimal minutes
        const parseMin = (s: string): number => {
          if (!s || !s.includes(':')) return parseFloat(s) || 0;
          const [m, sec] = s.split(':').map(Number);
          return m + sec / 60;
        };

        const min   = parseMin(stat.min);
        const pts   = stat.pts   ?? 0;
        const fga   = stat.fga   ?? 0;
        const fta   = stat.fta   ?? 0;
        const fgm   = stat.fgm   ?? 0;
        const fg3m  = stat.fg3m  ?? 0;
        const tsPct  = (fga + fta) > 0 ? pts / (2 * (fga + 0.475 * fta)) : 0;
        const efgPct = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0;

        await this.prisma.statLine.create({
          data: {
            playerId: dbPlayerId,
            eventId:  anchorEvent.id,
            season:   String(currentSeason),
            gameDate,
            points:    pts,
            rebounds:  stat.reb   ?? 0,
            assists:   stat.ast   ?? 0,
            steals:    stat.stl   ?? 0,
            blocks:    stat.blk   ?? 0,
            turnovers: stat.turnover ?? 0,
            minutes:   min,
            fgm,
            fga,
            fgPct:     stat.fg_pct   ?? 0,
            fg3m,
            fg3a:      stat.fg3a     ?? 0,
            fg3Pct:    stat.fg3_pct  ?? 0,
            ftm:       stat.ftm      ?? 0,
            fta,
            ftPct:     stat.ft_pct   ?? 0,
            plusMinus: 0,
            usgPct:    0,
            tsPct:     Math.round(tsPct  * 10000) / 10000,
            efgPct:    Math.round(efgPct * 10000) / 10000,
            bpm:       0,
          },
        }).catch(() => null);
        inserted++;
      }
    }
    this.logger.log(`BDL sync complete: ${inserted} new stat lines inserted`);
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

  // ─── Phase 1: Data Ingestion Jobs ────────────────────────────

  /** Every 15 minutes: snapshot all open odds into OddsSnapshot table */
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

  /** Every 5 minutes: detect significant line movements (>=3% implied prob shift) */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectLineMovementsJob() {
    try {
      const moves = await this.dataIngestion.detectLineMovements(3);
      if (moves.length > 0) {
        this.logger.log(`Line movement alert: ${moves.length} significant move(s) detected`);
        // Phase 4 hook: trigger WebSocket/email alerts here
      }
    } catch (e) {
      this.logger.error('Line movement detection failed:', e.message);
    }
  }

  /** Every 30 minutes: sync injury reports from ESPN via Python sidecar */
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

  /** Every hour: sync NBA news from ESPN via Python sidecar */
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

  /** Every 30 minutes: sync public betting splits from Action Network */
  @Cron('*/30 * * * *')
  async syncPublicBettingJob() {
    if (this.isPublicBettingRunning) return;
    this.isPublicBettingRunning = true;
    try {
      const count = await this.publicBetting.syncPublicBetting();
      this.logger.debug(`Public betting sync: ${count} splits updated`);
    } catch (e) {
      this.logger.error('Public betting sync failed:', e.message);
    } finally {
      this.isPublicBettingRunning = false;
    }
  }

  /** Every 5 minutes: evaluate all active alert rules and fire notifications */
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

  private async simulateOddsMovement() {
    // Fetch all open market odds (no cap) so player props are included
    const marketOdds = await this.prisma.marketOdds.findMany({
      where: { isOpen: true },
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
