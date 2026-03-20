import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { BankrollService } from './bankroll.service';
import { CalculateKellyDto } from './dto/bankroll.dto';

@Controller('bankroll')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
export class BankrollController {
  constructor(private readonly bankrollService: BankrollService) {}

  /** Full Kelly-sized portfolio from current EV feed */
  @Get('portfolio')
  getPortfolio(
    @Query('bankroll') bankroll?: string,
    @Query('kellyFraction') kellyFraction?: string,
    @Query('minEV') minEV?: string,
    @Query('sport') sport?: string,
  ) {
    return this.bankrollService.getPortfolio(
      Number(bankroll ?? 1000),
      Number(kellyFraction ?? 0.25),
      Number(minEV ?? 0),
      sport,
    );
  }

  /** Historical performance stats from resolved BetSlips */
  @Get('stats')
  getStats() {
    return this.bankrollService.getStats();
  }

  /** Inline Kelly calculator */
  @Post('calculate')
  calculate(@Body() dto: CalculateKellyDto) {
    return this.bankrollService.calcKelly(
      dto.bankroll,
      dto.odds,
      dto.trueProb,
      dto.fraction,
    );
  }
}
