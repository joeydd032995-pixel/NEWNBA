import { IsString, IsNumber, IsOptional } from 'class-validator';
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

  @ApiProperty({ example: 'home_win' })
  @IsString()
  outcome: string;

  @ApiProperty({ example: -110 })
  @IsNumber()
  odds: number;

  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @IsNumber()
  stake?: number;

  @ApiProperty({ required: false, example: 4.2 })
  @IsOptional()
  @IsNumber()
  ev?: number;
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
