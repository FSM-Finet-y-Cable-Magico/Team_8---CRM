import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  COMMERCIAL_EVENT_CHANNELS,
  COMMERCIAL_EVENT_STATUSES,
  COMMERCIAL_EVENT_TYPES,
} from '../commercial-control.types';

export class CreateCommercialEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idContrato?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idFactura?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPago?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idServicio?: number;

  @IsIn([...COMMERCIAL_EVENT_TYPES])
  tipoEvento!: string;

  @IsIn([...COMMERCIAL_EVENT_CHANNELS])
  canal!: string;

  @IsIn([...COMMERCIAL_EVENT_STATUSES])
  estado!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mensajeGenerado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  respuestaCliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montoRelacionado?: number;

  @IsOptional()
  @IsDateString()
  fechaCompromiso?: string;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown>;
}
