import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class RecordMovementDto {
  @IsInt()
  @Min(1)
  idUnidad!: number;

  @IsIn(['Compra', 'Devolucion', 'Asignacion', 'Descarte', 'Transferencia'])
  tipoMovimiento!: 'Compra' | 'Devolucion' | 'Asignacion' | 'Descarte' | 'Transferencia';

  @IsOptional()
  @IsInt()
  @Min(1)
  idCliente?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idBodegaOrigen?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idBodegaDestino?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresaDestino?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  cantidad?: number;
}
