import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MaxLength(12)
  rut!: string;

  @IsInt()
  @Min(1)
  idCategoria!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idServicio?: number;

  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad!: 'Alta' | 'Media' | 'Baja';

  @IsString()
  @MaxLength(1000)
  descripcion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  origen?: string;
}
