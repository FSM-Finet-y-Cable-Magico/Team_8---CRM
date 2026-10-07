import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class GenerateQuoteDto {
  @IsOptional()
  @IsBoolean()
  validarDireccion?: boolean;

  @IsInt()
  @Min(1)
  planId!: number;
}
