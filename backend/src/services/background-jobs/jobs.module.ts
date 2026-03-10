import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { EVModule } from '../../modules/ev/ev.module';
import { ArbitrageModule } from '../../modules/arbitrage/arbitrage.module';
import { PrismaModule } from '../../modules/prisma/prisma.module';
import { OddsApiModule } from '../odds-api/odds-api.module';
import { NbaDataModule } from '../nba-data/nba-data.module';
import { BallDontLieModule } from '../balldontlie/balldontlie.module';

@Module({
  imports: [ScheduleModule.forRoot(), EVModule, ArbitrageModule, PrismaModule, OddsApiModule, NbaDataModule, BallDontLieModule],
  providers: [JobsService],
})
export class JobsModule {}
