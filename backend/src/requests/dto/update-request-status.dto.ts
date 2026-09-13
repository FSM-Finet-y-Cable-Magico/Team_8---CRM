import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRequestStatusDto {
  @IsIn(['Abierta', 'En Gestion', 'Cerrada', 'No Factible', 'Cancelada'])
  estado!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
