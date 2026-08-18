import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { ParlayService } from './parlay.service';
import { EmpiricalSgpService } from './empirical-sgp.service';
import { AnalyzeSGPDto, AnalyzeParlayDto } from './dto/parlay.dto';

@Controller('parlay')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
export class ParlayController {
  constructor(
    private readonly parlayService: ParlayService,
    private readonly empiricalSgpService: EmpiricalSgpService,
  ) {}

  @Get('event/:eventId/markets')
  getEventMarkets(@Param('eventId') eventId: string) {
    return this.parlayService.getEventMarkets(eventId);
  }

  @Get('sgp/suggest/:eventId')
  suggestLegs(
    @Param('eventId') eventId: string,
    @Query('maxLegs') maxLegs?: string,
  ) {
    return this.empiricalSgpService.suggest(eventId, maxLegs ? Number(maxLegs) : 5);
  }

  @Post('sgp/analyze')
  analyzeSGP(@Body() dto: AnalyzeSGPDto) {
    return this.empiricalSgpService.analyze(dto.eventId, dto.legs);
  }

  @Post('standard')
  analyzeParlay(@Body() dto: AnalyzeParlayDto) {
    return this.parlayService.analyzeParlay(dto.legs);
  }
}
