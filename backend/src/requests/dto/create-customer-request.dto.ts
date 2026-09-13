import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCustomerRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idProspecto?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idServicio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsString()
  @MaxLength(60)
  tipoSolicitud!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  canalOrigen?: string;

  @IsOptional()
  @IsIn(['Abierta', 'En Gestion', 'Cerrada', 'No Factible', 'Cancelada'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  factible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoNoFactible?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
