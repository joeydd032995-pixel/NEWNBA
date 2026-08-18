import { Controller, Get, Param, ParseFloatPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PropStatType } from '@prisma/client';
import { PlayerPropsService } from './player-props.service';

@ApiTags('Player Props')
@Controller('player-props')
export class PlayerPropsController {
  constructor(private readonly playerPropsService: PlayerPropsService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Opportunity-First player-prop feed with contextual historical hit rates' })
  @ApiQuery({ name: 'statType', required: false, enum: PropStatType })
  @ApiQuery({ name: 'overUnder', required: false, enum: ['over', 'under', 'both'] })
  @ApiQuery({ name: 'gameId', required: false })
  @ApiQuery({ name: 'minOdds', required: false, type: Number })
  @ApiQuery({ name: 'maxOdds', required: false, type: Number })
  @ApiQuery({ name: 'minHitRate', required: false, type: Number, description: 'Contextual screen only; never used as true probability' })
  @ApiQuery({ name: 'maxHitRate', required: false, type: Number, description: 'Contextual screen only; never used as true probability' })
  @ApiQuery({ name: 'lastN', required: false, type: Number })
  @ApiQuery({ name: 'sport', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'mode', required: false, enum: ['FAST', 'STANDARD', 'DEEP'] })
  getFeed(
    @Query('statType') statType?: PropStatType,
    @Query('overUnder') overUnder?: 'over' | 'under' | 'both',
    @Query('gameId') gameId?: string,
    @Query('minOdds') minOdds?: string,
    @Query('maxOdds') maxOdds?: string,
    @Query('minHitRate') minHitRate?: string,
    @Query('maxHitRate') maxHitRate?: string,
    @Query('lastN') lastN?: string,
    @Query('sport') sport?: string,
    @Query('limit') limit?: string,
    @Query('mode') mode?: 'FAST' | 'STANDARD' | 'DEEP',
  ) {
    return this.playerPropsService.getPlayerPropsFeed({
      statType,
      overUnder,
      gameId,
      minOdds: minOdds !== undefined ? Number(minOdds) : undefined,
      maxOdds: maxOdds !== undefined ? Number(maxOdds) : undefined,
      minHitRate: minHitRate !== undefined ? Number(minHitRate) : undefined,
      maxHitRate: maxHitRate !== undefined ? Number(maxHitRate) : undefined,
      lastN: lastN !== undefined ? Number(lastN) : undefined,
      sport,
      limit: limit !== undefined ? Number(limit) : undefined,
      mode,
    });
  }

  @Get('players')
  @ApiOperation({ summary: 'List players with active standard or alternate prop markets' })
  getPlayers() {
    return this.playerPropsService.getPlayersWithProps();
  }

  @Get('cheat-sheet/:playerId')
  @ApiOperation({ summary: 'Player contextual trend and matchup cheat sheet' })
  @ApiQuery({ name: 'statType', required: true, enum: PropStatType })
  @ApiQuery({ name: 'line', required: true, type: Number })
  getCheatSheet(
    @Param('playerId') playerId: string,
    @Query('statType') statType: PropStatType,
    @Query('line', ParseFloatPipe) line: number,
  ) {
    return this.playerPropsService.getCheatSheet(playerId, statType, line);
  }

  @Get('analyzer/:marketId')
  @ApiOperation({ summary: 'Deep analyzer data with Opportunity-First projection distribution' })
  getAnalyzer(@Param('marketId') marketId: string) {
    return this.playerPropsService.getAnalyzerData(marketId);
  }
}
