import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SportsService } from './sports.service';

@ApiTags('Sports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sports')
export class SportsController {
  constructor(private sportsService: SportsService) {}

  @Get()
  getSports() {
    return this.sportsService.getSports();
  }

  @Get(':slug/teams')
  getTeams(@Param('slug') slug: string) {
    return this.sportsService.getTeams(slug);
  }

  @Get(':slug/events')
  getEvents(
    @Param('slug') slug: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.sportsService.getEvents(slug, status, limit);
  }

  @Get('teams/:id/players')
  getPlayers(@Param('id') teamId: string) {
    return this.sportsService.getPlayers(teamId);
  }

  @Get('players/:id')
  getPlayer(@Param('id') id: string) {
    return this.sportsService.getPlayer(id);
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.sportsService.getEvent(id);
  }

  @Get('events/:id/markets')
  getEventMarkets(@Param('id') eventId: string, @Query('type') type?: string) {
    return this.sportsService.getEventMarkets(eventId, type);
  }
}
