import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

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
}
