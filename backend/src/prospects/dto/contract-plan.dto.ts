import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

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
}
