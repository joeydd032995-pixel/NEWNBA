import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Sports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sports')
export class SportsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  getSports() {
    return this.prisma.sport.findMany({ where: { isActive: true } });
  }

  @Get(':slug/teams')
  getTeams(@Param('slug') slug: string) {
    return this.prisma.team.findMany({
      where: { sport: { slug }, isActive: true },
      include: { _count: { select: { players: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':slug/events')
  getEvents(
    @Param('slug') slug: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.prisma.event.findMany({
      where: {
        sport: { slug },
        ...(status && { status: status as any }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        _count: { select: { markets: true } },
      },
      orderBy: { startTime: 'asc' },
      take: limit ? Number(limit) : 50,
    });
  }

  @Get('teams/:id/players')
  getPlayers(@Param('id') teamId: string) {
    return this.prisma.player.findMany({
      where: { teamId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('players/:id')
  getPlayer(@Param('id') id: string) {
    return this.prisma.player.findUnique({
      where: { id },
      include: {
        team: { include: { sport: true } },
        statLines: { orderBy: { gameDate: 'desc' }, take: 20 },
      },
    });
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        sport: true,
        markets: {
          include: { marketOdds: { include: { book: true } } },
        },
      },
    });
  }

  @Get('events/:id/markets')
  getEventMarkets(@Param('id') eventId: string, @Query('type') type?: string) {
    return this.prisma.market.findMany({
      where: { eventId, ...(type && { marketType: type as any }) },
      include: {
        marketOdds: { include: { book: true }, where: { isOpen: true } },
      },
    });
  }
}
