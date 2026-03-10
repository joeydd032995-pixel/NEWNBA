import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PropStatType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlayerPropsService } from './player-props.service';

@ApiTags('Player Props')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('player-props')
export class PlayerPropsController {
  constructor(private playerPropsService: PlayerPropsService) {}

  @Get('feed')
  getFeed(
    @Query('statType')    statType?: PropStatType,
    @Query('overUnder')   overUnder?: 'over' | 'under' | 'both',
    @Query('gameId')      gameId?: string,
    @Query('minOdds')     minOdds?: number,
    @Query('maxOdds')     maxOdds?: number,
    @Query('minHitRate')  minHitRate?: number,
    @Query('maxHitRate')  maxHitRate?: number,
    @Query('lastN')       lastN?: number,
    @Query('sport')       sport?: string,
    @Query('limit')       limit?: number,
  ) {
    return this.playerPropsService.getPlayerPropsFeed({
      statType,
      overUnder,
      gameId,
      minOdds:    minOdds    ? Number(minOdds)    : undefined,
      maxOdds:    maxOdds    ? Number(maxOdds)    : undefined,
      minHitRate: minHitRate ? Number(minHitRate) : undefined,
      maxHitRate: maxHitRate ? Number(maxHitRate) : undefined,
      lastN:      lastN      ? Number(lastN)      : undefined,
      sport,
      limit:      limit      ? Number(limit)      : undefined,
    });
  }

  @Get('players')
  getPlayersWithProps() {
    return this.playerPropsService.getPlayersWithProps();
  }
}
