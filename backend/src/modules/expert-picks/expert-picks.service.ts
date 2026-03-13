import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpertPicksService {
  constructor(private prisma: PrismaService) {}

  async createPick(data: {
    expertName: string;
    source?: string;
    marketId: string;
    outcome: string;
    odds?: number;
    confidence?: number;
    reasoning?: string;
  }) {
    return this.prisma.expertPick.create({ data });
  }

  async getPicks(filters: {
    marketId?: string;
    expertName?: string;
    pending?: boolean;
    limit?: number;
  } = {}) {
    const picks = await this.prisma.expertPick.findMany({
      where: {
        ...(filters.marketId  && { marketId: filters.marketId }),
        ...(filters.expertName && { expertName: filters.expertName }),
        ...(filters.pending   && { result: null }),
      },
      include: {
        market: {
          include: {
            event: { include: { homeTeam: true, awayTeam: true } },
            player: { include: { team: true } },
          },
        },
      },
      orderBy: { pickedAt: 'desc' },
      take: filters.limit ?? 50,
    });

    // Enrich each pick with latest public betting split for same market/outcome
    return Promise.all(
      picks.map(async (pick) => {
        const publicSplit = await this.prisma.publicBettingSplit
          .findFirst({
            where: { marketId: pick.marketId, outcome: pick.outcome },
            orderBy: { snappedAt: 'desc' },
          })
          .catch(() => null);
        return { ...pick, publicSplit };
      }),
    );
  }

  async getConsensus(marketId: string) {
    const picks = await this.prisma.expertPick.findMany({ where: { marketId } });
    const bySide: Record<string, number> = {};
    for (const p of picks) bySide[p.outcome] = (bySide[p.outcome] ?? 0) + 1;
    const total = picks.length;
    const consensus = Object.entries(bySide).map(([outcome, count]) => ({
      outcome,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
    return { total, consensus };
  }

  async resolvePick(id: string, result: 'WIN' | 'LOSS' | 'PUSH') {
    return this.prisma.expertPick.update({
      where: { id },
      data: { result, resolvedAt: new Date() },
    });
  }

  /** Markets where expert lean and public lean disagree (contrarian signals) */
  async getContrarian() {
    const recentPicks = await this.prisma.expertPick.findMany({
      where: { result: null },
      include: {
        market: {
          include: {
            event: { include: { homeTeam: true, awayTeam: true } },
            player: { include: { team: true } },
            publicBettingSplits: {
              orderBy: { snappedAt: 'desc' },
              take: 2,
            },
          },
        },
      },
      orderBy: { pickedAt: 'desc' },
      take: 100,
    });

    // Group by market to compute expert consensus per market
    const marketMap: Record<string, { picks: typeof recentPicks; market: any }> = {};
    for (const p of recentPicks) {
      if (!marketMap[p.marketId]) marketMap[p.marketId] = { picks: [], market: p.market };
      marketMap[p.marketId].picks.push(p);
    }

    const result: any[] = [];
    for (const [marketId, { picks, market }] of Object.entries(marketMap)) {
      if (picks.length === 0) continue;

      // Expert consensus
      const bySide: Record<string, number> = {};
      for (const p of picks) bySide[p.outcome] = (bySide[p.outcome] ?? 0) + 1;
      const total = picks.length;
      const topExpertSide = Object.entries(bySide).sort((a, b) => b[1] - a[1])[0];
      if (!topExpertSide) continue;
      const [expertOutcome, expertCount] = topExpertSide;
      const expertPct = Math.round((expertCount / total) * 100);

      // Latest public split for the same outcome
      const publicSplit = market.publicBettingSplits.find(
        (s: any) => s.outcome === expertOutcome,
      );
      if (!publicSplit) continue;

      // Contrarian = experts ≥60% on one side, public ≤40% bets on that side
      if (expertPct >= 60 && publicSplit.pctBets <= 40) {
        result.push({
          marketId,
          market,
          expertOutcome,
          expertPct,
          expertCount,
          totalExperts: total,
          publicPctBets: publicSplit.pctBets,
          publicPctMoney: publicSplit.pctMoney,
        });
      }
    }
    return result;
  }
}
