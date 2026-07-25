import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class SendBillingNotificationDto {
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
