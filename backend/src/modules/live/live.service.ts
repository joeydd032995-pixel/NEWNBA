import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class LiveService {
  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  async getLiveGames() {
    const events = await this.prisma.event.findMany({
      where: {
        sport: { slug: 'nba' },
        status: { in: ['LIVE', 'SCHEDULED'] },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        markets: {
          where: {
            isActive: true,
            marketType: { in: ['MONEYLINE', 'SPREAD', 'TOTAL'] },
          },
          include: {
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
          take: 4,
        },
      },
      orderBy: [{ status: 'asc' }, { startTime: 'asc' }],
      take: 15,
    });

    const result = [];

    for (const event of events) {
      const homeScore = event.homeScore ?? 0;
      const awayScore = event.awayScore ?? 0;
      const diff = homeScore - awayScore;
      const total = homeScore + awayScore;

      // Momentum: homePct = share of scoring that belongs to home (50 = tied)
      const homePct = total > 0 ? Math.round((homeScore / total) * 100) : 50;
      const favoredTeam = diff > 4 ? 'home' : diff < -4 ? 'away' : 'even';

      // Market + line movement enrichment
      const markets = [];
      for (const market of event.markets) {
        const lineMovements = await this.getMarketMoves(
          market.marketOdds.map((o) => o.id),
        );

        // Collapse to best odds per outcome
        const byOutcome: Record<string, any> = {};
        for (const mo of market.marketOdds) {
          if (!byOutcome[mo.outcome] || mo.odds > byOutcome[mo.outcome].odds) {
            byOutcome[mo.outcome] = {
              outcome: mo.outcome,
              odds: mo.odds,
              line: mo.line,
              bookName: mo.book.name,
            };
          }
        }

        // Vig-free EV for each outcome
        const oddsArr = Object.values(byOutcome).map((o: any) => o.odds);
        const noVig =
          oddsArr.length >= 2 ? this.analyticsService.removeVig(oddsArr) : [];

        const outcomes = Object.values(byOutcome).map((o: any, i) => {
          const trueProb = noVig[i] ?? 0.5;
          const ev = this.analyticsService.calcEV(trueProb, o.odds);
          return { ...o, ...ev, trueProb };
        });

        markets.push({
          id: market.id,
          marketType: market.marketType,
          outcomes,
          lineMovements,
        });
      }

      result.push({
        event: {
          id: event.id,
          homeTeam: {
            id: event.homeTeam.id,
            name: event.homeTeam.name,
            abbr: event.homeTeam.abbreviation,
          },
          awayTeam: {
            id: event.awayTeam.id,
            name: event.awayTeam.name,
            abbr: event.awayTeam.abbreviation,
          },
          homeScore,
          awayScore,
          period: event.period,
          timeRemaining: event.timeRemaining,
          status: event.status,
          startTime: event.startTime,
        },
        momentum: { diff, total, homePct, favoredTeam },
        markets,
      });
    }

    return result;
  }

  private async getMarketMoves(marketOddsIds: string[]) {
    if (!marketOddsIds.length) return [];
    const since = new Date(Date.now() - 30 * 60 * 1000);

    const history = await this.prisma.oddsHistory.findMany({
      where: { marketOddsId: { in: marketOddsIds }, recordedAt: { gte: since } },
      include: { marketOdds: { select: { odds: true, outcome: true } } },
      orderBy: { recordedAt: 'asc' },
    });

    const moves: any[] = [];
    const seen = new Set<string>();

    for (const h of history) {
      if (seen.has(h.marketOddsId)) continue;
      const mo = h.marketOdds;
      const oldImpl =
        h.odds > 0 ? 100 / (h.odds + 100) : Math.abs(h.odds) / (Math.abs(h.odds) + 100);
      const newImpl =
        mo.odds > 0 ? 100 / (mo.odds + 100) : Math.abs(mo.odds) / (Math.abs(mo.odds) + 100);
      const movePct = Math.abs(newImpl - oldImpl) * 100;

      if (movePct >= 2) {
        moves.push({
          outcome: mo.outcome,
          oldOdds: h.odds,
          newOdds: mo.odds,
          movePct: Math.round(movePct * 10) / 10,
          direction: newImpl > oldImpl ? 'steam' : 'fade',
        });
        seen.add(h.marketOddsId);
      }
    }

    return moves;
  }

  async getLineMovements(threshold = 3) {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour

    const history = await this.prisma.oddsHistory.findMany({
      where: { recordedAt: { gte: since } },
      include: {
        marketOdds: {
          include: {
            market: {
              include: {
                event: { include: { homeTeam: true, awayTeam: true } },
                player: true,
              },
            },
            book: true,
          },
        },
      },
      orderBy: { recordedAt: 'desc' },
      take: 500,
    });

    const moves: any[] = [];
    const seen = new Set<string>();

    for (const hist of history) {
      if (seen.has(hist.marketOddsId)) continue;
      const mo = hist.marketOdds;
      const oldImpl =
        hist.odds > 0
          ? 100 / (hist.odds + 100)
          : Math.abs(hist.odds) / (Math.abs(hist.odds) + 100);
      const newImpl =
        mo.odds > 0
          ? 100 / (mo.odds + 100)
          : Math.abs(mo.odds) / (Math.abs(mo.odds) + 100);
      const movePct = Math.abs(newImpl - oldImpl) * 100;

      if (movePct >= threshold) {
        const event = mo.market.event;
        moves.push({
          marketOddsId: mo.id,
          marketId: mo.market.id,
          marketType: mo.market.marketType,
          event: {
            id: event.id,
            home: event.homeTeam.abbreviation,
            away: event.awayTeam.abbreviation,
            status: event.status,
            homeScore: event.homeScore,
            awayScore: event.awayScore,
            period: event.period,
          },
          player: mo.market.player?.name ?? null,
          outcome: mo.outcome,
          bookName: mo.book.name,
          oldOdds: hist.odds,
          newOdds: mo.odds,
          movePct: Math.round(movePct * 10) / 10,
          direction: newImpl > oldImpl ? 'steam' : 'fade',
          recordedAt: hist.recordedAt,
        });
        seen.add(hist.marketOddsId);
      }
    }

    moves.sort((a, b) => b.movePct - a.movePct);
    return moves.slice(0, 50);
  }
}
