import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiveService } from './live.service';

@Controller('live')
@UseGuards(JwtAuthGuard)
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
