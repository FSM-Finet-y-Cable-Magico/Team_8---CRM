import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CoverageLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;
}

export class CheckCoverageDto extends CoverageLocationDto {
  @IsInt()
  @Min(1)
  idEmpresa!: number;
}
