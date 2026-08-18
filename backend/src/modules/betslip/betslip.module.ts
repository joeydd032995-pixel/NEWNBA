import { Module } from '@nestjs/common';
import { BetslipController } from './betslip.controller';
import { BetslipService } from './betslip.service';
import { ClosingLineJob } from './closing-line.job';
import { TrackedWagerSettlementJob } from './tracked-wager-settlement.job';
import { WagerProjectionSnapshotService } from './wager-projection-snapshot.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PlayerPropsModule } from '../player-props/player-props.module';

@Module({
  imports: [PrismaModule, PlayerPropsModule],
  controllers: [BetslipController],
  providers: [
    BetslipService,
    ClosingLineJob,
    TrackedWagerSettlementJob,
    WagerProjectionSnapshotService,
  ],
})
export class BetslipModule {}
