import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { EVService } from '../ev/ev.service';

export interface PortfolioBet {
  marketOddsId: string;
  eventName: string;
  outcome: string;
  odds: number;
  bookName: string;
  trueProb: number;
  ev: number;
  evPct: number;
  kellyFull: number;
  kellyFractional: number;
  recommendedStake: number;
  publicBetPct: number | null;
}

export interface BankrollStats {
  totalBets: number;
  won: number;
  lost: number;
  pushed: number;
  pending: number;
  totalStaked: number;
  totalReturned: number;
  roi: number;
  sharpe: number;
  maxDrawdown: number;
  currentStreak: number;
  streakType: 'W' | 'L' | null;
  growthHistory: Array<{ date: string; bankroll: number; cumPnl: number }>;
}

@Injectable()
export class BankrollService {
  private readonly logger = new Logger(BankrollService.name);

  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
    private evService: EVService,
  ) {}

  /**
   * Build a Kelly-sized portfolio from the current +EV feed.
   * Applies fractional Kelly and square-root scaling for simultaneous bets.
   */
  async getPortfolio(
    bankroll: number,
    kellyFraction: number,
    minEVPct = 0,
    sport?: string,
  ): Promise<{ bets: PortfolioBet[]; totalStake: number; betsAtRisk: number }> {
    const feed = await this.evService.getEVFeed({
      sport,
      minEV: minEVPct,
      limit: 100,
    });

    // Build portfolio items
    const bets: PortfolioBet[] = [];
    for (const item of feed) {
      const kellyFull = item.kellyFraction ?? 0;
      if (kellyFull <= 0) continue;
      bets.push({
        marketOddsId: item.marketOddsId,
        eventName: `${item.market?.event?.homeTeam?.abbreviation ?? ''} vs ${item.market?.event?.awayTeam?.abbreviation ?? ''}`,
        outcome: item.outcome,
        odds: item.odds,
        bookName: item.bookName,
        trueProb: item.trueProb,
        ev: item.ev,
        evPct: item.evPct,
        kellyFull,
        kellyFractional: kellyFull * kellyFraction,
        recommendedStake: 0, // set below
        publicBetPct: (item as any).publicSplit?.pctBets ?? null,
      });
    }

    if (bets.length === 0) {
      return { bets: [], totalStake: 0, betsAtRisk: 0 };
    }

    // Square-root scaling: divide Kelly by sqrt(N) to account for correlation risk
    const sqrtN = Math.sqrt(bets.length);
    let totalStake = 0;
    for (const bet of bets) {
      const stake = bankroll * bet.kellyFractional / sqrtN;
      // Cap single bet at 5% of bankroll for safety
      bet.recommendedStake = Math.min(Math.round(stake * 100) / 100, bankroll * 0.05);
      totalStake += bet.recommendedStake;
    }

    return { bets, totalStake, betsAtRisk: bets.length };
  }

  /**
   * Calculate bankroll performance stats from resolved BetSlips.
   */
  async getStats(userId?: string): Promise<BankrollStats> {
    const where = userId ? { userId } : {};
    const slips = await this.prisma.betSlip.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    let won = 0, lost = 0, pushed = 0, pending = 0;
    let totalStaked = 0, totalReturned = 0;
    let streak = 0;
    let streakType: 'W' | 'L' | null = null;
    const growthHistory: Array<{ date: string; bankroll: number; cumPnl: number }> = [];
    let cumPnl = 0;

    // Collect per-bet returns for Sharpe
    const returns: number[] = [];

    for (const slip of slips) {
      const stake = slip.totalStake ?? slip.items.reduce((s, i) => s + i.stake, 0);
      totalStaked += stake;

      if (slip.status === 'WON') {
        const ret = stake * (slip.totalOdds ?? 1);
        totalReturned += ret;
        returns.push((ret - stake) / stake);
        cumPnl += ret - stake;
        won++;
        streak = streakType === 'W' ? streak + 1 : 1;
        streakType = 'W';
      } else if (slip.status === 'LOST') {
        returns.push(-1);
        cumPnl -= stake;
        lost++;
        streak = streakType === 'L' ? streak + 1 : 1;
        streakType = 'L';
      } else if (slip.status === 'VOID') {
        pushed++;
        totalReturned += stake;
        streak = 0;
        streakType = null;
      } else {
        pending++;
      }

      growthHistory.push({
        date: slip.createdAt.toISOString().slice(0, 10),
        bankroll: 1000 + cumPnl, // normalized to $1000 start
        cumPnl,
      });
    }

    const roi = totalStaked > 0 ? (totalReturned - totalStaked) / totalStaked : 0;
    const sharpe = this.calcSharpe(returns);
    const maxDrawdown = this.calcMaxDrawdown(growthHistory.map(g => g.bankroll));

    return {
      totalBets: slips.length,
      won,
      lost,
      pushed,
      pending,
      totalStaked,
      totalReturned,
      roi,
      sharpe,
      maxDrawdown,
      currentStreak: streak,
      streakType,
      growthHistory,
    };
  }

  /**
   * Given odds and true probability, compute full / fractional Kelly stakes.
   */
  calcKelly(
    bankroll: number,
    odds: number,
    trueProb: number,
    fraction: number,
  ): {
    kellyFull: number;
    kellyFractional: number;
    stake: number;
    ev: number;
    evPct: number;
  } {
    const { kellyFraction, ev, evPct } = this.analytics.calcEV(trueProb, odds);
    const stake = bankroll * kellyFraction * fraction;
    return {
      kellyFull: kellyFraction,
      kellyFractional: kellyFraction * fraction,
      stake: Math.round(stake * 100) / 100,
      ev,
      evPct,
    };
  }

  // ─── Private helpers ───────────────────────────────────────

  private calcSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    return std > 0 ? mean / std : 0;
  }

  private calcMaxDrawdown(bankrollSeries: number[]): number {
    let peak = bankrollSeries[0] ?? 0;
    let maxDD = 0;
    for (const val of bankrollSeries) {
      if (val > peak) peak = val;
      const dd = peak > 0 ? (peak - val) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
}
