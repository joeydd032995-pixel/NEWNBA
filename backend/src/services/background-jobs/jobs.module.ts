import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { EVModule } from '../../modules/ev/ev.module';
import { ArbitrageModule } from '../../modules/arbitrage/arbitrage.module';
import { PrismaModule } from '../../modules/prisma/prisma.module';
import { OddsApiModule } from '../odds-api/odds-api.module';

@Module({
  imports: [ScheduleModule.forRoot(), EVModule, ArbitrageModule, PrismaModule, OddsApiModule],
  providers: [JobsService],
})
export class JobsModule {}
