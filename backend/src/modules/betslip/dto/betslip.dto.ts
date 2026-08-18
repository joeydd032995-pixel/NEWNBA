import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBetSlipDto {
  @ApiProperty({ example: "Tonight's picks" })
  @IsString()
  name: string;
}

export class AddItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Book.id for the exact sportsbook used at recommendation time' })
  @IsOptional()
  @IsString()
  bookId?: string;

  @ApiProperty({ example: 'over' })
  @IsString()
  outcome: string;

  @ApiProperty({ example: -110, description: 'Exact recommendation price' })
  @IsNumber()
  odds: number;

  @ApiPropertyOptional({ example: 23.5, description: 'Exact recommendation line' })
  @IsOptional()
  @IsNumber()
  recommendedLine?: number;

  @ApiPropertyOptional({ enum: ['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO', 'OTHER'] })
  @IsOptional()
  @IsIn(['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO', 'OTHER'])
  direction?: 'OVER' | 'UNDER' | 'HOME' | 'AWAY' | 'YES' | 'NO' | 'OTHER';

  @ApiPropertyOptional({ enum: ['LOW', 'MODERATE', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'MODERATE', 'HIGH'])
  confidenceBucket?: 'LOW' | 'MODERATE' | 'HIGH';

  @ApiPropertyOptional({ enum: ['PASS', 'WAIT', 'LEAN', 'BET', 'STRONG_BET'] })
  @IsOptional()
  @IsIn(['PASS', 'WAIT', 'LEAN', 'BET', 'STRONG_BET'])
  decisionClass?: 'PASS' | 'WAIT' | 'LEAN' | 'BET' | 'STRONG_BET';

  @ApiPropertyOptional({
    enum: ['POINTS', 'REBOUNDS', 'ASSISTS', 'STEALS', 'BLOCKS', 'THREES', 'MINUTES', 'PRA', 'PR', 'PA', 'RA'],
  })
  @IsOptional()
  @IsString()
  propStatType?: string;

  @ApiPropertyOptional({ enum: ['PRESEASON', 'REGULAR_SEASON', 'PLAY_IN', 'PLAYOFFS', 'FINALS'] })
  @IsOptional()
  @IsIn(['PRESEASON', 'REGULAR_SEASON', 'PLAY_IN', 'PLAYOFFS', 'FINALS'])
  seasonPhase?: 'PRESEASON' | 'REGULAR_SEASON' | 'PLAY_IN' | 'PLAYOFFS' | 'FINALS';

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  stake?: number;

  @ApiPropertyOptional({ example: 0.042, description: 'Expected value as a decimal fraction' })
  @IsOptional()
  @IsNumber()
  ev?: number;
}

export class CloseBetItemDto {
  @ApiPropertyOptional({ example: 24.5 })
  @IsOptional()
  @IsNumber()
  closingLine?: number;

  @ApiProperty({ example: -125 })
  @IsNumber()
  closingOdds: number;
}

export class UpdateSlipDto {
  @ApiPropertyOptional({ example: 'Updated name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  totalStake?: number;
}
