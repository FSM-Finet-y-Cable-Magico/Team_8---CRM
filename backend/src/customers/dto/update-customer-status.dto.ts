import { IsIn } from 'class-validator';

export class UpdateCustomerStatusDto {
  @IsIn(['Pendiente firma contrato', 'Activo', 'En Mantencion', 'Moroso', 'Suspendido', 'Baja'])
  estado!: 'Pendiente firma contrato' | 'Activo' | 'En Mantencion' | 'Moroso' | 'Suspendido' | 'Baja';
}
