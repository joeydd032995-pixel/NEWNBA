import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const ACTION_NETWORK_URL = 'https://api.actionnetwork.com/web/v1/scoreboard/nba';
const AN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; NBABettingApp/1.0)',
};

@Injectable()
export class PublicBettingService {
  private readonly logger = new Logger(PublicBettingService.name);

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
  ) {}

  async syncPublicBetting(): Promise<number> {
    let upserted = 0;
    try {
      const { data } = await firstValueFrom(
        this.http.get<any>(ACTION_NETWORK_URL, {
          headers: AN_HEADERS,
          params: { periods: 'event' },
          timeout: 10000,
        } as any),
      );

      const games = data?.games ?? [];
      for (const game of games) {
        const homeTeamName: string = game.teams?.home?.full_name ?? '';
        const awayTeamName: string = game.teams?.away?.full_name ?? '';

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
          if (pctRaw === undefined) continue;
          const pctBets = parseFloat(pctRaw) || 0;
          const pctMoney =
            parseFloat(bets[`${side}_money`] ?? pctRaw) || 0;
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
            update: { pctBets, pctMoney },
          });
          upserted++;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Public betting sync from Action Network failed: ${(e as Error).message} — using simulation fallback`,
      );
      await this.simulatePublicBetting();
    }
    return upserted;
  }

  /** Simulate plausible public betting splits when real source unavailable */
  private async simulatePublicBetting(): Promise<void> {
    const markets = await this.prisma.market.findMany({
      where: { marketType: 'MONEYLINE', isActive: true, event: { status: 'SCHEDULED' } },
      take: 20,
    });
    const now = new Date();
    for (const m of markets) {
      const homePct = 40 + Math.random() * 20;
      const awayPct = 100 - homePct;
      for (const [outcome, pct] of [
        ['home', homePct],
        ['away', awayPct],
      ] as [string, number][]) {
        await this.prisma.publicBettingSplit
          .upsert({
            where: {
              marketId_outcome_snappedAt: { marketId: m.id, outcome, snappedAt: now },
            },
            create: {
              marketId: m.id,
              outcome,
              pctBets: pct,
              pctMoney: pct + (Math.random() - 0.5) * 10,
              source: 'simulated',
              snappedAt: now,
            },
            update: { pctBets: pct, pctMoney: pct },
          })
          .catch(() => null);
      }
    }
  }

  async getSplitsForMarket(marketId: string): Promise<any[]> {
    const since = new Date();
    since.setHours(since.getHours() - 2);
    return this.prisma.publicBettingSplit.findMany({
      where: { marketId, snappedAt: { gte: since } },
      orderBy: { snappedAt: 'desc' },
      take: 10,
    });
  }

  async getLatestSplitForMarket(marketId: string): Promise<Record<string, number>> {
    const splits = await this.prisma.publicBettingSplit.findMany({
      where: { marketId },
      orderBy: { snappedAt: 'desc' },
      take: 4,
      select: { outcome: true, pctBets: true },
    });
    const result: Record<string, number> = {};
    for (const s of splits) {
      if (!(s.outcome in result)) result[s.outcome] = s.pctBets;
    }
    return result;
  }
}
