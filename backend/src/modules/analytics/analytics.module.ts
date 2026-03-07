import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CustomModelService } from './custom-model.service';
import { PerformanceTrackingService } from './performance-tracking.service';
import { OptimizationService } from './optimization.service';
import { EnsembleService } from './ensemble.service';
import { ABTestingService } from './ab-testing.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    CustomModelService,
    PerformanceTrackingService,
    OptimizationService,
    EnsembleService,
    ABTestingService,
  ],
  exports: [AnalyticsService, CustomModelService, PerformanceTrackingService],
})
export class AnalyticsModule {}
