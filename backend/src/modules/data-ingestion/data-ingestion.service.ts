import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjuryIngestService } from './injury-ingest.service';
import { NewsIngestService } from './news-ingest.service';
import { PublicBettingService } from './public-betting.service';

@Injectable()
export class DataIngestionService {
  private readonly logger = new Logger(DataIngestionService.name);

  constructor(
    private prisma: PrismaService,
    private injuryIngest: InjuryIngestService,
    private newsIngest: NewsIngestService,
    private publicBetting: PublicBettingService,
  ) {}

  async runFullIngestion(): Promise<void> {
    this.logger.log('Running full data ingestion cycle...');
    const [injuries, news, betting] = await Promise.allSettled([
      this.injuryIngest.syncInjuries(),
      this.newsIngest.syncNews(),
      this.publicBetting.syncPublicBetting(),
    ]);
    this.logger.log(
      `Ingestion complete — injuries: ${this.unwrap(injuries)}, news: ${this.unwrap(news)}, betting: ${this.unwrap(betting)}`,
    );
  }

  /**
   * Snapshot all open MarketOdds into OddsSnapshot table.
   * Buckets by 15-minute intervals so upsert prevents duplicates within the same bucket.
   */
  async snapshotOdds(): Promise<number> {
    const now = new Date();
    const bucket = new Date(now);
    bucket.setSeconds(0, 0);
    bucket.setMinutes(Math.floor(now.getMinutes() / 15) * 15);

    const openOdds = await this.prisma.marketOdds.findMany({
      where: { isOpen: true },
      include: { book: { select: { slug: true } } },
    });

    let snapped = 0;
    for (const mo of openOdds) {
      await this.prisma.oddsSnapshot
        .upsert({
          where: { marketOddsId_snappedAt: { marketOddsId: mo.id, snappedAt: bucket } },
          create: {
            marketOddsId: mo.id,
            odds: mo.odds,
            line: mo.line,
            bookSlug: mo.book.slug,
            outcome: mo.outcome,
            snappedAt: bucket,
          },
          update: { odds: mo.odds, line: mo.line },
        })
        .catch(() => null);
      snapped++;
    }
    return snapped;
  }

  /**
   * Scan OddsHistory for significant line movements within the past 30 minutes.
   * A move is "significant" if the implied probability shifted >= thresholdPct.
   */
  async detectLineMovements(thresholdPct = 3): Promise<
    Array<{
      marketOddsId: string;
      oldOdds: number;
      newOdds: number;
      movePct: number;
      bookSlug: string;
      outcome: string;
    }>
  > {
    const since = new Date(Date.now() - 30 * 60 * 1000);

    const recent = await this.prisma.oddsHistory.findMany({
      where: { recordedAt: { gte: since } },
      include: {
        marketOdds: {
          select: { id: true, odds: true, outcome: true, book: { select: { slug: true } } },
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const moves: Array<{
      marketOddsId: string;
      oldOdds: number;
      newOdds: number;
      movePct: number;
      bookSlug: string;
      outcome: string;
    }> = [];
    const seen = new Set<string>();

    for (const hist of recent) {
      if (seen.has(hist.marketOddsId)) continue;
      const mo = hist.marketOdds;
      const oldImpl =
        hist.odds > 0 ? 100 / (hist.odds + 100) : Math.abs(hist.odds) / (Math.abs(hist.odds) + 100);
      const newImpl =
        mo.odds > 0 ? 100 / (mo.odds + 100) : Math.abs(mo.odds) / (Math.abs(mo.odds) + 100);
      const movePct = Math.abs(newImpl - oldImpl) * 100;
      if (movePct >= thresholdPct) {
        moves.push({
          marketOddsId: mo.id,
          oldOdds: hist.odds,
          newOdds: mo.odds,
          movePct: Math.round(movePct * 10) / 10,
          bookSlug: mo.book.slug,
          outcome: mo.outcome,
        });
        seen.add(hist.marketOddsId);
      }
    }
    return moves;
  }

  /**
   * Return a multiplier (0–1) to adjust EV true-prob based on a player's injury status.
   * OUT → 0 (prop is invalid), DOUBTFUL → 0.4, etc.
   */
  getInjuryEVMultiplier(injuryStatus: string): number {
    const multipliers: Record<string, number> = {
      OUT: 0,
      DOUBTFUL: 0.4,
      GTD: 0.75,
      QUESTIONABLE: 0.85,
      PROBABLE: 0.97,
      ACTIVE: 1.0,
    };
    return multipliers[injuryStatus] ?? 1.0;
  }

  private unwrap(result: PromiseSettledResult<number>): number | string {
    return result.status === 'fulfilled'
      ? result.value
      : `err: ${(result.reason as Error)?.message}`;
  }
}
