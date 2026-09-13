import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CompleteInstallOrderDto {
  @IsOptional()
  @IsNumber()
  potenciaOpticaDbm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUnidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  numeroSerie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  macAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  puertoOlt?: string;

  @IsOptional()
  @IsIn(['Arriendo', 'Prestamo', 'Compra', 'Propio cliente', 'Propiedad empresa'])
  modalidadAsignacion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorArriendoMensual?: number;
}
