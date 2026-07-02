import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AttachEquipmentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUnidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  numeroSerie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  macAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  puertoOlt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
