import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RequestG3InstallationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idProspecto?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
}

export class G3ClosureDto {
  @IsString() @IsNotEmpty() @MaxLength(100) estado!: string;
  @IsOptional() id_ot?: string | number;
  @IsOptional() @IsString() @MaxLength(100) codigo_ot?: string;
  @IsOptional() @IsString() @MaxLength(20) tipo?: string;
  @IsOptional() @IsString() @MaxLength(60) request_id?: string;
  @IsOptional() @IsString() @MaxLength(60) trace_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_empresa?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_prospecto?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_contrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_plan?: number;
  @IsOptional() resultado?: unknown;
  @IsOptional() resultado_tecnico?: unknown;
  @IsOptional() tecnico?: unknown;
  @IsOptional() direccion?: unknown;
  @IsOptional() persona?: unknown;
  @IsOptional() @IsString() fecha?: string;
}

export class CreateServiceWithdrawalDto {
  @Type(() => Number) @IsInt() @Min(1) idServicio!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsString() @IsNotEmpty() @MaxLength(1000) motivo!: string;
  @IsDateString() fechaSolicitada!: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
}

export class UpdateServiceWithdrawalDto {
  @IsIn(['REGISTRADA', 'EN_GESTION', 'CANCELADA', 'CERRADA']) estado!: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
}
