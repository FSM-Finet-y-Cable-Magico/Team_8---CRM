import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsString()
  @MaxLength(40)
  proveedorContrato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  numeroContratoExterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  folioContratoExterno?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  urlContratoPdf?: string;

  @IsOptional()
  @IsDateString()
  fechaGeneracionContrato?: string;

  @IsOptional()
  @IsDateString()
  fechaEnvioCliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacionContrato?: string;
}
