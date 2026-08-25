import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AttachEvidenceDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  formato?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10240)
  tamanoKb?: number;
}
