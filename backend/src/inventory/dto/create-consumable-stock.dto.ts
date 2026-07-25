import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateConsumableStockDto {
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
  idBodega?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bodegaNombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsNumber()
  @Min(0)
  cantidadDisponible!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  umbralMinimo?: number;
}
