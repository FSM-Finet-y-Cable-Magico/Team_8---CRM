import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateServiceDto {
  @IsOptional()
  @IsIn(['Internet', 'Television', 'Internet + Television'])
  tipoServicio?: string;

  @IsOptional()
  @IsIn(['Activo', 'Pendiente Instalacion', 'Suspendido', 'Baja'])
  estadoOperativo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idZonaPago?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tecnologia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  velocidad?: string;

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
  @MaxLength(120)
  ipAsignada?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacionesTecnicas?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cajaNap?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroPoste?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caracteristicasComerciales?: string;
}
