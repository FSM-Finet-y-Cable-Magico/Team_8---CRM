import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDigitalContractStatusDto {
  @IsIn(['Generado', 'Enviado', 'Firmado manualmente', 'Anulado'])
  estadoFirma!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
