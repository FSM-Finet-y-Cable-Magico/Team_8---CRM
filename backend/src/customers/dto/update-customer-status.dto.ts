import { IsIn } from 'class-validator';

export class UpdateCustomerStatusDto {
  @IsIn(['Activo', 'En Mantencion', 'Moroso', 'Suspendido', 'Baja'])
  estado!: 'Activo' | 'En Mantencion' | 'Moroso' | 'Suspendido' | 'Baja';
}
