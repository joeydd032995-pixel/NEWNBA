import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ArbitrageService } from './arbitrage.service';

@ApiTags('Arbitrage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
