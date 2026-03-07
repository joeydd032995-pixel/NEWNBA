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

  async resolvePrediction(predictionId: string, actualResult: boolean) {
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

    // Upsert performance record
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
}
