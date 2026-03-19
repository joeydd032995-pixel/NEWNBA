import { IsString, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpertPickDto {
  @ApiProperty({ example: 'Joe Expert' })
  @IsString()
  expertName: string;

  @ApiProperty({ required: false, example: 'ESPN' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty()
  @IsString()
  marketId: string;

  @ApiProperty({ example: 'home_win' })
  @IsString()
  outcome: string;

  @ApiProperty({ required: false, example: -110 })
  @IsOptional()
  @IsNumber()
  odds?: number;

  @ApiProperty({ required: false, example: 0.75, description: 'Confidence 0–1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiProperty({ required: false, example: 'Strong home court advantage' })
  @IsOptional()
  @IsString()
  reasoning?: string;
}

export class ResolveExpertPickDto {
  @ApiProperty({ enum: ['WIN', 'LOSS', 'PUSH'] })
  @IsIn(['WIN', 'LOSS', 'PUSH'])
  result: 'WIN' | 'LOSS' | 'PUSH';
}
