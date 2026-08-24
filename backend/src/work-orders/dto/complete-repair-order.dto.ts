import { IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteRepairOrderDto {
  @IsOptional()
  @IsNumber()
  potenciaOpticaDbm?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  observaciones!: string;

  @IsOptional()
  @IsIn(['Activo', 'En Mantencion'])
  estadoFinalServicio?: 'Activo' | 'En Mantencion';
}
