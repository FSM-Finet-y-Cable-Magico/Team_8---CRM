import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerTechnicalDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tecnologiaPrincipal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nodoPrincipal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cajaNapPrincipal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroPoste?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ipReferencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacionesTecnicas?: string;
}
