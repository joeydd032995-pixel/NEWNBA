import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerPropsService } from './player-props.service';
import { PlayerPropsController } from './player-props.controller';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  providers: [PlayerPropsService],
  controllers: [PlayerPropsController],
})
export class PlayerPropsModule {}
