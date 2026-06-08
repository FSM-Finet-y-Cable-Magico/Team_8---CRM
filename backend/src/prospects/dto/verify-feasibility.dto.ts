import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyFeasibilityDto {
  @IsIn(['Factible', 'No Factible'])
  resultado!: 'Factible' | 'No Factible';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
