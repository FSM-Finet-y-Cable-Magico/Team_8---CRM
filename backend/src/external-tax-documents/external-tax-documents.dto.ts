import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const EXTERNAL_TAX_DOCUMENT_TYPES = ['BOLETA', 'FACTURA'] as const;
export const EXTERNAL_TAX_DOCUMENT_STATES = ['REGISTRADO', 'ANULADO'] as const;

export class CreateExternalTaxDocumentDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @IsIn(EXTERNAL_TAX_DOCUMENT_TYPES) tipoDocumento!: string;
  @IsString() @MinLength(1) @MaxLength(80) folioONumero!: string;
  @IsString() @MinLength(2) @MaxLength(160) emisorProveedor!: string;
  @IsDateString() fechaEmision!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoNeto?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoExento?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) iva?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoTotal!: number;
  @IsOptional() @IsString() @MaxLength(2048) urlDocumento?: string;
  @IsOptional() @IsString() @MaxLength(200) referenciaExterna?: string;
  @IsOptional() @IsIn(EXTERNAL_TAX_DOCUMENT_STATES) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCliente?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idFactura?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCargoAdicional?: number;
}

export class UpdateExternalTaxDocumentDto {
  @IsOptional() @IsIn(EXTERNAL_TAX_DOCUMENT_TYPES) tipoDocumento?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) folioONumero?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) emisorProveedor?: string;
  @IsOptional() @IsDateString() fechaEmision?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoNeto?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoExento?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) iva?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) montoTotal?: number;
  @IsOptional() @IsString() @MaxLength(2048) urlDocumento?: string | null;
  @IsOptional() @IsString() @MaxLength(200) referenciaExterna?: string | null;
  @IsOptional() @IsIn(EXTERNAL_TAX_DOCUMENT_STATES) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCliente?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idFactura?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCargoAdicional?: number | null;
}

export class ExternalTaxDocumentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @IsOptional() @IsIn(EXTERNAL_TAX_DOCUMENT_TYPES) tipoDocumento?: string;
  @IsOptional() @IsString() @MaxLength(80) folio?: string;
  @IsOptional() @IsString() @MaxLength(160) emisorProveedor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCliente?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idContrato?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idFactura?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCargoAdicional?: number;
  @IsOptional() @IsIn(EXTERNAL_TAX_DOCUMENT_STATES) estado?: string;
  @IsOptional() @IsDateString() fechaDesde?: string;
  @IsOptional() @IsDateString() fechaHasta?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 30;
}
