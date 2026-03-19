import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SGPLegInputDto {
  @ApiProperty({ example: 'market-uuid' })
  @IsString()
  marketId: string;

  @ApiProperty({ example: 'over' })
  @IsString()
  outcome: string;
}

export class AnalyzeSGPDto {
  @ApiProperty({ example: 'event-uuid' })
  @IsString()
  eventId: string;

  @ApiProperty({ type: [SGPLegInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SGPLegInputDto)
  legs: SGPLegInputDto[];
}

export class ParlayLegDto {
  @ApiProperty({ example: 'market-uuid' })
  @IsString()
  marketId: string;

  @ApiProperty({ example: 'home_win' })
  @IsString()
  outcome: string;
}

export class AnalyzeParlayDto {
  @ApiProperty({ type: [ParlayLegDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParlayLegDto)
  legs: ParlayLegDto[];
}
