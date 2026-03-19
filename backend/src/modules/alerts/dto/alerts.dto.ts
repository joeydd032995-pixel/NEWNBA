import { IsString, IsEnum, IsObject, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AlertType } from '@prisma/client';

export class CreateAlertDto {
  @ApiProperty({ example: 'High EV Alert' })
  @IsString()
  name: string;

  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiProperty({ example: { minEV: 5, sport: 'NBA' } })
  @IsObject()
  conditions: Record<string, any>;
}

export class UpdateAlertDto {
  @ApiProperty({ required: false, example: 'Updated Alert Name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: { minEV: 10 } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
