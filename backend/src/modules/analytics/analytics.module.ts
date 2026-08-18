import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CustomModelService } from './custom-model.service';
import { OptimizationService } from './optimization.service';
import { EnsembleService } from './ensemble.service';
import { ABTestingService } from './ab-testing.service';
import { PerformanceTrackingService } from './performance-tracking.service';
import { PostBetReviewService } from './post-bet-review.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    CustomModelService,
    OptimizationService,
    EnsembleService,
    ABTestingService,
    PerformanceTrackingService,
    PostBetReviewService,
  ],
  exports: [
    AnalyticsService,
    CustomModelService,
    OptimizationService,
    EnsembleService,
    ABTestingService,
    PerformanceTrackingService,
    PostBetReviewService,
  ],
})
export class AnalyticsModule {}
