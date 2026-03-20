import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { LiveService } from './live.service';

@Controller('live')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Get('games')
  getLiveGames() {
    return this.liveService.getLiveGames();
  }

  @Get('line-movements')
  getLineMovements(@Query('threshold') threshold?: string) {
    return this.liveService.getLineMovements(
      threshold ? Number(threshold) : 3,
    );
  }
}
