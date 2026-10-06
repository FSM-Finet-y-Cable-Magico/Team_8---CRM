import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RequestG3InstallationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idProspecto?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
}

export class G3ClosureDto {
  @Type(() => Number) @IsInt() @Min(1) id_ot!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) request_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(60) trace_id!: string;
  @Type(() => Number) @IsInt() @Min(1) id_empresa!: number;
  @Type(() => Number) @IsInt() @Min(1) id_prospecto!: number;
  @Type(() => Number) @IsInt() @Min(1) id_contrato!: number;
  @Type(() => Number) @IsInt() @Min(1) id_plan!: number;
  @IsArray() equipos_instalados!: unknown[];
  @IsArray() equipos_retirados!: unknown[];
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
