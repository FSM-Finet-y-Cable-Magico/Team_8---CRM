import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class ControlBookQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(40) estadoComercial?: string;
  @IsOptional() @IsString() @MaxLength(40) estadoServicio?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idPlan?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idZona?: number;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() conDeuda?: boolean;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() vencido?: boolean;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() conConvenio?: boolean;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() conProrroga?: boolean;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() conUltimoAviso?: boolean;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() retiroPendiente?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) diasAtrasoMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) diasAtrasoMax?: number;
  @IsOptional() @IsDateString() fechaVencimientoDesde?: string;
  @IsOptional() @IsDateString() fechaVencimientoHasta?: string;
  @IsOptional() @IsIn(['nombre', 'saldo', 'diasAtraso', 'fechaVencimiento', 'ultimaGestion']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 30;
  @IsOptional() @IsString() @MaxLength(1000) columns?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class CommercialEventDto {
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idFactura?: number;
  @IsIn(['AVISO_PREVENTIVO', 'ULTIMO_AVISO_CORTE', 'AVISO_PREVIO_RETIRO', 'CONTACTO_CLIENTE', 'OTRO_EVENTO_COMERCIAL']) tipo!: string;
  @IsIn(['TELEFONO', 'EMAIL', 'WHATSAPP', 'PRESENCIAL', 'OTRO']) canal!: string;
  @IsDateString() fecha!: string;
  @IsOptional() @IsString() @MaxLength(2000) observacion?: string;
}

export class AgreementInstallmentDto {
  @Type(() => Number) @IsInt() @Min(1) numero!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monto!: number;
  @IsDateString() fechaVencimiento!: string;
}

export class CreateAgreementDto {
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @Type(() => Number) @IsInt() @Min(1) idFactura!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) montoComprometido!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(60) cantidadCuotas!: number;
  @IsString() @MinLength(3) @MaxLength(2000) condiciones!: string;
  @IsDateString() fechaInicio!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AgreementInstallmentDto) cuotas!: AgreementInstallmentDto[];
}

export class CreateExtensionDto {
  @Type(() => Number) @IsInt() @Min(1) idFactura!: number;
  @IsDateString() nuevaFecha!: string;
  @IsString() @MinLength(3) @MaxLength(1000) motivo!: string;
}

export class ChangePaymentConditionDto {
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idFactura?: number;
  @IsIn(['DIA_PAGO', 'FECHA_COMPROMETIDA']) tipoCambio!: 'DIA_PAGO' | 'FECHA_COMPROMETIDA';
  @IsString() @MinLength(1) @MaxLength(40) valorNuevo!: string;
  @IsString() @MinLength(3) @MaxLength(1000) justificacion!: string;
}

export class CreateAdditionalChargeDto {
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
  @IsIn(['REPOSICION', 'RECONEXION', 'RETIRO', 'OTRO']) tipo!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monto!: number;
  @IsDateString() fecha!: string;
  @IsOptional() @IsString() @MaxLength(2000) observacion?: string;
}

export class CreateNonContractingLeadDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @IsString() @MinLength(2) @MaxLength(120) nombreCompleto!: string;
  @IsString() @MinLength(8) @MaxLength(12) rut!: string;
  @IsEmail() @MaxLength(120) email!: string;
  @IsString() @MinLength(8) @MaxLength(20) telefono!: string;
  @IsString() @MinLength(3) @MaxLength(200) direccion!: string;
  @IsString() @MinLength(2) @MaxLength(80) comuna!: string;
  @IsString() @MinLength(2) @MaxLength(80) region!: string;
}
