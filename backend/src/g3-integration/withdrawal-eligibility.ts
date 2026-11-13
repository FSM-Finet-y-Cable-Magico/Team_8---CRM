import { ACTIVE_AGREEMENT_STATES, DebtInvoice, OverdueDebtSummary, hasOverdueCollectibleDebt, overdueDebtSummary } from '../common/overdue-debt';
import { validateRut } from '../rut/rut.util';

// Ported from PR #81 (integrate/p0b-jean-claude-20261112 @ c3486103) and extended with the
// data G3 requires to accept the OT (canonical RUT, withdrawal address and comuna).
export const WITHDRAWAL_MOTIVE_MOROSITY = 'MOROSIDAD';
export { ACTIVE_AGREEMENT_STATES, hasOverdueCollectibleDebt, overdueDebtSummary };
export type { DebtInvoice, OverdueDebtSummary };

export type WithdrawalFacts = {
  service: {
    idServicio: number; idCliente: number; idEmpresa: number | null; idContrato: number | null; estadoOperativo: string;
    contrato: { idContrato: number; idCliente: number | null; idEmpresa: number | null } | null;
  } | null;
  companyAllowed: boolean;
  activeRequest: { idSolicitudRetiro: number; estado: string } | null;
  debt: OverdueDebtSummary;
  notice: { idEvento: number; fecha?: Date | string | null } | null;
  /** Customer RUT as stored; G3 locates the customer by it within the company. */
  rut: string | null;
  /** Service address; G3 rejects a comuna that differs from the customer's main address. */
  address: { direccion: string | null; comuna: string | null } | null;
};

export type EligibilityCode = 'SERVICIO' | 'EMPRESA' | 'SIN_BAJA_PREVIA' | 'SIN_SOLICITUD_ACTIVA'
  | 'SERVICIO_SUSPENDIDO' | 'CONTRATO' | 'DEUDA_VENCIDA' | 'AVISO_PREVIO' | 'RUT_CLIENTE' | 'DIRECCION_RETIRO';
export type EligibilityCheck = { code: EligibilityCode; label: string; ok: boolean; message: string };

const check = (code: EligibilityCode, label: string, ok: boolean, message: string): EligibilityCheck => ({ code, label, ok, message: ok ? '' : message });
const filled = (value: string | null | undefined) => Boolean(value?.trim());

/**
 * Requirements to start a withdrawal for morosity. Pure: the backend applies it under lock when
 * creating and exposes it read-only; the UI only shows the result and never decides.
 */
export function evaluateWithdrawalEligibility(facts: WithdrawalFacts) {
  const service = facts.service;
  if (!service || !service.idEmpresa) {
    const checks = [check('SERVICIO', 'Servicio de la empresa', false, 'El servicio no existe o no tiene empresa asociada')];
    return { eligible: false, checks, firstFailure: checks[0] };
  }
  const contractOk = Boolean(service.idContrato && service.contrato
    && service.contrato.idContrato === service.idContrato && service.contrato.idEmpresa === service.idEmpresa
    && service.contrato.idCliente === service.idCliente);
  const agreementOnly = facts.debt.overdueCount > 0 && facts.debt.uncoveredCount === 0;
  const rut = facts.rut ? validateRut(facts.rut) : null;
  const checks: EligibilityCheck[] = [
    check('SERVICIO', 'Servicio de la empresa', true, ''),
    check('EMPRESA', 'Empresa y permisos', facts.companyAllowed, 'El servicio no pertenece a tu empresa'),
    check('SIN_BAJA_PREVIA', 'Sin baja efectiva previa', service.estadoOperativo !== 'Baja', 'El servicio ya está de baja'),
    check('SIN_SOLICITUD_ACTIVA', 'Sin solicitud de retiro activa', !facts.activeRequest,
      'Ya existe una solicitud de retiro activa para este servicio; revísala antes de continuar'),
    check('SERVICIO_SUSPENDIDO', 'Servicio suspendido', service.estadoOperativo === 'Suspendido',
      'El retiro por morosidad requiere que el servicio esté suspendido'),
    check('CONTRATO', 'Contrato del servicio', contractOk, 'El servicio requiere un contrato vinculado al mismo cliente y empresa'),
    check('DEUDA_VENCIDA', 'Deuda exigible vencida', facts.debt.uncoveredCount > 0,
      agreementOnly ? 'La deuda vencida está cubierta por un convenio de pago activo'
        : 'El retiro por morosidad requiere deuda exigible vencida'),
    check('AVISO_PREVIO', 'Aviso previo de retiro', Boolean(facts.notice), 'Registra el aviso previo de retiro en el Libro de Control'),
    check('RUT_CLIENTE', 'RUT del cliente', Boolean(rut?.valid),
      'El cliente no tiene un RUT válido; el equipo técnico no podría identificarlo'),
    check('DIRECCION_RETIRO', 'Dirección y comuna del retiro', filled(facts.address?.direccion) && filled(facts.address?.comuna),
      'El servicio no tiene dirección y comuna registradas para el retiro'),
  ];
  const firstFailure = checks.find(item => !item.ok) ?? null;
  return { eligible: !firstFailure, checks, firstFailure };
}
export type WithdrawalEligibility = ReturnType<typeof evaluateWithdrawalEligibility>;
