import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEquipmentDto {
  @IsString()
  @MaxLength(80)
  numeroSerie!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idTipoEquipo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tipoNombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idBodegaActual?: number;

  @IsOptional()
  @IsDateString()
  fechaAdquisicion?: string;
}
