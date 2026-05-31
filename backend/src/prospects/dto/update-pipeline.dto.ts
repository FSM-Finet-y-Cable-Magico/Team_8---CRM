import { IsString, MaxLength } from 'class-validator';

export class UpdatePipelineDto {
  @IsString()
  @MaxLength(30)
  estadoPipeline!: string;
}
