import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePortalTicketDto {
  @IsInt()
  @Min(1)
  idCategoria!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idServicio?: number;

  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad!: 'Alta' | 'Media' | 'Baja';

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  descripcion!: string;
}
