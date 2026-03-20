import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { ArbitrageService } from './arbitrage.service';

@ApiTags('Arbitrage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
@Controller('arbitrage')
export class ArbitrageController {
  constructor(private arbitrageService: ArbitrageService) {}

  @Get('feed')
  getFeed(
    @Query('sport') sport?: string,
    @Query('minProfit') minProfit?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arbitrageService.getArbitrageFeed({ sport, minProfit, limit });
  }

  @Post('scan')
  scanAll() {
    return this.arbitrageService.scanAllArbitrage();
  }
}
