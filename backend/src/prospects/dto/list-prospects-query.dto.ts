import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const PROSPECT_LIST_STATES = [
  'Prospecto Nuevo', 'Contactado', 'En Factibilidad', 'Factible', 'No Factible',
  'Cotizacion Enviada', 'Contrato externo registrado', 'Pendiente firma', 'Pendiente firma contrato',
  'Aceptado', 'Instalacion Programada', 'Servicio Activo', 'Perdido',
] as const;

const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value;

export class ListProspectsQueryDto {
  @IsOptional() @IsString() @MaxLength(20)
  scope?: string;

  // Presence of `paginated=true` selects the explicit paginated response.
  @IsOptional() @IsIn(['true', 'false'])
  paginated?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120)
  q?: string;

  @IsOptional() @Transform(trimmed) @IsIn(PROSPECT_LIST_STATES)
  estado?: string;

  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(40)
  origen?: string;

  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(30)
  motivoPerdida?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}
