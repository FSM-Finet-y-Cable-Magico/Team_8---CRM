import { IsInt, Min } from 'class-validator';

export class UpdateTicketCategoryDto {
  @IsInt()
  @Min(1)
  idCategoria!: number;
}
