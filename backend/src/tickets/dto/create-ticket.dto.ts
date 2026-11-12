import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

// Mismo mínimo que ya exige el formulario: el servidor no puede depender de él.
export const TICKET_DESCRIPTION_MIN_LENGTH = 10;

export class CreateTicketDto {
  @IsString()
  @MaxLength(12)
  rut!: string;

  @IsInt()
  @Min(1)
  idCategoria!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idServicio?: number;

  @IsIn(['Alta', 'Media', 'Baja'])
  prioridad!: 'Alta' | 'Media' | 'Baja';

  @Transform(trim)
  @IsString({ message: 'La descripción del problema es obligatoria' })
  @MinLength(TICKET_DESCRIPTION_MIN_LENGTH, { message: `La descripción debe tener al menos ${TICKET_DESCRIPTION_MIN_LENGTH} caracteres` })
  @MaxLength(1000, { message: 'La descripción no puede superar los 1000 caracteres' })
  descripcion!: string;

  // El CRM solo puede declarar su propio canal. PORTAL, ASISTENTE u otros canales
  // los registra cada grupo en sus integraciones; no se pueden atribuir desde aquí.
  @IsOptional()
  @IsIn(['CRM'], { message: 'El origen de un ticket creado desde el CRM solo puede ser CRM' })
  origen?: 'CRM';
}
