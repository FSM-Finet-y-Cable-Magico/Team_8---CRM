import { IsDateString, Matches } from 'class-validator';

export class ServiceInstallAvailabilityDto {
  @IsDateString()
  fechaProgramada!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaVisita!: string;
}
