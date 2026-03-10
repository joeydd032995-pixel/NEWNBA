import { Controller, Get, Query, Param, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EventStatus, MarketType } from '@prisma/client';

const EVENT_STATUSES = Object.values(EventStatus);
const MARKET_TYPES = Object.values(MarketType);

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
    if (status && !EVENT_STATUSES.includes(status as EventStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${EVENT_STATUSES.join(', ')}`);
    }
    return this.prisma.event.findMany({
      where: {
        sport: { slug },
        ...(status && { status: status as EventStatus }),
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
  async getPlayer(@Param('id') id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        team: { include: { sport: true } },
        statLines: { orderBy: { gameDate: 'desc' }, take: 20 },
      },
    });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  @Get('events/:id')
  async getEvent(@Param('id') id: string) {
    const event = await this.prisma.event.findUnique({
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
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  @Get('events/:id/markets')
  getEventMarkets(@Param('id') eventId: string, @Query('type') type?: string) {
    if (type && !MARKET_TYPES.includes(type as MarketType)) {
      throw new BadRequestException(`Invalid market type. Must be one of: ${MARKET_TYPES.join(', ')}`);
    }
    return this.prisma.market.findMany({
      where: { eventId, ...(type && { marketType: type as MarketType }) },
      include: {
        marketOdds: { include: { book: true }, where: { isOpen: true } },
      },
    });
  }
}
