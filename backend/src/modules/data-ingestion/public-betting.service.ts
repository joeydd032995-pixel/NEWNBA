import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const ACTION_NETWORK_URL = 'https://api.actionnetwork.com/web/v1/scoreboard/nba';
const AN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; NBABettingApp/1.0)',
};

/**
 * Public betting is supplementary evidence only.
 *
 * Integrity rule: if the upstream source is unavailable, this service returns no
 * data. It must never synthesize ticket or money percentages because downstream
 * agents can otherwise mistake fabricated values for real market evidence.
 */
@Injectable()
export class PublicBettingService {
  private readonly logger = new Logger(PublicBettingService.name);

  constructor(private prisma: PrismaService) {}

  async syncPublicBetting(): Promise<number> {
    let upserted = 0;
    try {
      const resp = await axios.get<any>(ACTION_NETWORK_URL, {
        headers: AN_HEADERS,
        params: { periods: 'event' },
        timeout: 10000,
      });
      const games = resp.data?.games ?? [];
      for (const game of games) {
        const homeTeamName: string = game.teams?.home?.full_name ?? '';
        const awayTeamName: string = game.teams?.away?.full_name ?? '';
        if (!homeTeamName || !awayTeamName) continue;

        const dbEvent = await this.prisma.event.findFirst({
          where: {
            status: { in: ['SCHEDULED', 'LIVE'] },
            homeTeam: {
              name: { contains: homeTeamName.split(' ').pop() ?? '', mode: 'insensitive' },
            },
            awayTeam: {
              name: { contains: awayTeamName.split(' ').pop() ?? '', mode: 'insensitive' },
            },
          },
          include: { markets: { where: { marketType: 'MONEYLINE' }, take: 1 } },
        });

        if (!dbEvent || dbEvent.markets.length === 0) continue;
        const market = dbEvent.markets[0];
        const bets = game.public_bettors ?? {};
        const snappedAt = new Date();

        for (const [side, pctRaw] of [
          ['home', bets.home],
          ['away', bets.away],
        ] as [string, any][]) {
          if (pctRaw === undefined || pctRaw === null) continue;

          const pctBets = Number.parseFloat(String(pctRaw));
          const pctMoneyRaw = bets[`${side}_money`];
          const pctMoney = pctMoneyRaw === undefined || pctMoneyRaw === null
            ? pctBets
            : Number.parseFloat(String(pctMoneyRaw));

          // Reject malformed upstream values instead of silently coercing them to 0.
          if (!Number.isFinite(pctBets) || !Number.isFinite(pctMoney)) continue;
          if (pctBets < 0 || pctBets > 100 || pctMoney < 0 || pctMoney > 100) continue;

          await this.prisma.publicBettingSplit.upsert({
            where: {
              marketId_outcome_snappedAt: {
                marketId: market.id,
                outcome: side,
                snappedAt,
              },
            },
            create: {
              marketId: market.id,
              outcome: side,
              pctBets,
              pctMoney,
              source: 'actionnetwork',
              snappedAt,
            },
            update: { pctBets, pctMoney, source: 'actionnetwork' },
          });
          upserted++;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Public betting sync unavailable: ${(e as Error).message}. No synthetic splits were written.`,
      );
      return 0;
    }
    return upserted;
  }

  async getSplitsForMarket(marketId: string): Promise<any[]> {
    const since = new Date();
    since.setHours(since.getHours() - 2);
    return this.prisma.publicBettingSplit.findMany({
      where: {
        marketId,
        snappedAt: { gte: since },
        source: { not: 'simulated' },
      },
      orderBy: { snappedAt: 'desc' },
      take: 10,
    });
  }

  async getLatestSplitForMarket(marketId: string): Promise<Record<string, number>> {
    const splits = await this.prisma.publicBettingSplit.findMany({
      where: { marketId, source: { not: 'simulated' } },
      orderBy: { snappedAt: 'desc' },
      take: 4,
      select: { outcome: true, pctBets: true },
    });
    const result: Record<string, number> = {};
    for (const split of splits) {
      if (!(split.outcome in result)) result[split.outcome] = split.pctBets;
    }
    return result;
  }
}
