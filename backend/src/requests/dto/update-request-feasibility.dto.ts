import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRequestFeasibilityDto {
  @IsBoolean()
  factible!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoNoFactible?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
