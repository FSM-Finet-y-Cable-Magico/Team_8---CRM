import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { COMMERCIAL_STATES } from '../commercial-control.types';

export class CommercialControlQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  scope?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  empresaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  zonaPagoId?: number;

  @IsOptional()
  @IsIn([...COMMERCIAL_STATES])
  estadoComercial?: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  vencidosOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId?: number;
}
