import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateServiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idContrato?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idDireccion?: number;

  @IsIn(['Internet', 'Television', 'Internet + Television'])
  tipoServicio!: string;

  @IsIn(['Activo', 'Pendiente Instalacion', 'Suspendido', 'Baja'])
  estadoOperativo!: string;

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
