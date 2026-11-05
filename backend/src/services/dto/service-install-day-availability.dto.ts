import { IsDateString } from 'class-validator';

export class ServiceInstallDayAvailabilityDto {
  @IsDateString()
  fechaProgramada!: string;
}
