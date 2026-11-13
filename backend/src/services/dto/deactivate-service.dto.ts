import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Administrative baja (not morosity), FINET 13-11-2026. Clientes no longer offers «Dar de baja»: a baja for non-payment
 * starts only from the Libro de Control after a valid suspension (guided withdrawal). This endpoint remains as an
 * Administrador-only exception with a closed reason and a mandatory justification; the service rejects it for a
 * suspended service or a contract with overdue collectible debt, so it can never be the shortcut of a morosity baja.
 */
export const ADMIN_DEACTIVATION_REASONS = ['SOLICITUD_CLIENTE_SIN_DEUDA', 'ERROR_DE_REGISTRO', 'SERVICIO_DUPLICADO', 'SIN_COBERTURA_TECNICA'] as const;
export type AdminDeactivationReason = (typeof ADMIN_DEACTIVATION_REASONS)[number];

export class DeactivateServiceDto {
  @IsIn(ADMIN_DEACTIVATION_REASONS, { message: 'Indica un motivo administrativo válido (no morosidad)' })
  motivoAdministrativo!: AdminDeactivationReason;

  @IsString({ message: 'La justificación es obligatoria' })
  @MinLength(10, { message: 'La justificación debe tener al menos 10 caracteres' })
  @MaxLength(1000)
  observacion!: string;
}
