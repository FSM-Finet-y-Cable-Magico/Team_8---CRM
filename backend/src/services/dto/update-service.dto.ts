import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
