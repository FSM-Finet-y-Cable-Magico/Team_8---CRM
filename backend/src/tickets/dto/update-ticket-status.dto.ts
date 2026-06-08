import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTicketStatusDto {
  @IsIn(['Abierto', 'En progreso', 'Escalado', 'Resuelto', 'Cerrado'])
  estado!: 'Abierto' | 'En progreso' | 'Escalado' | 'Resuelto' | 'Cerrado';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
