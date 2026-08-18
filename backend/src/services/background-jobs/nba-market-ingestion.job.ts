import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { OddsApiEvent, OddsApiOutcome, OddsApiService } from '../odds-api/odds-api.service';
import {
  getNbaMarketMapping,
  NBA_ADDITIONAL_MARKET_KEYS,
  NbaMarketMapping,
} from '../odds-api/nba-market-map';

/**
 * Phase-3 NBA market ingestion.
 *
 * Runs five minutes after the baseline odds job to avoid stacking provider calls.
 * It only writes verified sportsbook responses and preserves each alternate line
 * as its own MarketOdds row instead of collapsing alternates into one line.
 */
@Injectable()
export class NbaMarketIngestionJob {
  private readonly logger = new Logger(NbaMarketIngestionJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oddsApi: OddsApiService,
  ) {}

  @Cron('5,35 * * * *')
  async syncExpandedNbaMarkets(): Promise<void> {
    if (this.running) return;
    if (!this.oddsApi.isEnabled) {
      this.logger.debug('Expanded NBA market sync skipped: ODDS_API_KEY not configured');
      return;
    }

    this.running = true;
    try {
      const apiEvents = await this.oddsApi.getSportEvents('basketball_nba');
      if (!apiEvents.length) return;

      const dbEvents = await this.prisma.event.findMany({
        where: { status: { in: ['SCHEDULED', 'LIVE'] } },
        include: { homeTeam: true, awayTeam: true },
      });
      const books = await this.prisma.book.findMany({ where: { isActive: true } });
      const bookBySlug = new Map(books.map((book) => [book.slug, book]));
      let written = 0;

      for (const apiEvent of apiEvents) {
        const dbEvent = this.matchEvent(apiEvent, dbEvents);
        if (!dbEvent) continue;

        let eventOdds: OddsApiEvent | null = null;
        try {
          eventOdds = await this.oddsApi.getEventOdds(
            'basketball_nba',
            apiEvent.id,
            NBA_ADDITIONAL_MARKET_KEYS,
          );
        } catch (error) {
          this.logger.warn(`Expanded market sync interrupted by provider error: ${(error as Error).message}`);
          break;
        }
        if (!eventOdds) continue;

        for (const bookmaker of eventOdds.bookmakers) {
          const book = bookBySlug.get(bookmaker.key);
          if (!book) continue;

          for (const providerMarket of bookmaker.markets) {
            const mapping = getNbaMarketMapping(providerMarket.key);
            if (!mapping) continue;

            for (const outcome of providerMarket.outcomes) {
              const didWrite = mapping.isPlayerMarket
                ? await this.persistPlayerOutcome(dbEvent, book.id, providerMarket.key, mapping, outcome)
                : await this.persistTeamOrGameOutcome(dbEvent, book.id, providerMarket.key, mapping, outcome);
              if (didWrite) written++;
            }
          }
        }

        // Event markets are quota-expensive; pace calls rather than bursting.
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      if (written > 0) this.logger.log(`Expanded NBA market sync: ${written} verified odds rows written/updated`);
    } catch (error) {
      this.logger.error(`Expanded NBA market sync failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private matchEvent(apiEvent: { home_team: string; away_team: string }, dbEvents: any[]) {
    return dbEvents.find((event) =>
      namesMatch(event.homeTeam.name, apiEvent.home_team) &&
      namesMatch(event.awayTeam.name, apiEvent.away_team),
    );
  }

  private async persistPlayerOutcome(
    dbEvent: any,
    bookId: string,
    providerKey: string,
    mapping: NbaMarketMapping,
    outcome: OddsApiOutcome,
  ): Promise<boolean> {
    const playerName = outcome.description?.trim();
    if (!playerName || !mapping.propStatType) return false;

    const player = await this.prisma.player.findFirst({
      where: { name: { equals: playerName, mode: 'insensitive' }, isActive: true },
    });
    if (!player) return false;

    const market = await this.prisma.market.findFirst({
      where: {
        eventId: dbEvent.id,
        marketType: mapping.marketType,
        playerId: player.id,
        propStatType: mapping.propStatType,
      },
    }) ?? await this.prisma.market.create({
      data: {
        eventId: dbEvent.id,
        sportId: dbEvent.sportId,
        marketType: mapping.marketType,
        playerId: player.id,
        propStatType: mapping.propStatType,
        description: `${providerKey}:${playerName}`,
      },
    });

    const normalizedOutcome = normalizeOutcome(outcome.name);
    if (!normalizedOutcome) return false;
    return this.upsertMarketOdds(
      market.id,
      bookId,
      normalizedOutcome,
      outcome.price,
      outcome.point ?? null,
      mapping.isAlternate,
    );
  }

  private async persistTeamOrGameOutcome(
    dbEvent: any,
    bookId: string,
    providerKey: string,
    mapping: NbaMarketMapping,
    outcome: OddsApiOutcome,
  ): Promise<boolean> {
    const subject = outcome.description?.trim() ?? '';
    // Team-total and alternate-team-total markets need one logical market per
    // team. Derivatives also include providerKey so alternate spread/total rows
    // can never collide under the generic DERIVATIVE enum.
    const description = mapping.marketType === 'DERIVATIVE'
      ? `${providerKey}:${subject || 'game'}`
      : subject || providerKey;

    const market = await this.prisma.market.findFirst({
      where: {
        eventId: dbEvent.id,
        marketType: mapping.marketType,
        description,
      },
    }) ?? await this.prisma.market.create({
      data: {
        eventId: dbEvent.id,
        sportId: dbEvent.sportId,
        marketType: mapping.marketType,
        description,
      },
    });

    let normalizedOutcome = normalizeOutcome(outcome.name);
    if (!normalizedOutcome) normalizedOutcome = outcome.name.trim().toLowerCase();
    if (subject) normalizedOutcome = `${normalizeSubject(subject)}:${normalizedOutcome}`;

    return this.upsertMarketOdds(
      market.id,
      bookId,
      normalizedOutcome,
      outcome.price,
      outcome.point ?? null,
      mapping.isAlternate,
    );
  }

  private async upsertMarketOdds(
    marketId: string,
    bookId: string,
    outcome: string,
    odds: number,
    line: number | null,
    preserveLineIdentity: boolean,
  ): Promise<boolean> {
    const existing = await this.prisma.marketOdds.findFirst({
      where: {
        marketId,
        bookId,
        outcome,
        ...(preserveLineIdentity ? { line } : {}),
      },
    });

    if (!existing) {
      await this.prisma.marketOdds.create({
        data: { marketId, bookId, outcome, odds, line },
      });
      return true;
    }

    if (existing.odds === odds && existing.line === line && existing.isOpen) return false;

    await this.prisma.oddsHistory.create({
      data: { marketOddsId: existing.id, odds: existing.odds, line: existing.line },
    });
    await this.prisma.marketOdds.update({
      where: { id: existing.id },
      data: { odds, line, isOpen: true },
    });
    return true;
  }
}

function namesMatch(dbName: string, apiName: string): boolean {
  const a = dbName.toLowerCase();
  const b = apiName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeOutcome(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (['over', 'under', 'yes', 'no', 'home', 'away'].includes(normalized)) return normalized;
  return normalized || null;
}

function normalizeSubject(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
