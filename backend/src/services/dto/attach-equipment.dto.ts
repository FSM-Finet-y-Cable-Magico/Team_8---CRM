import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AttachEquipmentDto {
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
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @IsOptional()
  @IsIn(['Arriendo', 'Prestamo', 'Compra', 'Propio cliente', 'Propiedad empresa'])
  modalidadAsignacion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorArriendoMensual?: number;

  @IsOptional()
  @IsDateString()
  fechaInicioAsignacion?: string;
}
