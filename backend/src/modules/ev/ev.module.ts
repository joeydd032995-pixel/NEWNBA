import { Module } from '@nestjs/common';
import { EVService } from './ev.service';
import { EVController } from './ev.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  controllers: [EVController],
  providers: [EVService],
  exports: [EVService],
})
export class EVModule {}
