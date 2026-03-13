import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { EVModule } from '../../modules/ev/ev.module';
import { ArbitrageModule } from '../../modules/arbitrage/arbitrage.module';
import { PrismaModule } from '../../modules/prisma/prisma.module';
import { OddsApiModule } from '../odds-api/odds-api.module';
import { NbaDataModule } from '../nba-data/nba-data.module';
import { BallDontLieModule } from '../balldontlie/balldontlie.module';
import { DataIngestionModule } from '../../modules/data-ingestion/data-ingestion.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';

@Module({
  imports: [ScheduleModule.forRoot(), EVModule, ArbitrageModule, PrismaModule, OddsApiModule, NbaDataModule, BallDontLieModule, DataIngestionModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
