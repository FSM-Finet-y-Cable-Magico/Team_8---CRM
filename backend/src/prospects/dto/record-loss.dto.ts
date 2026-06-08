import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordLossDto {
  @IsIn(['Sin cobertura', 'Precio', 'No responde', 'Competencia', 'Otro'])
  motivo!: 'Sin cobertura' | 'Precio' | 'No responde' | 'Competencia' | 'Otro';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
