import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class AssignPlanZonesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  zoneIds!: number[];
}
