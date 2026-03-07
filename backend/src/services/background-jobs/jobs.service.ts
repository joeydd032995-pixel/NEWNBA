import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EVService } from '../../modules/ev/ev.service';
import { ArbitrageService } from '../../modules/arbitrage/arbitrage.service';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private isEVScanRunning = false;
  private isArbScanRunning = false;

  constructor(
    private evService: EVService,
    private arbitrageService: ArbitrageService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.logger.log('Background jobs service initialized');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runEVCalculation() {
    if (this.isEVScanRunning) return;
    this.isEVScanRunning = true;
    try {
      this.logger.debug('Running EV calculation job...');
      const results = await this.evService.scanAllMarkets();
      this.logger.debug(`EV scan complete: ${results.length} positive EV opportunities found`);
    } catch (e) {
      this.logger.error('EV calculation job failed:', e.message);
    } finally {
      this.isEVScanRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runArbitrageScan() {
    if (this.isArbScanRunning) return;
    this.isArbScanRunning = true;
    try {
      this.logger.debug('Running arbitrage scan job...');
      const opps = await this.arbitrageService.scanAllArbitrage();
      this.logger.debug(`Arb scan complete: ${opps.length} arbitrage opportunities found`);
    } catch (e) {
      this.logger.error('Arbitrage scan job failed:', e.message);
    } finally {
      this.isArbScanRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredOpportunities() {
    try {
      const deleted = await this.prisma.arbitrageOpportunity.updateMany({
        where: { expiresAt: { lt: new Date() }, isActive: true },
        data: { isActive: false },
      });
      if (deleted.count > 0) {
        this.logger.debug(`Marked ${deleted.count} expired arbitrage opportunities as inactive`);
      }
    } catch (e) {
      this.logger.error('Cleanup job failed:', e.message);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async simulateOddsMovement() {
    try {
      // Simulate small odds movements for development
      const marketOdds = await this.prisma.marketOdds.findMany({
        where: { isOpen: true },
        take: 100,
      });

      for (const mo of marketOdds) {
        const movement = (Math.random() - 0.5) * 4; // +/- 2 points
        const newOdds = Math.round(mo.odds + movement);

        if (newOdds !== mo.odds) {
          // Save to history
          await this.prisma.oddsHistory.create({
            data: { marketOddsId: mo.id, odds: mo.odds, line: mo.line },
          });

          // Update current odds
          await this.prisma.marketOdds.update({
            where: { id: mo.id },
            data: { odds: newOdds },
          });
        }
      }
    } catch (e) {
      this.logger.error('Odds simulation failed:', e.message);
    }
  }
}
