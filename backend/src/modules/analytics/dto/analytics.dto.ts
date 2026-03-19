import {
  IsString, IsOptional, IsBoolean, IsNumber, IsArray,
  IsIn, IsObject, ValidateNested, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ─── Custom Model DTOs ───────────────────────────────────────────────────────

export class CreateModelDto {
  @ApiProperty({ example: 'My Model' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: { efg: 0.4, ts: 0.3 } })
  weights: Record<string, number>;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateModelDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  weights?: Record<string, number>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Formula DTOs ────────────────────────────────────────────────────────────

export class TrueShootingDto {
  @ApiProperty({ example: 25 })
  @IsNumber()
  points: number;

  @ApiProperty({ example: 15 })
  @IsNumber()
  fga: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  fta: number;
}

export class EFGDto {
  @ApiProperty({ example: 8 })
  @IsNumber()
  fg: number;

  @ApiProperty({ example: 3 })
  @IsNumber()
  fg3: number;

  @ApiProperty({ example: 15 })
  @IsNumber()
  fga: number;
}

export class PythagoreanDto {
  @ApiProperty({ example: 115 })
  @IsNumber()
  pointsFor: number;

  @ApiProperty({ example: 108 })
  @IsNumber()
  pointsAgainst: number;
}

export class FourFactorsDto {
  @ApiProperty({ example: 0.55 })
  @IsNumber()
  efgPct: number;

  @ApiProperty({ example: 0.13 })
  @IsNumber()
  tovPct: number;

  @ApiProperty({ example: 0.28 })
  @IsNumber()
  orbPct: number;

  @ApiProperty({ example: 0.32 })
  @IsNumber()
  ftr: number;
}

export class CalcEVDto {
  @ApiProperty({ example: 0.55 })
  @IsNumber()
  trueProb: number;

  @ApiProperty({ example: -110 })
  @IsNumber()
  odds: number;

  @ApiProperty({ required: false, example: 100 })
  @IsOptional()
  @IsNumber()
  stake?: number;
}

export class RemoveVigDto {
  @ApiProperty({ example: [-110, -110], type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  odds: number[];
}

// ─── Performance Tracking DTOs ───────────────────────────────────────────────

export class RecordPredictionDto {
  @ApiProperty()
  @IsString()
  modelId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiProperty({ example: 'home_win' })
  @IsString()
  outcome: string;

  @ApiProperty({ example: 0.62 })
  @IsNumber()
  predictedProb: number;

  @ApiProperty({ example: 0.8 })
  @IsNumber()
  confidence: number;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: any;
}

export class ResolvePerformancePredictionDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  actualResult: boolean;
}

// ─── Genetic Algorithm Optimization DTOs ────────────────────────────────────

export class GAFitnessWeightsDto {
  @ApiProperty({ example: 0.4 })
  @IsNumber()
  @Min(0) @Max(1)
  roi: number;

  @ApiProperty({ example: 0.3 })
  @IsNumber()
  @Min(0) @Max(1)
  winRate: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  @Min(0) @Max(1)
  sharpeRatio: number;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0) @Max(1)
  calibration: number;
}

export class GAConfigDto {
  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(10) @Max(200)
  populationSize: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(10) @Max(100)
  maxGenerations: number;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0.01) @Max(0.3)
  mutationRate: number;

  @ApiProperty({ example: 0.8 })
  @IsNumber()
  @Min(0.6) @Max(0.9)
  crossoverRate: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1) @Max(5)
  elitismCount: number;

  @ApiProperty({ type: GAFitnessWeightsDto })
  @ValidateNested()
  @Type(() => GAFitnessWeightsDto)
  fitnessWeights: GAFitnessWeightsDto;

  @ApiProperty({ type: [String], example: ['efg', 'ts', 'netRtg'] })
  @IsArray()
  @IsString({ each: true })
  weightKeys: string[];
}

export class CreateOptimizationRunDto {
  @ApiProperty({ example: 'Run #1' })
  @IsString()
  name: string;

  @ApiProperty({ type: GAConfigDto })
  @ValidateNested()
  @Type(() => GAConfigDto)
  config: GAConfigDto;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  runNow?: boolean;
}

// ─── Ensemble DTOs ────────────────────────────────────────────────────────────

export class EnsembleComponentDto {
  @ApiProperty()
  @IsString()
  modelId: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber()
  @Min(0) @Max(1)
  weight: number;
}

export class CreateEnsembleDto {
  @ApiProperty({ example: 'My Ensemble' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['WEIGHTED_AVERAGE', 'VOTING', 'STACKING', 'BOOSTING'] })
  @IsIn(['WEIGHTED_AVERAGE', 'VOTING', 'STACKING', 'BOOSTING'])
  strategy: string;

  @ApiProperty({ type: [EnsembleComponentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnsembleComponentDto)
  components: EnsembleComponentDto[];
}

export class UpdateEnsembleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: ['WEIGHTED_AVERAGE', 'VOTING', 'STACKING', 'BOOSTING'] })
  @IsOptional()
  @IsIn(['WEIGHTED_AVERAGE', 'VOTING', 'STACKING', 'BOOSTING'])
  strategy?: string;

  @ApiProperty({ required: false, type: [EnsembleComponentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnsembleComponentDto)
  components?: EnsembleComponentDto[];
}

// ─── A/B Testing DTOs ────────────────────────────────────────────────────────

export class CreateABTestDto {
  @ApiProperty({ example: 'Efficiency vs Balanced' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  variantAId: string;

  @ApiProperty()
  @IsString()
  variantBId: string;

  @ApiProperty({ required: false, example: 100 })
  @IsOptional()
  @IsNumber()
  sampleSize?: number;

  @ApiProperty({ required: false, example: 0.95 })
  @IsOptional()
  @IsNumber()
  @Min(0.8) @Max(0.99)
  confidenceLevel?: number;
}

export class RecordABResultDto {
  @ApiProperty({ enum: ['A', 'B'] })
  @IsIn(['A', 'B'])
  variant: 'A' | 'B';

  @ApiProperty({ example: true })
  @IsBoolean()
  outcome: boolean;

  @ApiProperty({ example: 0.6 })
  @IsNumber()
  predictedProb: number;

  @ApiProperty({ required: false, example: 0.62 })
  @IsOptional()
  @IsNumber()
  actualProb?: number;

  @ApiProperty({ required: false, example: 3.5 })
  @IsOptional()
  @IsNumber()
  ev?: number;
}
