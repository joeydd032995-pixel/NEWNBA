import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpertPicksService } from './expert-picks.service';
import { CreateExpertPickDto, ResolveExpertPickDto } from './dto/expert-picks.dto';

@Controller('expert-picks')
@UseGuards(JwtAuthGuard)
export class ExpertPicksController {
  constructor(private readonly service: ExpertPicksService) {}

  @Post()
  create(@Body() dto: CreateExpertPickDto) {
    return this.service.createPick(dto);
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
  resolve(@Param('id') id: string, @Body() dto: ResolveExpertPickDto) {
    return this.service.resolvePick(id, dto.result);
  }
}
