import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SaveUserDto {
  @IsString() @MinLength(1) @MaxLength(80) nombreCompleto!: string;
  @IsEmail() @MaxLength(120) email!: string;
  @IsOptional() @IsInt() @Min(1) idEmpresa?: number;
  @IsInt() @Min(1) roleId!: number;
  @IsBoolean() activo!: boolean;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(72) password?: string;
}
export class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(72) password!: string;
}
