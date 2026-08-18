import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerPropsService } from './player-props.service';
import { PlayerPropsController } from './player-props.controller';
import { PlayerPropProjectionAssembler } from './player-prop-projection.assembler';

@Module({
  imports: [PrismaModule, AnalyticsModule],
  providers: [PlayerPropsService, PlayerPropProjectionAssembler],
  controllers: [PlayerPropsController],
  exports: [PlayerPropsService, PlayerPropProjectionAssembler],
})
export class PlayerPropsModule {}
