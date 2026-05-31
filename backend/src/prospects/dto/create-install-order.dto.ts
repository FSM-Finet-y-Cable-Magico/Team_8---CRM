import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInstallOrderDto {
  @IsDateString()
  fechaProgramada!: string;

  @IsOptional()
  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad?: 'Alta' | 'Media' | 'Baja';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
