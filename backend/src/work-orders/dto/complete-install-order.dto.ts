import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteInstallOrderDto {
  @IsOptional()
  @IsNumber()
  potenciaOpticaDbm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
