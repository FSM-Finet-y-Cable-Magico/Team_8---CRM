import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CoverageLocationDto } from '../../coverage/coverage.dto';

export class UpdateProspectLocationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CoverageLocationDto)
  ubicacion!: CoverageLocationDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  comuna?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;
}
