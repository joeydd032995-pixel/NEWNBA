import { Module } from '@nestjs/common';
import { BankrollService } from './bankroll.service';
import { BankrollController } from './bankroll.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EVModule } from '../ev/ev.module';

@Module({
  imports: [PrismaModule, AnalyticsModule, EVModule],
  providers: [BankrollService],
  controllers: [BankrollController],
  exports: [BankrollService],
})
export class BankrollModule {}
