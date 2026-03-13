import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ParlayService, SGPLegInput } from './parlay.service';

@Controller('parlay')
@UseGuards(JwtAuthGuard)
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
  analyzeSGP(@Body() body: { eventId: string; legs: SGPLegInput[] }) {
    return this.parlayService.analyzeSGP(body.eventId, body.legs);
  }

  /** Standard multi-game parlay EV (legs across different events = independent) */
  @Post('standard')
  analyzeParlay(@Body() body: { legs: Array<{ marketId: string; outcome: string }> }) {
    return this.parlayService.analyzeParlay(body.legs);
  }
}
