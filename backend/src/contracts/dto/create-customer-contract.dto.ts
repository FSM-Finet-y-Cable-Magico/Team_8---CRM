import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCustomerContractDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPlan!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPago?: number;

  @IsOptional()
  @IsDateString()
  fechaContratacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;
}
