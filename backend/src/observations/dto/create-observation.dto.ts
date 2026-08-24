import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const OBSERVATION_ENTITY_TYPES = [
  'Cliente',
  'Servicio',
  'Contrato',
  'Solicitud',
  'Ticket',
  'OrdenTrabajo',
  'Equipo',
] as const;

export class CreateObservationDto {
  @IsIn(OBSERVATION_ENTITY_TYPES)
  tipoEntidad!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEntidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsString()
  @MaxLength(1500)
  observacion!: string;

  @IsOptional()
  @IsIn(['Interna', 'Cliente', 'Equipo'])
  visibilidad?: string;
}
