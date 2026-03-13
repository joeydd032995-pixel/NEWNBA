import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ParlayService } from './parlay.service';
import { ParlayController } from './parlay.controller';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  providers: [ParlayService],
  controllers: [ParlayController],
  exports: [ParlayService],
})
export class ParlayModule {}
