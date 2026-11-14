import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional body of PATCH /billing/contracts/:id/suspend; existing callers without a body keep working. */
export class SuspendContractDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacion?: string;
}
