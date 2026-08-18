import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBetSlipDto {
  @ApiProperty({ example: 'Tonight\'s picks' })
  @IsString()
  name: string;
}

export class AddItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiProperty({ required: false, description: 'Sportsbook ID used for this exact wager' })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiProperty({ example: 'over' })
  @IsString()
  outcome: string;

  @ApiProperty({ example: -110 })
  @IsNumber()
  odds: number;

  @ApiProperty({ required: false, example: 25.5, description: 'Exact line at recommendation time' })
  @IsOptional()
  @IsNumber()
  recommendedLine?: number;

  @ApiProperty({ required: false, enum: ['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO', 'OTHER'] })
  @IsOptional()
  @IsIn(['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO', 'OTHER'])
  direction?: string;

  @ApiProperty({ required: false, enum: ['LOW', 'MODERATE', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MODERATE', 'HIGH'])
  confidenceBucket?: string;

  @ApiProperty({ required: false, enum: ['PASS', 'WAIT', 'LEAN', 'BET', 'STRONG_BET'] })
  @IsOptional()
  @IsIn(['PASS', 'WAIT', 'LEAN', 'BET', 'STRONG_BET'])
  decisionClass?: string;

  @ApiProperty({
    required: false,
    enum: [
      'POINTS', 'REBOUNDS', 'ASSISTS', 'STEALS', 'BLOCKS', 'THREES',
      'TURNOVERS', 'STOCKS', 'DOUBLE_DOUBLE', 'TRIPLE_DOUBLE', 'MINUTES',
      'PRA', 'PR', 'PA', 'RA',
    ],
  })
  @IsOptional()
  @IsIn([
    'POINTS', 'REBOUNDS', 'ASSISTS', 'STEALS', 'BLOCKS', 'THREES',
    'TURNOVERS', 'STOCKS', 'DOUBLE_DOUBLE', 'TRIPLE_DOUBLE', 'MINUTES',
    'PRA', 'PR', 'PA', 'RA',
  ])
  propStatType?: string;

  @ApiProperty({ required: false, enum: ['PRESEASON', 'REGULAR_SEASON', 'PLAY_IN', 'PLAYOFFS', 'FINALS'] })
  @IsOptional()
  @IsIn(['PRESEASON', 'REGULAR_SEASON', 'PLAY_IN', 'PLAYOFFS', 'FINALS'])
  seasonPhase?: string;

  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @IsNumber()
  stake?: number;

  @ApiProperty({ required: false, example: 4.2 })
  @IsOptional()
  @IsNumber()
  ev?: number;
}

export class CloseBetItemDto {
  @ApiProperty({ required: false, example: 26.5 })
  @IsOptional()
  @IsNumber()
  closingLine?: number;

  @ApiProperty({ example: -125 })
  @IsNumber()
  closingOdds: number;
}

export class UpdateSlipDto {
  @ApiProperty({ required: false, example: 'Updated name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 200 })
  @IsOptional()
  @IsNumber()
  totalStake?: number;
}
