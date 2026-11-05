import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class G1EquipmentTypesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @IsOptional() @IsString() @MaxLength(80) categoria?: string;
  @IsOptional() @IsString() @MaxLength(100) buscar?: string;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() activo?: boolean;
}

export class G1UnitQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
}

export class CommercialWarrantyQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idCliente?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idServicio?: number;
  @IsOptional() @IsString() @MaxLength(20) estado?: string;
}

export class SaveCommercialWarrantyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEmpresa?: number;
  @Type(() => Number) @IsInt() @Min(1) idCliente!: number;
  @Type(() => Number) @IsInt() @Min(1) idServicio!: number;
  @Type(() => Number) @IsInt() @Min(1) idContrato!: number;
  @IsOptional() @IsString() @MaxLength(80) numeroSerieEquipo?: string;
  @IsString() @MaxLength(60) tipo!: string;
  @IsDateString() fechaInicio!: string;
  @IsDateString() fechaTermino!: string;
  @IsString() @MaxLength(4000) cobertura!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) monto?: number;
  @IsOptional() @IsString() @MaxLength(4000) observaciones?: string;
}
