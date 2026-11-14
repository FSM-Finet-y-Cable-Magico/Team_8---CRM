import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class CustomerPlanQuoteDto {
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @Type(() => Number) @IsInt() @Min(1) planId!: number;
  @IsString() @Length(8, 200) direccion!: string;
  @IsString() @Length(2, 80) comuna!: string;
  @IsOptional() @IsString() @MaxLength(80) region?: string;
  @IsNumber() @Min(-90) @Max(90) latitud!: number;
  @IsNumber() @Min(-180) @Max(180) longitud!: number;
}
