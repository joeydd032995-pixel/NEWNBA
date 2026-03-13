import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DataIngestionModule } from '../data-ingestion/data-ingestion.module';
import { EVModule } from '../ev/ev.module';
import { ArbitrageModule } from '../arbitrage/arbitrage.module';

@Module({
  imports: [PrismaModule, DataIngestionModule, EVModule, ArbitrageModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
