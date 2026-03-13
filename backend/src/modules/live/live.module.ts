import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { LiveService } from './live.service';
import { LiveController } from './live.controller';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  providers: [LiveService],
  controllers: [LiveController],
  exports: [LiveService],
})
export class LiveModule {}
