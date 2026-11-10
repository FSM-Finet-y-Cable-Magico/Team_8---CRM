import { Transform, Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { CoverageLocationDto } from '../../coverage/coverage.dto';

export class UpdateProspectDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(5) @MaxLength(120)
  nombreCompleto?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^\+569\d{8}$/)
  telefono?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() || null : value)
  @IsOptional() @IsEmail() @MaxLength(120)
  email?: string | null;

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(40)
  origenContacto?: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(8) @MaxLength(200)
  direccion?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80)
  comuna?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80)
  region?: string;

  @IsOptional() @ValidateNested() @Type(() => CoverageLocationDto)
  ubicacion?: CoverageLocationDto;
}
