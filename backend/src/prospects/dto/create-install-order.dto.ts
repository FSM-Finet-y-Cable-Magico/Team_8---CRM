import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateInstallOrderDto {
  @IsDateString()
  fechaProgramada!: string;

  @IsIn(['Fibra Optica', 'Television'])
  tipoConexion!: 'Fibra Optica' | 'Television';

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaVisita!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idTecnico!: number;

  @IsOptional()
  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad?: 'Alta' | 'Media' | 'Baja';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
