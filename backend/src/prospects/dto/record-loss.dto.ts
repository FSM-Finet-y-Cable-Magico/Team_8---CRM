import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const LOSS_REASONS = ['Sin cobertura', 'Precio', 'No responde', 'Falta de respuesta', 'Competencia', 'Otro'] as const;

export class RecordLossDto {
  @IsIn(LOSS_REASONS)
  motivo!: typeof LOSS_REASONS[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  observaciones!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalleMotivoPerdida?: string;
}
