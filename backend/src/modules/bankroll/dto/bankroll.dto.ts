import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CalculateKellyDto {
  @ApiProperty({ example: 1000, description: 'Total bankroll amount' })
  @IsNumber()
  @Min(1)
  bankroll: number;

  @ApiProperty({ example: -110, description: 'American odds' })
  @IsNumber()
  odds: number;

  @ApiProperty({ example: 0.55, description: 'True probability of winning (0–1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  trueProb: number;

  @ApiProperty({ example: 0.25, description: 'Kelly fraction multiplier (0–1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  fraction: number;
}
