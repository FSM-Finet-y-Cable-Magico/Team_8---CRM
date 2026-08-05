import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ChangePlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newPlanId!: number;

  @IsDateString()
  fechaEfectiva!: string;

  @IsString()
  @MaxLength(300)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
