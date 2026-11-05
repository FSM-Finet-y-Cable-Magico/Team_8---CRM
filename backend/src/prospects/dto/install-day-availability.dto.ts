import { IsDateString } from 'class-validator';

export class InstallDayAvailabilityDto {
  @IsDateString()
  fechaProgramada!: string;
}
