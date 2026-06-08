import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDiagnosisDto {
  @IsString()
  @MaxLength(200)
  causaRaiz!: string;

  @IsString()
  @MaxLength(1000)
  descripcionProblema!: string;

  @IsString()
  @MaxLength(1000)
  accionesRealizadas!: string;

  @IsIn(['Activo', 'En Mantencion'])
  estadoFinalServicio!: 'Activo' | 'En Mantencion';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
