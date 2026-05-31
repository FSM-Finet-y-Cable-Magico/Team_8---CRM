import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProspectDto {
  @IsString()
  @MaxLength(12)
  rut!: string;

  @IsString()
  @MaxLength(120)
  nombreCompleto!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MaxLength(20)
  telefono!: string;

  @IsString()
  @MaxLength(200)
  direccion!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idEmpresa?: number;
}
