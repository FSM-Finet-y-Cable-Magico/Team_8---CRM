import { IsString, MaxLength, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsString()
  @MaxLength(12)
  rut!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  password!: string;
}
