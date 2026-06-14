import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class InstallRouterDto {
  @IsInt()
  @Min(1)
  idCliente!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  idOt?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelo?: string;

  @IsString()
  @Matches(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/)
  macAddress!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  puertoOlt!: string;
}
