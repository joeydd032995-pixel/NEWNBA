import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TTestResult {
  tStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  confidenceInterval: [number, number];
  isSignificant: boolean;
  winner: 'A' | 'B' | null;
}

export interface ABTestStats {
  variant: string;
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPredictedProb: number;
  roi: number;
  stdDev: number;
}

@Injectable()
export class ABTestingService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // STATISTICAL TESTING
  // ============================================================

  /**
   * Welch's t-test (unequal variances)
   */
  welchTTest(sampleA: number[], sampleB: number[], confidenceLevel: number = 0.95): TTestResult {
    const nA = sampleA.length;
    const nB = sampleB.length;

    if (nA < 2 || nB < 2) {
      return { tStatistic: 0, pValue: 1, degreesOfFreedom: 0, confidenceInterval: [-1, 1], isSignificant: false, winner: null };
    }

    const meanA = sampleA.reduce((a, b) => a + b, 0) / nA;
    const meanB = sampleB.reduce((a, b) => a + b, 0) / nB;

    const varA = sampleA.reduce((sum, x) => sum + Math.pow(x - meanA, 2), 0) / (nA - 1);
    const varB = sampleB.reduce((sum, x) => sum + Math.pow(x - meanB, 2), 0) / (nB - 1);

    const seA = varA / nA;
    const seB = varB / nB;
    const seDiff = Math.sqrt(seA + seB);

    if (seDiff === 0) {
      return { tStatistic: 0, pValue: 1, degreesOfFreedom: nA + nB - 2, confidenceInterval: [0, 0], isSignificant: false, winner: null };
    }

    const tStatistic = (meanA - meanB) / seDiff;

    // Welch-Satterthwaite degrees of freedom
    const df = Math.pow(seA + seB, 2) / (Math.pow(seA, 2) / (nA - 1) + Math.pow(seB, 2) / (nB - 1));

    // Two-tailed p-value using approximation
    const pValue = this.tDistPValue(Math.abs(tStatistic), df);

    // Confidence interval for the difference
    const criticalValue = this.tCriticalValue(df, (1 - confidenceLevel) / 2);
    const marginOfError = criticalValue * seDiff;
    const diff = meanA - meanB;
    const confidenceInterval: [number, number] = [diff - marginOfError, diff + marginOfError];

    const isSignificant = pValue < (1 - confidenceLevel);
    const winner = isSignificant ? (meanA > meanB ? 'A' : 'B') : null;

    return { tStatistic, pValue, degreesOfFreedom: Math.floor(df), confidenceInterval, isSignificant, winner };
  }

  /**
   * Approximate p-value from t-distribution using numerical approximation
   */
  private tDistPValue(t: number, df: number): number {
    // Using approximation for two-tailed p-value
    const x = df / (df + t * t);
    const betaI = this.incompleteBeta(df / 2, 0.5, x);
    return Math.min(1, Math.max(0, betaI));
  }

  /**
   * Incomplete beta function approximation
   */
  private incompleteBeta(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Continued fraction approximation
    const lbeta = this.logBeta(a, b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

    let result = front;
    let term = 1;
    for (let n = 1; n <= 50; n++) {
      term *= (x * (a + b + n - 1)) / (a + n);
      result += front * term;
      if (Math.abs(term) < 1e-10) break;
    }
    return Math.min(1, result);
  }

  private logBeta(a: number, b: number): number {
    return this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b);
  }

  private logGamma(n: number): number {
    // Stirling approximation
    if (n < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * n)) - this.logGamma(1 - n);
    n -= 1;
    const x = 0.99999999999980993 +
      676.5203681218851 / (n + 1) - 1259.1392167224028 / (n + 2) +
      771.32342877765313 / (n + 3) - 176.61502916214059 / (n + 4) +
      12.507343278686905 / (n + 5) - 0.13857109526572012 / (n + 6) +
      9.9843695780195716e-6 / (n + 7) + 1.5056327351493116e-7 / (n + 8);
    const t = n + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (n + 0.5) * Math.log(t) - t + Math.log(x);
  }

  /**
   * Critical value for t-distribution (approximate)
   */
  private tCriticalValue(df: number, alpha: number): number {
    // Approximation using standard normal for large df
    if (df > 30) {
      const z = this.normalInvCDF(1 - alpha);
      return z * (1 + z * z / (4 * df));
    }
    // Simplified approximation
    const zMap: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 5: 2.571, 10: 2.228, 20: 2.086, 30: 2.042 };
    const keys = Object.keys(zMap).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
      if (df <= key) return zMap[key];
    }
    return 1.96;
  }

  private normalInvCDF(p: number): number {
    // Rational approximation (Abramowitz & Stegun)
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const num = a[0] + a[1] * t + a[2] * t * t;
    const den = 1 + b[0] * t + b[1] * t * t + b[2] * t * t * t;
    const z = t - num / den;
    return p < 0.5 ? -z : z;
  }

  /**
   * Calculate stats for a variant
   */
  private calcVariantStats(results: any[], variant: string): ABTestStats {
    const variantResults = results.filter(r => r.variant === variant);
    if (variantResults.length === 0) {
      return { variant, sampleSize: 0, wins: 0, losses: 0, winRate: 0, avgPredictedProb: 0, roi: 0, stdDev: 0 };
    }

    const wins = variantResults.filter(r => r.outcome === true).length;
    const losses = variantResults.filter(r => r.outcome === false).length;
    const winRate = wins / variantResults.length;
    const avgPredictedProb = variantResults.reduce((sum, r) => sum + r.predictedProb, 0) / variantResults.length;

    // Simulate ROI (wins = +90.91%, losses = -100%)
    const pnls = variantResults.map(r => r.outcome ? 90.91 : -100);
    const roi = pnls.reduce((a, b) => a + b, 0) / (variantResults.length * 100);

    const mean = winRate;
    const variance = variantResults.reduce((sum, r) => sum + Math.pow((r.outcome ? 1 : 0) - mean, 2), 0) / variantResults.length;
    const stdDev = Math.sqrt(variance);

    return { variant, sampleSize: variantResults.length, wins, losses, winRate, avgPredictedProb, roi, stdDev };
  }

  // ============================================================
  // CRUD & TEST MANAGEMENT
  // ============================================================

  async createTest(userId: string, data: {
    name: string;
    description?: string;
    variantAId: string;
    variantBId: string;
    sampleSize?: number;
    confidenceLevel?: number;
  }) {
    return this.prisma.aBTest.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        variantAId: data.variantAId,
        variantBId: data.variantBId,
        sampleSize: data.sampleSize ?? 100,
        confidenceLevel: data.confidenceLevel ?? 0.95,
        status: 'DRAFT',
      },
      include: {
        variantA: { select: { id: true, name: true } },
        variantB: { select: { id: true, name: true } },
      },
    });
  }

  async startTest(id: string, userId: string) {
    const test = await this.prisma.aBTest.findFirst({ where: { id, userId } });
    if (!test) throw new NotFoundException('A/B test not found');

    return this.prisma.aBTest.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  async recordResult(testId: string, data: {
    variant: 'A' | 'B';
    outcome: boolean;
    predictedProb: number;
    actualProb?: number;
    ev?: number;
  }) {
    return this.prisma.aBTestResult.create({
      data: {
        abTestId: testId,
        variant: data.variant,
        outcome: data.outcome,
        predictedProb: data.predictedProb,
        actualProb: data.actualProb,
        ev: data.ev,
      },
    });
  }

  async analyzeTest(id: string): Promise<{
    statsA: ABTestStats;
    statsB: ABTestStats;
    tTest: TTestResult;
    recommendation: string;
  }> {
    const test = await this.prisma.aBTest.findUnique({
      where: { id },
      include: { results: true },
    });
    if (!test) throw new NotFoundException('A/B test not found');

    const statsA = this.calcVariantStats(test.results, 'A');
    const statsB = this.calcVariantStats(test.results, 'B');

    // Collect win/loss arrays for t-test
    const samplesA = test.results.filter(r => r.variant === 'A').map(r => r.outcome ? 1 : 0);
    const samplesB = test.results.filter(r => r.variant === 'B').map(r => r.outcome ? 1 : 0);

    const tTest = this.welchTTest(samplesA, samplesB, test.confidenceLevel);

    let recommendation = 'Insufficient data for recommendation.';
    if (tTest.isSignificant) {
      recommendation = tTest.winner === 'A'
        ? `Variant A (${test.variantAId}) is statistically significantly better (p=${tTest.pValue.toFixed(4)})`
        : `Variant B (${test.variantBId}) is statistically significantly better (p=${tTest.pValue.toFixed(4)})`;
    } else if (statsA.sampleSize + statsB.sampleSize >= test.sampleSize) {
      recommendation = 'No statistically significant difference found. Consider the null hypothesis.';
    } else {
      recommendation = `Need more data: ${test.sampleSize - statsA.sampleSize - statsB.sampleSize} more samples required.`;
    }

    // Update test with stats if significant
    if (tTest.isSignificant || (statsA.sampleSize + statsB.sampleSize >= test.sampleSize)) {
      await this.prisma.aBTest.update({
        where: { id },
        data: {
          pValue: tTest.pValue,
          tStatistic: tTest.tStatistic,
          isSignificant: tTest.isSignificant,
          winnerId: tTest.winner === 'A' ? test.variantAId : tTest.winner === 'B' ? test.variantBId : null,
          status: (statsA.sampleSize + statsB.sampleSize >= test.sampleSize) ? 'COMPLETED' : test.status,
          endedAt: (statsA.sampleSize + statsB.sampleSize >= test.sampleSize) ? new Date() : undefined,
        },
      });
    }

    return { statsA, statsB, tTest, recommendation };
  }

  async findAll(userId: string) {
    return this.prisma.aBTest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        variantA: { select: { id: true, name: true } },
        variantB: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
    });
  }

  async findOne(id: string) {
    const test = await this.prisma.aBTest.findUnique({
      where: { id },
      include: {
        variantA: true,
        variantB: true,
        results: { orderBy: { recordedAt: 'desc' } },
      },
    });
    if (!test) throw new NotFoundException('A/B test not found');
    return test;
  }

  async stopTest(id: string, userId: string) {
    return this.prisma.aBTest.updateMany({
      where: { id, userId },
      data: { status: 'PAUSED' },
    });
  }

  async deleteTest(id: string, userId: string) {
    await this.prisma.aBTestResult.deleteMany({ where: { abTestId: id } });
    return this.prisma.aBTest.deleteMany({ where: { id, userId } });
  }
}
