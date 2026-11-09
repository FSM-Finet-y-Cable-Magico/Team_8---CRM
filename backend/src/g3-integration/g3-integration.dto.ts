import { Type } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

export class CompleteG3InstallationDataDto {
  @IsString() @Matches(/\S/) @MaxLength(80) comuna!: string;
  @Equals(true) confirmarMismaDireccion!: boolean;
}

export class RequestG3InstallationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idProspecto?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
}

export class G3ClosureEquipmentDto {
  @IsString() @Matches(/\S/) @MaxLength(100) numero_serie!: string;
  // Optional for the existing serial-only contract; no G1 inventory mapping.
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(60) accion?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(100) estado_g1?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1000) motivo?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(2000) observacion_estado_fisico?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(200) diagnostico?: string;
}

export class G3ClosureMaterialDto {
  @IsInt() @Min(1) @Max(2147483647) id_tipo_equipo!: number;
  @IsString() @MaxLength(200) nombre!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) cantidad!: number;
}

export class G3ClosureCustomerDto {
  @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(16) rut!: string | null;
  @IsString() @MaxLength(120) nombre!: string;
}

export class G3ClosureAddressDto {
  @IsString() @MaxLength(200) direccion_completa!: string;
  @IsString() @MaxLength(80) comuna!: string;
}

export class G3ClosureCategoryDto {
  @IsInt() @Min(1) @Max(2147483647) id_categoria!: number;
  @IsString() @MaxLength(200) nombre!: string;
}

export class G3ClosureDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) id_ot!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) id_empresa!: number;
  // Only explicit independent repairs may omit these references; the receiver
  // rejects non-null installation references on repairs before acknowledging.
  @ValidateIf(object => object.tipo_ot !== 'REPARACION') @IsString() @IsNotEmpty() @MaxLength(100) request_id?: string | null;
  @ValidateIf(object => object.tipo_ot !== 'REPARACION') @IsString() @IsNotEmpty() @MaxLength(60) trace_id?: string | null;
  @ValidateIf(object => object.tipo_ot !== 'REPARACION') @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) id_prospecto?: number | null;
  @ValidateIf(object => object.tipo_ot !== 'REPARACION') @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) id_contrato?: number | null;
  @ValidateIf(object => object.tipo_ot !== 'REPARACION') @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) id_plan?: number | null;
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => G3ClosureEquipmentDto) equipos_instalados!: G3ClosureEquipmentDto[];
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => G3ClosureEquipmentDto) equipos_retirados!: G3ClosureEquipmentDto[];
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['INSTALACION', 'REPARACION']) tipo_ot?: 'INSTALACION' | 'REPARACION';
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(100) clave_idempotencia?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/) @MaxLength(40) fecha_completada?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) id_tecnico?: number | null;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(100) usuario_tecnico?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({ allowNaN: false, allowInfinity: false }) potencia_optica_dbm?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^(?:$|[\s\S]*\S[\s\S]*)$/) @MaxLength(200) resultado_llamada?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() resuelto_remotamente?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => G3ClosureMaterialDto) materiales?: G3ClosureMaterialDto[];
  @IsOptional() @IsObject() @ValidateNested() @Type(() => G3ClosureCustomerDto) cliente?: G3ClosureCustomerDto | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => G3ClosureAddressDto) direccion?: G3ClosureAddressDto | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => G3ClosureCategoryDto) categoria_falla?: G3ClosureCategoryDto | null;
  @IsOptional() @IsString() @MaxLength(2000) categoria_falla_otro?: string | null;
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
