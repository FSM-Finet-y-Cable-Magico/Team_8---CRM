import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class SendBillingNotificationDto {
  @IsOptional() @IsUUID('4') correlationId?: string;
  @IsInt()
  @Min(1)
  idCliente!: number;

  @IsIn(['Preventiva', 'Ultimo aviso'])
  tipo!: 'Preventiva' | 'Ultimo aviso';

  @IsOptional()
  @IsInt()
  @Min(1)
  idFactura?: number;
}
