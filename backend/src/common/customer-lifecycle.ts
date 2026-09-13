import { Prisma } from '@prisma/client';

export const ACTIVE_CUSTOMER_STATUS = 'Activo';
export const LOST_PROSPECT_PIPELINE_STATUS = 'Perdido';
export const SIGNED_CONTRACT_STATES = ['Firmado', 'Activo', 'Suspendido', 'Moroso'];

export function activeProspectWhere(
  companyScope: Prisma.ProspectoWhereInput,
): Prisma.ProspectoWhereInput {
  return {
    AND: [
      companyScope,
      {
        OR: [
          { estadoPipeline: null },
          { estadoPipeline: { not: LOST_PROSPECT_PIPELINE_STATUS } },
        ],
      },
      { idCliente: null },
      { contratos: { none: { estado: { in: SIGNED_CONTRACT_STATES } } } },
    ],
  };
}

export function activeCustomerWhere(
  companyScope: Prisma.ClienteWhereInput,
): Prisma.ClienteWhereInput {
  return {
    AND: [companyScope, { servicios: { some: { estadoOperativo: ACTIVE_CUSTOMER_STATUS } } }],
  };
}

export function resolveCustomerLifecycleStatus(input: {
  currentStatus: string;
  contractStates: Array<string | null | undefined>;
  serviceStates: Array<string | null | undefined>;
}) {
  // Financial states are managed by Billing and must not be overwritten here.
  if (['Suspendido', 'Moroso'].includes(input.currentStatus)) {
    return input.currentStatus;
  }

  const services = input.serviceStates.filter((state): state is string => Boolean(state));
  const contracts = input.contractStates.filter((state): state is string => Boolean(state));
  const hasActiveService = services.includes('Activo');
  const hasPendingInstallation = services.some((state) =>
    state === 'Pendiente Instalacion' || state === 'Instalacion Programada',
  );
  const hasSignedContract = contracts.some((state) => ['Firmado', 'Activo'].includes(state));
  const hasPendingSignature = contracts.includes('Pendiente firma contrato');
  const hasOperationalRelationship = services.some((state) => state !== 'Baja')
    || contracts.some((state) => state !== 'Baja' && state !== 'Anulado');

  if (hasActiveService) return 'Activo';
  if (hasPendingInstallation || hasSignedContract) return 'Pendiente Instalacion';
  if (hasPendingSignature) return 'Pendiente firma contrato';
  if (!hasOperationalRelationship && (services.includes('Baja') || contracts.includes('Baja'))) return 'Baja';

  return input.currentStatus;
}

export function pendingActivationWhere(
  companyScope: Prisma.ProspectoWhereInput,
): Prisma.ProspectoWhereInput {
  return {
    AND: [
      companyScope,
      { idCliente: null },
      { contratos: { some: { estado: { in: SIGNED_CONTRACT_STATES } } } },
    ],
  };
}