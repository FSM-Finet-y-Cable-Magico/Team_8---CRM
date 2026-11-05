import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Matches, Min } from 'class-validator';

export class RegisterPaymentDto {
  @IsInt()
  @Min(1)
  idFactura!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  monto!: number;

  @IsString()
  @MaxLength(30)
  @Matches(/\S/, { message: 'El medio de pago no puede estar vacío' })
  pasarela!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoTransaccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoAutorizacion?: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comprobantePdfUrl?: string;
}
