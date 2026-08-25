import { Type } from 'class-transformer';
import { IsInt, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class DemoMeasurementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUnidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCajaNap?: number;

  @Type(() => Number)
  @IsNumber()
  potenciaActualDbm!: number;

  @IsIn(['Online', 'Offline', 'Degradado'])
  estadoConexion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  evento?: string;
}
