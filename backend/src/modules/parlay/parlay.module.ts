import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerPropsModule } from '../player-props/player-props.module';
import { ParlayService } from './parlay.service';
import { EmpiricalSgpService } from './empirical-sgp.service';
import { ParlayController } from './parlay.controller';

@Module({
  imports: [PrismaModule, AnalyticsModule, PlayerPropsModule],
  providers: [ParlayService, EmpiricalSgpService],
  controllers: [ParlayController],
  exports: [ParlayService, EmpiricalSgpService],
})
export class ParlayModule {}