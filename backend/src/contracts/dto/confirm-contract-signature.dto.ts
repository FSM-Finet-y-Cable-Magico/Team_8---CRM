import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmContractSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;
}
