import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { ParlayService } from './parlay.service';
import { AnalyzeSGPDto, AnalyzeParlayDto } from './dto/parlay.dto';

@Controller('parlay')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
export class ParlayController {
  constructor(private readonly parlayService: ParlayService) {}

  /** Get all active markets for an event — used to populate the leg picker */
  @Get('event/:eventId/markets')
  getEventMarkets(@Param('eventId') eventId: string) {
    return this.parlayService.getEventMarkets(eventId);
  }

  /** Suggest optimal SGP legs (positive-EV, non-contradictory) */
  @Get('sgp/suggest/:eventId')
  suggestLegs(
    @Param('eventId') eventId: string,
    @Query('maxLegs') maxLegs?: string,
  ) {
    return this.parlayService.suggestLegs(eventId, maxLegs ? Number(maxLegs) : 5);
  }

  /** Full SGP analysis: correlation matrix + adjusted EV */
  @Post('sgp/analyze')
  analyzeSGP(@Body() dto: AnalyzeSGPDto) {
    return this.parlayService.analyzeSGP(dto.eventId, dto.legs);
  }

  /** Standard multi-game parlay EV (legs across different events = independent) */
  @Post('standard')
  analyzeParlay(@Body() dto: AnalyzeParlayDto) {
    return this.parlayService.analyzeParlay(dto.legs);
  }
}
