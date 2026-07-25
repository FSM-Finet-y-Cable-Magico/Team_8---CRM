import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DiagnoseEquipmentDto {
  @IsIn(['Funciona', 'Danado', 'Bloqueado'])
  resultado!: 'Funciona' | 'Danado' | 'Bloqueado';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
