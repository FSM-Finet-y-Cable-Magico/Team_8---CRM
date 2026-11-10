import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

export type SignatureMode = 'automatic' | 'manual' | 'unknown';
export const PENDING_SIGNATURE_STATES = ['Pendiente firma contrato'];
export const AUTO_ASSIGNMENT_ACTION = 'ASIGNAR_FIRMA_AUTOMATICA';
export function policyIds(config: ConfigService | undefined, key: string, fallback = '[]'): number[] {
  const raw = config?.get<string>(key) ?? fallback;
  let ids: unknown;
  try { ids = JSON.parse(raw); } catch { throw new ConflictException('Política de firma no válida'); }
  if (!Array.isArray(ids) || ids.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(ids).size !== ids.length) {
    throw new ConflictException('Política de firma no válida');
  }
  return ids;
}
export function automaticCompanies(config?: ConfigService) {
  return policyIds(config, 'CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES',
    config?.get<string>('CONTRACT_SIGNATURE_COMPANIES') ?? '[]');
}
export async function resolveSignatureMode(tx: Prisma.TransactionClient, contract: { idContrato: number; idEmpresa: number | null },
  config?: ConfigService): Promise<SignatureMode> {
  // Assignment metadata only, never PDFs, OTP, tokens or personal evidence in public.
  // Read even while sending is off or private storage is not provisioned.
  const assigned = await tx.logAuditoria.findFirst({ where: {
    entidadAfectada: 'contrato', idEntidadAfectada: contract.idContrato,
    accion: { in: [AUTO_ASSIGNMENT_ACTION, 'SOLICITAR_FIRMA_CONTRATO', 'FIRMAR_CONTRATO_CORREO'] },
  }, select: { idLog: true } });
  if (assigned || contract.idEmpresa && automaticCompanies(config).includes(contract.idEmpresa)) return 'automatic';
  const companies = policyIds(config, 'CONTRACT_SIGNATURE_MANUAL_COMPANIES');
  const contracts = policyIds(config, 'CONTRACT_SIGNATURE_MANUAL_CONTRACTS');
  return contract.idEmpresa && companies.includes(contract.idEmpresa) && contracts.includes(contract.idContrato) ? 'manual' : 'unknown';
}
export async function assignAutomatic(tx: Prisma.TransactionClient, contract: { idContrato: number; idEmpresa: number | null },
  config?: ConfigService, idUsuario?: number) {
  if (!contract.idEmpresa || !automaticCompanies(config).includes(contract.idEmpresa)) return;
  const found = await tx.logAuditoria.findFirst({ where: { entidadAfectada: 'contrato',
    idEntidadAfectada: contract.idContrato, accion: AUTO_ASSIGNMENT_ACTION }, select: { idLog: true } });
  if (!found) await tx.logAuditoria.create({ data: { idUsuario: idUsuario ?? null, accion: AUTO_ASSIGNMENT_ACTION,
    entidadAfectada: 'contrato', idEntidadAfectada: contract.idContrato,
    valorNuevo: { idEmpresa: contract.idEmpresa, modo: 'automatic' } } });
}
export function assertPendingSignature(state: string) {
  if (!PENDING_SIGNATURE_STATES.includes(state)) throw new ConflictException('El contrato no está pendiente de firma');
}
export function assertManualMode(mode: SignatureMode) {
  if (mode !== 'manual') throw new ConflictException(mode === 'automatic'
    ? 'El contrato requiere firma automática. La confirmación manual no está permitida.'
    : 'El modo de firma no está autorizado. Solicita revisión del contrato.');
}
