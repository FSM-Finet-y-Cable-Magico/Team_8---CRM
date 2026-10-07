import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { CoverageLocationDto } from '../../coverage/coverage.dto';

export class CreateProspectDto {
  @IsOptional()
  @IsBoolean()
  validarDireccion?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoverageLocationDto)
  ubicacion?: CoverageLocationDto;

  @IsString()
  @MaxLength(12)
  rut!: string;

  @IsString()
  @MaxLength(120)
  nombreCompleto!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MaxLength(20)
  telefono!: string;

  @IsString()
  @MaxLength(200)
  direccion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  comuna?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  origenContacto?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPlanInteres?: number;
}
