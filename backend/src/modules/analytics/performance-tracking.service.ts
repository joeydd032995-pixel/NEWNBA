import { Injectable } from '@nestjs/common';
import {
  BetSlipStatus,
  LegSettlementStatus,
  PerformanceDimension,
  WagerStructure,
} from '@prisma/client';
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
   * ModelPrediction does not contain exact wager price/stake. Financial
   * performance is therefore intentionally calculated from tracked BetSlips.
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
   * Financial performance uses two distinct accounting units:
   * - SINGLE_BATCH: each settled item is an independently staked wager.
   * - PARLAY: the ticket is one wager with one ticket stake and ticket P&L.
   *
   * Parlay ticket P&L is never copied onto individual legs. Individual leg CLV
   * remains useful as market-timing evidence but is not treated as leg ROI.
   */
  async getDashboard(days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const slips = await this.prisma.betSlip.findMany({
      where: {
        status: { in: ['SETTLED', 'WON', 'LOST', 'PUSH', 'VOID'] },
        updatedAt: { gte: since },
      },
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

    const singleRecords: SettledItemRecord[] = [];
    const ticketRecords: SettledTicketRecord[] = [];
    const clvRecords: ClvRecord[] = [];

    for (const slip of slips) {
      for (const item of slip.items) {
        if (item.clvPrice !== null || item.clvLine !== null) {
          clvRecords.push({ clvPrice: item.clvPrice, clvLine: item.clvLine });
        }
      }

      if (slip.structure === WagerStructure.SINGLE_BATCH && slip.status === BetSlipStatus.SETTLED) {
        for (const item of slip.items) {
          const record = buildSettledItemRecord(slip, item);
          if (record) singleRecords.push(record);
        }
        continue;
      }

      // New explicit parlays and historical ticket-level records remain one
      // accounting unit. Historical ambiguous slips are not decomposed because
      // their individual settlement state did not exist at recommendation time.
      const ticket = buildTicketRecord(slip);
      if (ticket) ticketRecords.push(ticket);
    }

    const financialRecords: FinancialRecord[] = [...singleRecords, ...ticketRecords];
    const won = financialRecords.reduce((sum, record) => sum + record.won, 0);
    const lost = financialRecords.reduce((sum, record) => sum + record.lost, 0);
    const pushed = financialRecords.reduce((sum, record) => sum + record.pushed, 0);
    const totalStaked = financialRecords.reduce((sum, record) => sum + record.stake, 0);
    const totalPnl = financialRecords.reduce((sum, record) => sum + record.pnl, 0);
    const totalReturned = totalStaked + totalPnl;
    const totalBets = financialRecords.length;
    const roi = totalStaked > 0 ? totalPnl / totalStaked : 0;
    const winRate = won + lost > 0 ? won / (won + lost) : 0;
    const returns = financialRecords
      .filter((record) => record.stake > 0 && record.countedForRisk)
      .map((record) => record.pnl / record.stake);
    const pnlSeries = financialRecords
      .filter((record) => record.countedForRisk)
      .map((record) => record.pnl);
    const sharpe = this.analyticsService.calcSharpeRatio(returns);
    const maxDrawdown = this.analyticsService.calcMaxDrawdown(pnlSeries);

    const pnlByDay: Record<string, number> = {};
    for (const record of financialRecords) {
      pnlByDay[record.date] = (pnlByDay[record.date] ?? 0) + record.pnl;
    }

    let cumulativePnl = 0;
    const growthHistory = Object.keys(pnlByDay).sort().map((date) => {
      cumulativePnl += pnlByDay[date];
      return { date, pnl: round2(pnlByDay[date]), cumPnl: round2(cumulativePnl) };
    });

    const calendarData: Array<{ date: string; pnl: number }> = [];
    for (let index = days - 1; index >= 0; index--) {
      const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      calendarData.push({ date, pnl: round2(pnlByDay[date] ?? 0) });
    }

    // Category ROI slices intentionally use independent wagers only. Parlay
    // ticket P&L cannot be truthfully assigned to any one leg/category.
    const byMarketType = summarizeDimension(singleRecords, (record) => record.marketType ?? 'UNKNOWN');
    const byConfidence = summarizeDimension(singleRecords, (record) => record.confidence ?? 'UNSPECIFIED');
    const byPropType = summarizeDimension(singleRecords, (record) => record.propType ?? 'NON_PROP');
    const byDirection = summarizeDimension(singleRecords, (record) => record.direction ?? 'UNSPECIFIED');
    const bySeasonPhase = summarizeDimension(singleRecords, (record) => record.seasonPhase ?? 'UNSPECIFIED');
    const bySportsbook = summarizeDimension(singleRecords, (record) => record.sportsbook ?? 'UNSPECIFIED');

    const pricedClv = clvRecords.filter((record) => record.clvPrice !== null);
    const clvRate = pricedClv.length
      ? pricedClv.filter((record) => (record.clvPrice ?? 0) > 0).length / pricedClv.length
      : 0;
    const avgClv = pricedClv.length ? mean(pricedClv.map((record) => record.clvPrice ?? 0)) : 0;
    const lineClv = clvRecords.filter((record) => record.clvLine !== null);
    const avgLineClv = lineClv.length ? mean(lineClv.map((record) => record.clvLine ?? 0)) : 0;

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

    await this.refreshPerformanceSlices(singleRecords, since);

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
        totalReturned,
        totalPnl,
        independentWagers: singleRecords.length,
        parlayOrLegacyTickets: ticketRecords.length,
        avgEVPct: evMetrics._avg.evPct ?? 0,
        activeOpportunities: evMetrics._count,
        clvRate,
        avgClv,
        avgLineClv,
        clvSample: pricedClv.length,
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
        categorySlicesUseIndependentWagersOnly: true,
        parlayTicketPnlCopiedToLegs: false,
        reason: 'True parlay P&L is a ticket-level result; leg CLV is retained separately without inventing leg ROI.',
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
      await this.prisma.performanceSlice.deleteMany({ where: { userId, period } });
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

type FinancialRecord = {
  userId: string;
  date: string;
  won: number;
  lost: number;
  pushed: number;
  stake: number;
  pnl: number;
  countedForRisk: boolean;
};

type SettledItemRecord = FinancialRecord & {
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

type SettledTicketRecord = FinancialRecord & {
  structure: 'PARLAY' | 'LEGACY_TICKET';
};

type ClvRecord = {
  clvPrice: number | null;
  clvLine: number | null;
};

function buildSettledItemRecord(slip: any, item: any): SettledItemRecord | null {
  const status = item.settlementStatus as LegSettlementStatus;
  if (status === LegSettlementStatus.PENDING) return null;
  const stake = item.stake ?? 0;
  const result = settleLeg(status, item.odds, stake);
  return {
    userId: slip.userId,
    date: settlementDate(slip, item),
    won: status === LegSettlementStatus.WIN ? 1 : 0,
    lost: status === LegSettlementStatus.LOSS ? 1 : 0,
    pushed: status === LegSettlementStatus.PUSH || status === LegSettlementStatus.VOID ? 1 : 0,
    stake: result.staked,
    pnl: result.pnl,
    countedForRisk: status === LegSettlementStatus.WIN || status === LegSettlementStatus.LOSS,
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

function buildTicketRecord(slip: any): SettledTicketRecord | null {
  const stake = slip.ticketStake ?? slip.totalStake ?? 0;
  if (stake < 0) return null;
  const explicitPnl = finiteOrNull(slip.settlementProfitLoss);
  const status = String(slip.status);
  const result = explicitPnl !== null
    ? {
        staked: stake,
        pnl: explicitPnl,
        countedForRisk: status === 'WON' || status === 'LOST',
      }
    : settleLegacyTicket(status, stake, slip.totalOdds);
  if (!result) return null;

  return {
    userId: slip.userId,
    date: settlementDate(slip),
    won: status === 'WON' ? 1 : 0,
    lost: status === 'LOST' ? 1 : 0,
    pushed: status === 'PUSH' || status === 'VOID' ? 1 : 0,
    stake: result.staked,
    pnl: result.pnl,
    countedForRisk: result.countedForRisk,
    structure: slip.structure === WagerStructure.PARLAY ? 'PARLAY' : 'LEGACY_TICKET',
  };
}

function settleLeg(status: LegSettlementStatus, odds: number, stake: number) {
  if (status === LegSettlementStatus.WIN) {
    return { staked: stake, pnl: stake * (americanToDecimalOdds(odds) - 1) };
  }
  if (status === LegSettlementStatus.LOSS) return { staked: stake, pnl: -stake };
  if (status === LegSettlementStatus.PUSH || status === LegSettlementStatus.VOID) {
    return { staked: stake, pnl: 0 };
  }
  return { staked: 0, pnl: 0 };
}

function settleLegacyTicket(status: string, stake: number, totalOdds: number | null) {
  if (status === 'VOID' || status === 'PUSH') {
    return { staked: stake, pnl: 0, countedForRisk: false };
  }
  if (status === 'LOST') return { staked: stake, pnl: -stake, countedForRisk: true };
  if (status === 'WON') {
    const decimal = totalOdds && totalOdds > 1 ? totalOdds : 1;
    return { staked: stake, pnl: stake * (decimal - 1), countedForRisk: true };
  }
  return null;
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

function settlementDate(slip: any, item?: any): string {
  const value = item?.settledAt ?? slip.settledAt ?? slip.updatedAt ?? new Date();
  return new Date(value).toISOString().slice(0, 10);
}

function finiteOrNull(value: unknown): number | null {
  const numberValue = Number(value);
  return value !== null && value !== undefined && Number.isFinite(numberValue) ? numberValue : null;
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
