import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterMaintenanceDto {
  @IsIn(['Preventiva', 'Correctiva'])
  tipo!: 'Preventiva' | 'Correctiva';

  @IsString()
  @MaxLength(600)
  descripcion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tecnicoResponsable?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}
