import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockEquipmentDto {
  @IsString()
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tipoBaja?: string;
}
