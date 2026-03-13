import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BankrollService } from './bankroll.service';

@Controller('bankroll')
@UseGuards(JwtAuthGuard)
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
  calculate(
    @Body() body: { bankroll: number; odds: number; trueProb: number; fraction: number },
  ) {
    return this.bankrollService.calcKelly(
      body.bankroll,
      body.odds,
      body.trueProb,
      body.fraction,
    );
  }
}
