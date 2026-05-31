import { IsInt, Min } from 'class-validator';

export class GenerateQuoteDto {
  @IsInt()
  @Min(1)
  planId!: number;
}
