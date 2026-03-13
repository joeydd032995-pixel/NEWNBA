import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpertPicksService } from './expert-picks.service';

@Controller('expert-picks')
@UseGuards(JwtAuthGuard)
export class ExpertPicksController {
  constructor(private readonly service: ExpertPicksService) {}

  @Post()
  create(
    @Body() body: {
      expertName: string;
      source?: string;
      marketId: string;
      outcome: string;
      odds?: number;
      confidence?: number;
      reasoning?: string;
    },
  ) {
    return this.service.createPick(body);
  }

  @Get()
  findAll(
    @Query('marketId')   marketId?: string,
    @Query('expertName') expertName?: string,
    @Query('pending')    pending?: string,
    @Query('limit')      limit?: string,
  ) {
    return this.service.getPicks({
      marketId,
      expertName,
      pending: pending === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('contrarian')
  contrarian() {
    return this.service.getContrarian();
  }

  @Get(':marketId/consensus')
  consensus(@Param('marketId') marketId: string) {
    return this.service.getConsensus(marketId);
  }

  @Patch(':id/result')
  resolve(
    @Param('id') id: string,
    @Body('result') result: 'WIN' | 'LOSS' | 'PUSH',
  ) {
    return this.service.resolvePick(id, result);
  }
}
