import { Transform, Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CustomerContactAddressDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  direccion!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  comuna!: string;
}

export class UpdateCustomerProfileDto {
  @ValidateIf((_dto, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombreCompleto?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?(?=[\d() -]*\d)[\d() -]+$/)
  telefono?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerContactAddressDto)
  direccionActual?: CustomerContactAddressDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerContactAddressDto)
  ocultarDireccion?: CustomerContactAddressDto;
}
