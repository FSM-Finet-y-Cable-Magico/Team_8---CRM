import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RegisterPaymentDto {
  @IsInt()
  @Min(1)
  idFactura!: number;

  @IsNumber()
  @Min(1)
  monto!: number;

  @IsString()
  @MaxLength(30)
  pasarela!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoTransaccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comprobantePdfUrl?: string;
}
