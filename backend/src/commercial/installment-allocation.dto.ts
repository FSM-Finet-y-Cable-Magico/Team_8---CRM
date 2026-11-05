import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class AllocationLineDto {
  @IsInt() @Min(1) idCuota!: number;
  // Monetary strings preserve exact decimals throughout HTTP/JSON.
  @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) monto!: string;
}
export class AllocationIdentityDto {
  @IsString() @MinLength(8) @MaxLength(100) @Matches(/^[a-zA-Z0-9_-]+$/) clave!: string;
  @IsString() @MinLength(1) @MaxLength(250) motivo!: string;
}
export class ApplyInstallmentsDto extends AllocationIdentityDto {
  @IsInt() @Min(1) idPago!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => AllocationLineDto) cuotas!: AllocationLineDto[];
}
export class ReverseInstallmentDto extends AllocationIdentityDto {
  @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) monto!: string;
}
