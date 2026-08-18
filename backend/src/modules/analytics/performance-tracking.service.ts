import { Injectable } from '@nestjs/common';
import { PerformanceDimension } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { americanToDecimalOdds } from './clv';

@Injectable()
export class PerformanceTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
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
    const prediction = await this.prisma.modelPrediction.findFirst({
      where: { id: predictionId, userId },
    });
    if (!prediction) throw new Error('Prediction not found');
    return this.prisma.modelPrediction.update({
      where: { id: predictionId },
      data: { actualResult, isResolved: true, resolvedAt: new Date() },
    });
  }

  /**
   * ModelPrediction does not contain a wager price/stake. Therefore this method
   * reports predictive performance only and deliberately refuses to fabricate
   * ROI from a fixed -110 assumption. Financial performance lives in BetSlip.
   */
  async calculatePerformance(modelId: string, period = 'all') {
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
        pushes: 0,
        winRate: 0,
        calibration: 0,
        roi: 0,
        sharpeRatio: 0,
        totalProfit: 0,
        maxDrawdown: 0,
        avgEV: 0,
        clvRate: 0,
        avgClv: 0,
        avgOdds: 0,
        financialMetricsAvailable: false,
      };
    }

    const wins = predictions.filter((prediction) => prediction.actualResult === true).length;
    const losses = predictions.filter((prediction) => prediction.actualResult === false).length;
    const calibrationPredictions = predictions.map((prediction) => ({
      predictedProb: prediction.predictedProb,
      actual: prediction.actualResult as boolean,
    }));
    const calibration = 1 - this.analyticsService.calcCalibration(calibrationPredictions);
    const winRate = wins / Math.max(1, wins + losses);

    const persisted = {
      modelId,
      period,
      totalBets: predictions.length,
      wins,
      losses,
      pushes: predictions.length - wins - losses,
      roi: 0,
      winRate,
      sharpeRatio: 0,
      calibration,
      avgEV: 0,
      totalProfit: 0,
      maxDrawdown: 0,
      clvRate: 0,
      avgClv: 0,
      avgOdds: 0,
    };

    await this.prisma.modelPerformance.deleteMany({ where: { modelId, period } });
    await this.prisma.modelPerformance.create({ data: persisted });

    return {
      ...persisted,
      financialMetricsAvailable: false,
      financialMetricsReason: 'ModelPrediction has no exact sportsbook price/stake. Use tracked BetSlip performance for ROI/CLV.',
    };
  }

  async getPerformanceHistory(modelId: string) {
    return this.prisma.modelPerformance.findMany({
      where: { modelId },
      orderBy: { calculatedAt: 'desc' },
      take: 50,
    });
  }

  async getLeaderboard(limit = 20) {
    return this.prisma.modelPerformance.findMany({
      orderBy: [{ calibration: 'desc' }, { winRate: 'desc' }],
      take: limit,
      include: {
        model: { select: { id: true, name: true, userId: true } },
      },
    });
  }

  /**
   * Full financial dashboard from confirmed wager records only.
   * Multi-leg slips contribute to overall slip P&L, while category slices are
   * limited to single-item slips because leg-level settlement is not stored yet.
   */
  async getDashboard(days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const slips = await this.prisma.betSlip.findMany({
      where: { status: { in: ['WON', 'LOST', 'VOID'] }, updatedAt: { gte: since } },
      include: {
        user: { select: { id: true } },
        items: {
          include: {
            market: { select: { marketType: true } },
            book: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    let won = 0;
    let lost = 0;
    let pushed = 0;
    let totalStaked = 0;
    let totalReturned = 0;
    const pnlSeries: number[] = [];
    const returns: number[] = [];
    const pnlByDay: Record<string, number> = {};

    for (const slip of slips) {
      const stake = slip.totalStake || slip.items.reduce((sum, item) => sum + item.stake, 0);
      const day = slip.updatedAt.toISOString().slice(0, 10);
      const result = settleSlip(slip.status, stake, slip.totalOdds);
      totalStaked += result.staked;
      totalReturned += result.returned;
      if (result.counted) {
        pnlSeries.push(result.pnl);
        if (stake > 0) returns.push(result.pnl / stake);
      }
      pnlByDay[day] = (pnlByDay[day] ?? 0) + result.pnl;
      if (slip.status === 'WON') won++;
      else if (slip.status === 'LOST') lost++;
      else pushed++;
    }

    const totalBets = won + lost + pushed;
    const roi = totalStaked > 0 ? (totalReturned - totalStaked) / totalStaked : 0;
    const winRate = won + lost > 0 ? won / (won + lost) : 0;
    const sharpe = this.analyticsService.calcSharpeRatio(returns);
    const maxDrawdown = this.analyticsService.calcMaxDrawdown(pnlSeries);

    let cumulativePnl = 0;
    const growthHistory = Object.keys(pnlByDay).sort().map((date) => {
      cumulativePnl += pnlByDay[date];
      return {
        date,
        pnl: round2(pnlByDay[date]),
        cumPnl: round2(cumulativePnl),
      };
    });

    const calendarData: Array<{ date: string; pnl: number }> = [];
    for (let index = days - 1; index >= 0; index--) {
      const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      calendarData.push({ date, pnl: round2(pnlByDay[date] ?? 0) });
    }

    const singleItemRecords = slips
      .filter((slip) => slip.items.length === 1)
      .map((slip) => buildSettledItemRecord(slip))
      .filter((record): record is SettledItemRecord => record !== null);

    const byMarketType = summarizeDimension(singleItemRecords, (record) => record.marketType ?? 'UNKNOWN');
    const byConfidence = summarizeDimension(singleItemRecords, (record) => record.confidence ?? 'UNSPECIFIED');
    const byPropType = summarizeDimension(singleItemRecords, (record) => record.propType ?? 'NON_PROP');
    const byDirection = summarizeDimension(singleItemRecords, (record) => record.direction ?? 'UNSPECIFIED');
    const bySeasonPhase = summarizeDimension(singleItemRecords, (record) => record.seasonPhase ?? 'UNSPECIFIED');
    const bySportsbook = summarizeDimension(singleItemRecords, (record) => record.sportsbook ?? 'UNSPECIFIED');

    const clvItems = singleItemRecords.filter((record) => record.clvPrice !== null);
    const clvRate = clvItems.length
      ? clvItems.filter((record) => (record.clvPrice ?? 0) > 0).length / clvItems.length
      : 0;
    const avgClv = clvItems.length
      ? mean(clvItems.map((record) => record.clvPrice ?? 0))
      : 0;
    const avgLineClv = mean(
      singleItemRecords
        .filter((record) => record.clvLine !== null)
        .map((record) => record.clvLine ?? 0),
    );

    const predictions = await this.prisma.modelPrediction.findMany({
      where: { isResolved: true, createdAt: { gte: since } },
      select: { predictedProb: true, actualResult: true },
    });
    const calibrationBuckets = Array.from({ length: 10 }, (_, index) => ({
      bucket: `${index * 10}–${(index + 1) * 10}%`,
      midpoint: (index + 0.5) / 10,
      predicted: (index + 0.5) / 10,
      actual: 0,
      count: 0,
    }));
    for (const prediction of predictions) {
      const bucket = Math.min(9, Math.floor(prediction.predictedProb * 10));
      calibrationBuckets[bucket].count++;
      if (prediction.actualResult) calibrationBuckets[bucket].actual++;
    }
    const calibration = calibrationBuckets
      .map((bucket) => ({
        ...bucket,
        actualRate: bucket.count > 0 ? round3(bucket.actual / bucket.count) : null,
      }))
      .filter((bucket) => bucket.count > 0);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const evMetrics = await this.prisma.eVMetrics.aggregate({
      _avg: { evPct: true, kellyFraction: true },
      _count: true,
      where: { calculatedAt: { gte: twoHoursAgo } },
    });

    await this.refreshPerformanceSlices(singleItemRecords, since);

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
        clvRate,
        avgClv,
        avgLineClv,
        clvSample: clvItems.length,
      },
      growthHistory,
      calendarData,
      byMarketType,
      byConfidence,
      byPropType,
      byDirection,
      bySeasonPhase,
      bySportsbook,
      calibration,
      attributionLimitations: {
        categorySlicesUseSingleItemSlipsOnly: true,
        reason: 'BetSlip currently settles multi-leg wagers at slip level; individual parlay leg outcomes are not inferred.',
      },
    };
  }

  private async refreshPerformanceSlices(records: SettledItemRecord[], since: Date) {
    const dimensions: Array<{
      dimension: PerformanceDimension;
      getter: (record: SettledItemRecord) => string;
    }> = [
      { dimension: 'CONFIDENCE', getter: (record) => record.confidence ?? 'UNSPECIFIED' },
      { dimension: 'PROP_TYPE', getter: (record) => record.propType ?? 'NON_PROP' },
      { dimension: 'DIRECTION', getter: (record) => record.direction ?? 'UNSPECIFIED' },
      { dimension: 'SEASON_PHASE', getter: (record) => record.seasonPhase ?? 'UNSPECIFIED' },
      { dimension: 'MARKET_TYPE', getter: (record) => record.marketType ?? 'UNKNOWN' },
      { dimension: 'SPORTSBOOK', getter: (record) => record.sportsbook ?? 'UNSPECIFIED' },
    ];

    const period = `rolling_${Math.max(1, Math.round((Date.now() - since.getTime()) / 86_400_000))}d`;
    const userIds = [...new Set(records.map((record) => record.userId))];
    for (const userId of userIds) {
      await this.prisma.performanceSlice.deleteMany({
        where: { userId, period },
      });
      const userRecords = records.filter((record) => record.userId === userId);
      for (const definition of dimensions) {
        const summary = summarizeDimension(userRecords, definition.getter);
        for (const row of summary) {
          await this.prisma.performanceSlice.create({
            data: {
              userId,
              period,
              dimension: definition.dimension,
              dimensionValue: row.value,
              totalBets: row.bets,
              wins: row.won,
              losses: row.lost,
              pushes: row.pushed,
              units: row.pnl,
              roi: row.roi,
              averageOdds: row.averageOdds,
              clvRate: row.clvRate,
              averageClv: row.averageClv,
            },
          });
        }
      }
    }
  }
}

type SettledItemRecord = {
  userId: string;
  won: number;
  lost: number;
  pushed: number;
  stake: number;
  pnl: number;
  odds: number;
  marketType: string | null;
  confidence: string | null;
  propType: string | null;
  direction: string | null;
  seasonPhase: string | null;
  sportsbook: string | null;
  clvPrice: number | null;
  clvLine: number | null;
};

function buildSettledItemRecord(slip: any): SettledItemRecord | null {
  const item = slip.items[0];
  if (!item) return null;
  const stake = item.stake || slip.totalStake || 0;
  const settlement = settleAmerican(item.odds, stake, slip.status);
  return {
    userId: slip.userId,
    won: slip.status === 'WON' ? 1 : 0,
    lost: slip.status === 'LOST' ? 1 : 0,
    pushed: slip.status === 'VOID' ? 1 : 0,
    stake,
    pnl: settlement.pnl,
    odds: item.odds,
    marketType: item.market?.marketType ?? null,
    confidence: item.confidenceBucket ?? null,
    propType: item.propStatType ?? null,
    direction: item.direction ?? null,
    seasonPhase: item.seasonPhase ?? null,
    sportsbook: item.book?.slug ?? item.book?.name ?? null,
    clvPrice: item.clvPrice ?? null,
    clvLine: item.clvLine ?? null,
  };
}

function settleSlip(status: string, stake: number, totalOdds: number | null) {
  if (status === 'VOID') return { staked: 0, returned: stake, pnl: 0, counted: false };
  if (status === 'LOST') return { staked: stake, returned: 0, pnl: -stake, counted: true };
  if (status === 'WON') {
    const decimal = totalOdds && totalOdds > 1 ? totalOdds : 1;
    const returned = stake * decimal;
    return { staked: stake, returned, pnl: returned - stake, counted: true };
  }
  return { staked: 0, returned: 0, pnl: 0, counted: false };
}

function settleAmerican(odds: number, stake: number, status: string) {
  if (status === 'VOID') return { pnl: 0 };
  if (status === 'LOST') return { pnl: -stake };
  if (status === 'WON') return { pnl: stake * (americanToDecimalOdds(odds) - 1) };
  return { pnl: 0 };
}

function summarizeDimension(
  records: SettledItemRecord[],
  getter: (record: SettledItemRecord) => string,
) {
  const groups = new Map<string, SettledItemRecord[]>();
  for (const record of records) {
    const value = getter(record);
    groups.set(value, [...(groups.get(value) ?? []), record]);
  }
  return [...groups.entries()].map(([value, rows]) => {
    const stake = rows.reduce((sum, row) => sum + row.stake, 0);
    const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);
    const clvRows = rows.filter((row) => row.clvPrice !== null);
    return {
      value,
      bets: rows.length,
      won: rows.reduce((sum, row) => sum + row.won, 0),
      lost: rows.reduce((sum, row) => sum + row.lost, 0),
      pushed: rows.reduce((sum, row) => sum + row.pushed, 0),
      pnl,
      roi: stake > 0 ? pnl / stake : 0,
      averageOdds: mean(rows.map((row) => row.odds)),
      clvRate: clvRows.length ? clvRows.filter((row) => (row.clvPrice ?? 0) > 0).length / clvRows.length : 0,
      averageClv: clvRows.length ? mean(clvRows.map((row) => row.clvPrice ?? 0)) : 0,
    };
  }).sort((a, b) => b.bets - a.bets);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
