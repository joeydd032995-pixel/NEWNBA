import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DistributionInputDto {
  @ApiProperty() @IsNumber() @Min(0) floor: number;
  @ApiProperty() @IsNumber() @Min(0) median: number;
  @ApiProperty() @IsNumber() @Min(0) ceiling: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) stdDev?: number;
}

export class UncertaintyInputDto {
  @ApiProperty() @IsNumber() @Min(0) minutesStdDev: number;
  @ApiProperty() @IsNumber() @Min(0) opportunityRateStdDev: number;
  @ApiProperty() @IsNumber() @Min(0) conversionRateStdDev: number;
  @ApiProperty() @IsNumber() @Min(0) contextStdDev: number;
  @ApiProperty() @IsNumber() @Min(0) paceStdDev: number;
}

export class GameScriptInputDto {
  @ApiProperty({ enum: ['COMPETITIVE', 'FAVORITE_CONTROL', 'UNDERDOG_LEADS', 'DISRUPTION'] })
  @IsIn(['COMPETITIVE', 'FAVORITE_CONTROL', 'UNDERDOG_LEADS', 'DISRUPTION'])
  script: 'COMPETITIVE' | 'FAVORITE_CONTROL' | 'UNDERDOG_LEADS' | 'DISRUPTION';

  @ApiProperty() @IsNumber() @Min(0) @Max(1) probability: number;
  @ApiProperty() @IsNumber() @Min(0) minutesMultiplier: number;
  @ApiProperty() @IsNumber() @Min(0) opportunityMultiplier: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) conversionMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) contextMultiplier?: number;
}

export class MarketPriceDto {
  @ApiProperty() @IsNumber() @Min(0) line: number;
  @ApiProperty() @IsNumber() overOdds: number;
  @ApiProperty() @IsNumber() underOdds: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sportsbook?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingLine?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingOverOdds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingUnderOdds?: number;
}

export class ProjectionInputDto {
  @ApiProperty({ enum: ['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES', 'TURNOVERS', 'STEALS', 'BLOCKS'] })
  @IsIn(['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES', 'TURNOVERS', 'STEALS', 'BLOCKS'])
  stat: 'POINTS' | 'REBOUNDS' | 'ASSISTS' | 'THREES' | 'TURNOVERS' | 'STEALS' | 'BLOCKS';

  @ApiProperty({ enum: ['FAST', 'STANDARD', 'DEEP'] })
  @IsIn(['FAST', 'STANDARD', 'DEEP'])
  analysisMode: 'FAST' | 'STANDARD' | 'DEEP';

  @ApiProperty() @IsInt() seed: number;
  @ApiPropertyOptional({ minimum: 500 }) @IsOptional() @IsInt() @Min(500) trials?: number;

  @ApiProperty({ type: DistributionInputDto })
  @ValidateNested() @Type(() => DistributionInputDto) minutes: DistributionInputDto;

  @ApiProperty({ description: 'Fallback opportunity rate when possession-share inputs are unavailable' })
  @IsNumber() @Min(0) opportunityRatePerMinute: number;
  @ApiProperty() @IsNumber() @Min(0) conversionRate: number;
  @ApiProperty() @IsNumber() @Min(0.0001) contextAdjustment: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) baselinePace?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedPace?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional() @IsNumber() @Min(0) @Max(1) playerOpportunityShare?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedPossessions?: number;
  @ApiPropertyOptional({ description: 'Baseline points-per-possession reference used for matchup adjustment' })
  @IsOptional() @IsNumber() @Min(0.0001) baselinePpp?: number;
  @ApiPropertyOptional({ description: 'Expected points per possession in the current matchup/context' })
  @IsOptional() @IsNumber() @Min(0.0001) expectedPpp?: number;

  @ApiProperty({ type: UncertaintyInputDto })
  @ValidateNested() @Type(() => UncertaintyInputDto) uncertainty: UncertaintyInputDto;

  @ApiProperty({ type: [GameScriptInputDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => GameScriptInputDto) scripts: GameScriptInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) foulTroubleProbability?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) foulMinutesPenalty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1) blowoutProbability?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) blowoutMinutesPenalty?: number;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  dataQuality: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiPropertyOptional() @IsOptional() @IsBoolean() unresolvedAvailability?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unresolvedLineup?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unresolvedMinutesRestriction?: boolean;
}

export class AnalyzePlayerPropDto {
  @ApiProperty({ type: ProjectionInputDto })
  @ValidateNested() @Type(() => ProjectionInputDto) projection: ProjectionInputDto;

  @ApiPropertyOptional({ type: MarketPriceDto })
  @IsOptional() @ValidateNested() @Type(() => MarketPriceDto) market?: MarketPriceDto;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) alternateLines?: number[];

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() includeSamples?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() materiallyMoved?: boolean;
}
