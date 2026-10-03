import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class G2CompanyQueryDto {
  @Type(() => Number) @IsInt() @Min(1) id_empresa!: number;
}

export class G2InvoiceQueryDto extends G2CompanyQueryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(12) rut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_cliente?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_contrato?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(20) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}

export const G2_WIFI_RESULTS = ['APLICADO', 'REQUIERE_ATENCION_MANUAL', 'ERROR_TECNICO'] as const;
export type G2WifiResult = typeof G2_WIFI_RESULTS[number];

export class G2ConfirmedPaymentDto {
  @Type(() => Number) @IsInt() @Min(1) id_empresa!: number;
  @Type(() => Number) @IsInt() @Min(1) id_factura!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999.99) monto!: number;
  @IsDateString() fecha_pago!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) codigo_autorizacion!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) codigo_transaccion!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) pasarela!: string;
}

export class G2WifiResultDto {
  @Type(() => Number) @IsInt() @Min(1) id_ticket!: number;
  @Type(() => Number) @IsInt() @Min(1) id_empresa!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id_servicio?: number;
  @IsString() @IsNotEmpty() @MaxLength(2000) resultado_tecnico!: string;
  @IsString() @IsIn(G2_WIFI_RESULTS) resultado!: G2WifiResult;
  @IsString() @IsNotEmpty() @MaxLength(100) request_id!: string;
  @IsOptional() @IsString() @MaxLength(100) trace_id?: string;
}
