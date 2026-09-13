import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeactivateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;
}
