import { IsString, MaxLength, MinLength } from 'class-validator';

export class TechnicalNoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  observacion!: string;
}
