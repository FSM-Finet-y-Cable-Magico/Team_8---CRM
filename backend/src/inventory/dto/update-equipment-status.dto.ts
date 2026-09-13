import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEquipmentStatusDto {
  @IsIn(['Disponible', 'En Revision', 'Instalado', 'Baja Definitiva', 'Bloqueado'])
  estado!: 'Disponible' | 'En Revision' | 'Instalado' | 'Baja Definitiva' | 'Bloqueado';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
