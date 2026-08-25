import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class RegeneratePortalTvipDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idContrato!: number;
}
