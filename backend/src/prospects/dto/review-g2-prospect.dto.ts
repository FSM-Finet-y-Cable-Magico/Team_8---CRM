import { Equals, IsBoolean } from 'class-validator';

export class ReviewG2ProspectDto {
  @IsBoolean()
  @Equals(true)
  confirmarOrigenG2!: boolean;

}
