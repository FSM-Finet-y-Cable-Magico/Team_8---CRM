import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ContractPlanDto {
  @IsInt()
  @Min(1)
  planId!: number;

  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimiento!: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  comuna?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPago?: number;
}
