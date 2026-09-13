import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateNapBoxDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;

  @IsString()
  @MaxLength(50)
  identificadorUnico!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroPoste?: string;

  @IsString()
  @MaxLength(80)
  zona!: string;

  @IsInt()
  @Min(1)
  @Max(128)
  capacidadPuertos!: number;

  @IsOptional()
  @IsNumber()
  latitud?: number;

  @IsOptional()
  @IsNumber()
  longitud?: number;
}
