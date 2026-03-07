import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EVService } from './ev.service';

@ApiTags('EV')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ev')
export class EVController {
  constructor(private evService: EVService) {}

  @Get('feed')
  getEVFeed(
    @Query('sport') sport?: string,
    @Query('minEV') minEV?: number,
    @Query('marketType') marketType?: string,
    @Query('limit') limit?: number,
  ) {
    return this.evService.getEVFeed({ sport, minEV, marketType, limit });
  }

  @Post('scan')
  scanAll() {
    return this.evService.scanAllMarkets();
  }

  @Post('market/:marketId')
  calcMarketEV(@Param('marketId') marketId: string) {
    return this.evService.calculateEVForMarket(marketId);
  }
}
