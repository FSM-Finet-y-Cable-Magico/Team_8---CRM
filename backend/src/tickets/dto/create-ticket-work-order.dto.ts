import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateTicketWorkOrderDto {
  @IsOptional()
  @IsIn(['Reparacion', 'Soporte'])
  tipoOt?: 'Reparacion' | 'Soporte';

  @IsOptional()
  @IsInt()
  @Min(1)
  idTecnico?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  fechaProgramada?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaVisita?: string;

  @IsOptional()
  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad?: 'Alta' | 'Media' | 'Baja';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
