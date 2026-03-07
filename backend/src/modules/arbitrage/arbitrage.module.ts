import { Module } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageController } from './arbitrage.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  controllers: [ArbitrageController],
  providers: [ArbitrageService],
  exports: [ArbitrageService],
})
export class ArbitrageModule {}
