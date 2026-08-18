import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * ParlayService now owns only market discovery and standard cross-event parlay
 * pricing. Same-game correlation is handled exclusively by EmpiricalSgpService.
 * No hard-coded correlation coefficients are permitted in this service.
 */
@Injectable()
export class ParlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async getEventMarkets(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        markets: {
          where: { isActive: true },
          include: {
            player: { include: { team: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
          orderBy: { marketType: 'asc' },
        },
      },
    });
    if (!event) return null;

    const legs = event.markets
      .map((market) => {
        const bySelection = new Map<string, any>();
        for (const row of market.marketOdds) {
          const key = `${normalizeOutcome(row.outcome)}:${row.line ?? 'none'}`;
          const existing = bySelection.get(key);
          if (!existing || row.odds > existing.odds) {
            bySelection.set(key, {
              marketOddsId: row.id,
              outcome: normalizeOutcome(row.outcome),
              odds: row.odds,
              line: row.line,
              bookId: row.bookId,
              bookName: row.book.name,
              bookSlug: row.book.slug,
            });
          }
        }

        return {
          marketId: market.id,
          marketType: market.marketType,
          propStatType: market.propStatType,
          description: market.description,
          player: market.player
            ? {
                id: market.player.id,
                name: market.player.name,
                teamId: market.player.teamId,
                teamAbbr: market.player.team?.abbreviation,
              }
            : null,
          outcomes: [...bySelection.values()],
        };
      })
      .filter((market) => market.outcomes.length > 0);

    return {
      eventId,
      home: event.homeTeam.abbreviation,
      away: event.awayTeam.abbreviation,
      homeTeamId: event.homeTeamId,
      awayTeamId: event.awayTeamId,
      startTime: event.startTime,
      legs,
    };
  }

  /**
   * Standard multi-event parlay pricing.
   *
   * Independence is used only across distinct events. If multiple legs belong
   * to the same event this method refuses to manufacture an independent EV and
   * directs callers to the empirical SGP endpoint instead.
   */
  async analyzeParlay(legs: Array<{ marketId: string; outcome: string }>) {
    if (legs.length < 2) throw new Error('Need at least 2 legs');

    const legData = await Promise.all(
      legs.map(async (input) => {
        const market = await this.prisma.market.findUnique({
          where: { id: input.marketId },
          include: {
            event: { include: { homeTeam: true, awayTeam: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
        });
        if (!market) throw new Error(`Market ${input.marketId} not found`);

        const outcome = normalizeOutcome(input.outcome);
        const outcomeRows = market.marketOdds.filter((row) => normalizeOutcome(row.outcome) === outcome);
        if (!outcomeRows.length) throw new Error(`No open odds for outcome ${input.outcome}`);
        const best = outcomeRows.reduce((a, b) => (a.odds > b.odds ? a : b));

        const probability = noVigProbability(
          market.marketOdds,
          best.id,
          this.analyticsService,
        );
        const ev = this.analyticsService.calcEV(probability, best.odds);

        return {
          marketId: input.marketId,
          outcome,
          event: {
            id: market.event.id,
            home: market.event.homeTeam.abbreviation,
            away: market.event.awayTeam.abbreviation,
          },
          marketType: market.marketType,
          propStatType: market.propStatType,
          bestOdds: best.odds,
          bestBook: best.book.name,
          bookId: best.bookId,
          line: best.line,
          probability,
          probabilitySource: 'MARKET_NO_VIG_BASELINE' as const,
          ev,
        };
      }),
    );

    const eventIds = legData.map((leg) => leg.event.id);
    const hasSameEventLegs = new Set(eventIds).size !== eventIds.length;
    const parlayDecimal = legData.reduce(
      (product, leg) => product * americanToDecimal(leg.bestOdds),
      1,
    );

    if (hasSameEventLegs) {
      return {
        legs: legData,
        parlayOddsDecimal: round2(parlayDecimal),
        parlayOddsAmerican: decimalToAmerican(parlayDecimal),
        trueProb: null,
        evPct: null,
        probabilityModel: 'UNMODELED_SAME_EVENT_DEPENDENCE',
        warning: 'Standard parlay EV is withheld because two or more legs share an event. Use /parlay/sgp/analyze for empirical same-game dependence instead.',
      };
    }

    const independentProbability = legData.reduce(
      (product, leg) => product * leg.probability,
      1,
    );
    const ev = independentProbability * parlayDecimal - 1;

    return {
      legs: legData,
      parlayOddsDecimal: round2(parlayDecimal),
      parlayOddsAmerican: decimalToAmerican(parlayDecimal),
      trueProb: roundPct(independentProbability),
      evPct: roundPct(ev),
      probabilityModel: 'CROSS_EVENT_INDEPENDENT_MARKET_NO_VIG_BASELINE',
      warning: null,
    };
  }
}

function noVigProbability(
  rows: Array<{ id: string; odds: number }>,
  selectedId: string,
  analytics: AnalyticsService,
): number {
  if (rows.length < 2) return 0.5;
  const probabilities = analytics.removeVig(rows.map((row) => row.odds));
  const index = rows.findIndex((row) => row.id === selectedId);
  return index >= 0 ? probabilities[index] : 0.5;
}

function normalizeOutcome(value: string): string {
  return value.trim().toLowerCase();
}

function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function decimalToAmerican(decimal: number): number {
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10_000) / 100;
}
