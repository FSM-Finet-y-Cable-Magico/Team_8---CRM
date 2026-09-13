import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TransferEquipmentDto {
  @IsInt()
  @Min(1)
  idEmpresaDestino!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
