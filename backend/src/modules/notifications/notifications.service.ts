import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataIngestionService } from '../data-ingestion/data-ingestion.service';
import { InjuryIngestService } from '../data-ingestion/injury-ingest.service';
import { EVService } from '../ev/ev.service';
import { ArbitrageService } from '../arbitrage/arbitrage.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private dataIngestion: DataIngestionService,
    private injuryIngest: InjuryIngestService,
    private evService: EVService,
    private arbitrageService: ArbitrageService,
  ) {}

  // ─── Core notification operations ────────────────────────────

  async getUnread(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getAll(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { marked: count };
  }

  private async createNotification(
    userId: string,
    alertId: string | null,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        alertId,
        type,
        title,
        body,
        data: data ?? undefined,
      },
    });
  }

  // ─── Alert evaluation engine ──────────────────────────────────

  /**
   * Evaluate all active alerts for all users (called by cron every 5 min).
   * Returns the total number of notifications fired.
   */
  async evaluateAllAlerts(): Promise<number> {
    const activeAlerts = await this.prisma.alert.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, type: true, conditions: true, lastTriggered: true },
    });

    let fired = 0;
    for (const alert of activeAlerts) {
      try {
        const count = await this.evaluateAlert(alert);
        fired += count;
      } catch (e) {
        this.logger.warn(`Alert ${alert.id} evaluation failed: ${e.message}`);
      }
    }
    return fired;
  }

  /**
   * Evaluate alerts for a single user (called on demand).
   */
  async evaluateAlertsForUser(userId: string): Promise<number> {
    const alerts = await this.prisma.alert.findMany({
      where: { userId, isActive: true },
      select: { id: true, userId: true, type: true, conditions: true, lastTriggered: true },
    });
    let fired = 0;
    for (const alert of alerts) {
      fired += await this.evaluateAlert(alert);
    }
    return fired;
  }

  private async evaluateAlert(alert: {
    id: string;
    userId: string;
    type: string;
    conditions: any;
    lastTriggered: Date | null;
  }): Promise<number> {
    // Cooldown: don't re-fire same alert within 10 minutes
    if (alert.lastTriggered) {
      const cooldownMs = 10 * 60 * 1000;
      if (Date.now() - alert.lastTriggered.getTime() < cooldownMs) return 0;
    }

    const cond = alert.conditions as Record<string, any>;
    let fired = 0;

    switch (alert.type) {
      case 'EV_THRESHOLD':
        fired = await this.checkEVThreshold(alert.id, alert.userId, cond);
        break;
      case 'ARBITRAGE':
        fired = await this.checkArbitrage(alert.id, alert.userId, cond);
        break;
      case 'LINE_MOVEMENT':
        fired = await this.checkLineMovement(alert.id, alert.userId, cond);
        break;
      case 'INJURY':
        fired = await this.checkInjury(alert.id, alert.userId, cond);
        break;
      case 'CONTRARIAN':
        fired = await this.checkContrarian(alert.id, alert.userId, cond);
        break;
      default:
        break;
    }

    if (fired > 0) {
      await this.prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggered: new Date() },
      });
    }

    return fired;
  }

  // ─── Individual trigger checks ────────────────────────────────

  private async checkEVThreshold(alertId: string, userId: string, cond: any): Promise<number> {
    const minEV = Number(cond.minEV ?? 5) / 100;
    const feed = await this.evService.getEVFeed({ minEV: minEV * 100, limit: 5 });
    if (feed.length === 0) return 0;

    const top = feed[0];
    const evPct = (top.evPct * 100).toFixed(1);
    await this.createNotification(
      userId, alertId, 'EV_THRESHOLD',
      `+EV Alert: ${evPct}% edge found`,
      `${top.outcome} @ ${top.bookName} (${top.odds > 0 ? '+' : ''}${top.odds}) has ${evPct}% EV. ${feed.length} total opportunities.`,
      { marketOddsId: top.marketOddsId, evPct: top.evPct, odds: top.odds },
    );
    return 1;
  }

  private async checkArbitrage(alertId: string, userId: string, cond: any): Promise<number> {
    const minProfit = Number(cond.minProfit ?? 1);
    const opps = await this.prisma.arbitrageOpportunity.findMany({
      where: { isActive: true, profitPct: { gte: minProfit } },
      orderBy: { profitPct: 'desc' },
      take: 3,
      include: { market: { include: { event: { include: { homeTeam: true, awayTeam: true } } } } },
    });
    if (opps.length === 0) return 0;

    const top = opps[0];
    const eventName = `${top.market?.event?.awayTeam?.abbreviation ?? '?'} @ ${top.market?.event?.homeTeam?.abbreviation ?? '?'}`;
    await this.createNotification(
      userId, alertId, 'ARBITRAGE',
      `Arbitrage: ${top.profitPct.toFixed(2)}% guaranteed profit`,
      `${eventName} — ${opps.length} arb opportunity${opps.length > 1 ? 'ies' : 'y'} above ${minProfit}%. Lock in profit now.`,
      { marketId: top.marketId, profitPct: top.profitPct },
    );
    return 1;
  }

  private async checkLineMovement(alertId: string, userId: string, cond: any): Promise<number> {
    const threshold = Number(cond.threshold ?? 3);
    const moves = await this.dataIngestion.detectLineMovements(threshold);
    if (moves.length === 0) return 0;

    const top = moves.sort((a, b) => b.movePct - a.movePct)[0];
    const dir = top.newOdds > top.oldOdds ? 'shortening' : 'drifting';
    await this.createNotification(
      userId, alertId, 'LINE_MOVEMENT',
      `Line moved ${top.movePct.toFixed(1)}% on ${top.bookSlug}`,
      `${top.outcome} ${dir} — ${top.oldOdds > 0 ? '+' : ''}${top.oldOdds} → ${top.newOdds > 0 ? '+' : ''}${top.newOdds}. ${moves.length} total move(s) detected.`,
      { marketOddsId: top.marketOddsId, movePct: top.movePct, bookSlug: top.bookSlug },
    );
    return 1;
  }

  private async checkInjury(alertId: string, userId: string, cond: any): Promise<number> {
    const statusFilter: string[] = cond.statuses ?? ['OUT', 'DOUBTFUL'];
    const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 min

    const recent = await this.prisma.injuryReport.findMany({
      where: {
        reportedAt: { gte: since },
        status: { in: statusFilter as any[] },
      },
      include: { player: { select: { name: true, team: { select: { abbreviation: true } } } } },
      orderBy: { reportedAt: 'desc' },
      take: 5,
    });

    if (recent.length === 0) return 0;

    const top = recent[0];
    const teamStr = top.player?.team?.abbreviation ? ` (${top.player.team.abbreviation})` : '';
    await this.createNotification(
      userId, alertId, 'INJURY',
      `Injury: ${top.player?.name ?? 'Player'}${teamStr} — ${top.status}`,
      top.description ?? `${top.player?.name} has been listed ${top.status}. ${recent.length > 1 ? `+${recent.length - 1} other update(s).` : ''}`,
      { playerId: top.playerId, status: top.status },
    );
    return 1;
  }

  private async checkContrarian(alertId: string, userId: string, cond: any): Promise<number> {
    const minExpertLean = Number(cond.minExpertLean ?? 60); // % of experts on one side
    const maxPublicPct = Number(cond.maxPublicPct ?? 40);   // public on same side

    // Find markets where experts lean one way but public is mostly on the other
    const recentSince = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const picks = await this.prisma.expertPick.findMany({
      where: { pickedAt: { gte: recentSince }, result: null },
      include: {
        market: {
          include: {
            event: { include: { homeTeam: true, awayTeam: true } },
            publicBettingSplits: { orderBy: { snappedAt: 'desc' }, take: 2 },
          },
        },
      },
    });

    if (picks.length === 0) return 0;

    // Group picks by marketId
    const marketMap = new Map<string, { picks: any[]; market: any }>();
    for (const pick of picks) {
      if (!marketMap.has(pick.marketId)) {
        marketMap.set(pick.marketId, { picks: [], market: pick.market });
      }
      marketMap.get(pick.marketId)!.picks.push(pick);
    }

    for (const [, { picks: mPicks, market }] of marketMap) {
      if (mPicks.length < 2) continue;

      // Count expert lean for each outcome
      const outcomeCounts: Record<string, number> = {};
      for (const p of mPicks) {
        outcomeCounts[p.outcome] = (outcomeCounts[p.outcome] ?? 0) + 1;
      }
      const topOutcome = Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1])[0];
      const expertLeanPct = (topOutcome[1] / mPicks.length) * 100;
      if (expertLeanPct < minExpertLean) continue;

      // Check public split for same outcome
      const publicSplit = market?.publicBettingSplits?.find(
        (s: any) => s.outcome.toLowerCase().includes(topOutcome[0].toLowerCase()),
      );
      if (!publicSplit || publicSplit.pctBets > maxPublicPct) continue;

      const eventName = `${market?.event?.awayTeam?.abbreviation ?? '?'} @ ${market?.event?.homeTeam?.abbreviation ?? '?'}`;
      await this.createNotification(
        userId, alertId, 'CONTRARIAN',
        `Contrarian Signal: ${topOutcome[0]}`,
        `${expertLeanPct.toFixed(0)}% of experts back ${topOutcome[0]} in ${eventName}, but only ${publicSplit.pctBets.toFixed(0)}% of public money agrees.`,
        { marketId: market.id, outcome: topOutcome[0], expertLeanPct, publicPct: publicSplit.pctBets },
      );
      return 1;
    }
    return 0;
  }
}
