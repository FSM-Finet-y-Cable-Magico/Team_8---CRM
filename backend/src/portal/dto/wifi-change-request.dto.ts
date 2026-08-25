import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class WifiChangeRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idServicio!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  nuevaContrasena?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
