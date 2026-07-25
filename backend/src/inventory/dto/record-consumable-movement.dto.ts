import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class RecordConsumableMovementDto {
  @IsIn(['Entrada', 'Salida', 'Ajuste'])
  tipoMovimiento!: 'Entrada' | 'Salida' | 'Ajuste';

  @IsNumber()
  @Min(0)
  cantidad!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idOt?: number;
}
