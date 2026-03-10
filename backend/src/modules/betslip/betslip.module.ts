import { Module } from '@nestjs/common';
import { BetslipController } from './betslip.controller';
import { BetslipService } from './betslip.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BetslipController],
  providers: [BetslipService],
})
export class BetslipModule {}
