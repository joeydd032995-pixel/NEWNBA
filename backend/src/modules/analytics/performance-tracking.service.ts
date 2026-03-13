import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class PerformanceTrackingService {
  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  async recordPrediction(
    userId: string,
    modelId: string,
    data: {
      eventId?: string;
      marketId?: string;
      outcome: string;
      predictedProb: number;
      confidence: number;
      metadata?: any;
    },
  ) {
    return this.prisma.modelPrediction.create({
      data: {
        userId,
        modelId,
        eventId: data.eventId,
        marketId: data.marketId,
        outcome: data.outcome,
        predictedProb: data.predictedProb,
        confidence: data.confidence,
        metadata: data.metadata,
      },
    });
  }

  async resolvePrediction(predictionId: string, actualResult: boolean, userId: string) {
    const prediction = await this.prisma.modelPrediction.findFirst({ where: { id: predictionId, userId } });
    if (!prediction) throw new Error('Prediction not found');
    return this.prisma.modelPrediction.update({
      where: { id: predictionId },
      data: { actualResult, isResolved: true, resolvedAt: new Date() },
    });
  }

  async calculatePerformance(modelId: string, period: string = 'all') {
    const predictions = await this.prisma.modelPrediction.findMany({
      where: { modelId, isResolved: true },
    });

    if (predictions.length === 0) {
      return {
        modelId,
        period,
        totalBets: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        roi: 0,
        sharpeRatio: 0,
        calibration: 0,
        avgEV: 0,
        totalProfit: 0,
        maxDrawdown: 0,
      };
    }

    const wins = predictions.filter(p => p.actualResult === true).length;
    const losses = predictions.filter(p => p.actualResult === false).length;
    const winRate = wins / predictions.length;

    // Calculate ROI assuming $100 bets at -110
    const stakes = predictions.map(() => 100);
    const pnls = predictions.map(p => {
      if (p.actualResult === true) return 90.91; // Win at -110
      if (p.actualResult === false) return -100;
      return 0;
    });

    const roi = this.analyticsService.calcROI(
      stakes.map((stake, i) => ({ stake, pnl: pnls[i] }))
    );

    const returns = pnls.map(p => p / 100);
    const sharpeRatio = this.analyticsService.calcSharpeRatio(returns);

    const calibrationPreds = predictions.map(p => ({
      predictedProb: p.predictedProb,
      actual: p.actualResult as boolean,
    }));
    const calibration = 1 - this.analyticsService.calcCalibration(calibrationPreds);

    const totalProfit = pnls.reduce((a, b) => a + b, 0);
    const maxDrawdown = this.analyticsService.calcMaxDrawdown(pnls);

    const perf = {
      modelId,
      period,
      totalBets: predictions.length,
      wins,
      losses,
      pushes: predictions.length - wins - losses,
      roi,
      winRate,
      sharpeRatio,
      calibration,
      avgEV: 0,
      totalProfit,
      maxDrawdown,
    };

    // Upsert performance record: delete existing entry for same model+period, then insert fresh
    await this.prisma.modelPerformance.deleteMany({ where: { modelId, period } });
    await this.prisma.modelPerformance.create({ data: perf });

    return perf;
  }

  async getPerformanceHistory(modelId: string) {
    return this.prisma.modelPerformance.findMany({
      where: { modelId },
      orderBy: { calculatedAt: 'desc' },
      take: 50,
    });
  }

  async getLeaderboard(limit: number = 20) {
    const performances = await this.prisma.modelPerformance.findMany({
      orderBy: { roi: 'desc' },
      take: limit,
      include: {
        model: { select: { id: true, name: true, userId: true } },
      },
    });
    return performances;
  }

  /**
   * Full performance dashboard: summary stats, breakdowns by market type/book,
   * calibration buckets, and P&L by day for the calendar heat-map.
   */
  async getDashboard(days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── 1. BetSlip resolved stats ────────────────────────────
    const slips = await this.prisma.betSlip.findMany({
      where: { status: { in: ['WON', 'LOST', 'VOID'] }, updatedAt: { gte: since } },
      include: {
        items: {
          include: {
            market: { select: { marketType: true } },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    let won = 0, lost = 0, pushed = 0;
    let totalStaked = 0, totalReturned = 0;
    const pnlSeries: number[] = [];
    const returns: number[] = [];
    const pnlByDay: Record<string, number> = {};

    for (const slip of slips) {
      const stake = slip.totalStake ?? slip.items.reduce((s, i) => s + i.stake, 0);
      const day = slip.updatedAt.toISOString().slice(0, 10);

      if (slip.status === 'WON') {
        const ret = stake * (slip.totalOdds ?? 2);
        const pnl = ret - stake;
        totalStaked += stake;
        totalReturned += ret;
        pnlSeries.push(pnl);
        returns.push(pnl / stake);
        pnlByDay[day] = (pnlByDay[day] ?? 0) + pnl;
        won++;
      } else if (slip.status === 'LOST') {
        totalStaked += stake;
        pnlSeries.push(-stake);
        returns.push(-1);
        pnlByDay[day] = (pnlByDay[day] ?? 0) - stake;
        lost++;
      } else {
        totalReturned += stake;
        pushed++;
      }
    }

    const totalBets = won + lost + pushed;
    const roi = totalStaked > 0 ? (totalReturned - totalStaked) / totalStaked : 0;
    const winRate = (won + lost) > 0 ? won / (won + lost) : 0;
    const sharpe = this.analyticsService.calcSharpeRatio(returns);
    const maxDrawdown = this.analyticsService.calcMaxDrawdown(pnlSeries);

    // ── 2. P&L cumulative growth history ────────────────────
    let cumPnl = 0;
    const growthHistory: Array<{ date: string; pnl: number; cumPnl: number }> = [];
    const sortedDays = Object.keys(pnlByDay).sort();
    for (const date of sortedDays) {
      cumPnl += pnlByDay[date];
      growthHistory.push({ date, pnl: Math.round(pnlByDay[date] * 100) / 100, cumPnl: Math.round(cumPnl * 100) / 100 });
    }

    // ── 3. Calendar heat-map (last 90 days) ──────────────────
    const calendarData: Array<{ date: string; pnl: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      calendarData.push({ date: d, pnl: Math.round((pnlByDay[d] ?? 0) * 100) / 100 });
    }

    // ── 4. Breakdown by market type ──────────────────────────
    const mktMap: Record<string, { bets: number; won: number; staked: number; returned: number }> = {};
    for (const slip of slips) {
      const mktType = slip.items[0]?.market?.marketType ?? 'UNKNOWN';
      if (!mktMap[mktType]) mktMap[mktType] = { bets: 0, won: 0, staked: 0, returned: 0 };
      const stake = slip.totalStake ?? slip.items.reduce((s, i) => s + i.stake, 0);
      mktMap[mktType].bets++;
      mktMap[mktType].staked += stake;
      if (slip.status === 'WON') {
        mktMap[mktType].won++;
        mktMap[mktType].returned += stake * (slip.totalOdds ?? 2);
      } else if (slip.status === 'VOID') {
        mktMap[mktType].returned += stake;
      }
    }
    const byMarketType = Object.entries(mktMap).map(([type, v]) => ({
      type,
      bets: v.bets,
      won: v.won,
      winRate: v.bets > 0 ? v.won / v.bets : 0,
      roi: v.staked > 0 ? (v.returned - v.staked) / v.staked : 0,
    })).sort((a, b) => b.bets - a.bets);

    // ── 5. Calibration buckets from ModelPredictions ─────────
    const predictions = await this.prisma.modelPrediction.findMany({
      where: { isResolved: true, createdAt: { gte: since } },
      select: { predictedProb: true, actualResult: true },
    });
    const calibrationBuckets = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}–${(i + 1) * 10}%`,
      midpoint: (i + 0.5) / 10,
      predicted: (i + 0.5) / 10,
      actual: 0,
      count: 0,
    }));
    for (const pred of predictions) {
      const idx = Math.min(9, Math.floor(pred.predictedProb * 10));
      calibrationBuckets[idx].count++;
      if (pred.actualResult) calibrationBuckets[idx].actual++;
    }
    const calibration = calibrationBuckets.map(b => ({
      ...b,
      actualRate: b.count > 0 ? Math.round((b.actual / b.count) * 1000) / 1000 : null,
    })).filter(b => b.count > 0);

    // ── 6. EV captured stats ─────────────────────────────────
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const evMetrics = await this.prisma.eVMetrics.aggregate({
      _avg: { evPct: true, kellyFraction: true },
      _count: true,
      where: { calculatedAt: { gte: twoHoursAgo } },
    });

    return {
      summary: {
        totalBets,
        won,
        lost,
        pushed,
        roi,
        winRate,
        sharpe,
        maxDrawdown,
        totalStaked,
        totalPnl: totalReturned - totalStaked,
        avgEVPct: evMetrics._avg.evPct ?? 0,
        activeOpportunities: evMetrics._count,
      },
      growthHistory,
      calendarData,
      byMarketType,
      calibration,
    };
  }
}
