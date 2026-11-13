import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Active withdrawal for morosity (FINET 13-11-2026): a request with motivo MOROSIDAD that is neither CANCELADA nor
 * CERRADA. While it exists the service cannot be reactivated by a payment, a manual state change or a repair closure:
 * the OT BAJA may be in progress. It stops blocking once the request is cancelled or resolved (closed).
 */
export const CLOSED_WITHDRAWAL_STATES = ['CANCELADA', 'CERRADA'];

export function activeWithdrawalWhere(idServicio: number | { in: number[] }, idEmpresa?: number | null): Prisma.ServicioRetiroSolicitudWhereInput {
  return {
    idServicio, ...(idEmpresa ? { idEmpresa } : {}),
    motivo: { equals: 'MOROSIDAD', mode: 'insensitive' }, estado: { notIn: CLOSED_WITHDRAWAL_STATES },
  };
}

export async function findActiveWithdrawal(db: Pick<Prisma.TransactionClient, 'servicioRetiroSolicitud'>, idServicio: number, idEmpresa?: number | null) {
  return db.servicioRetiroSolicitud.findFirst({ where: activeWithdrawalWhere(idServicio, idEmpresa), select: { idSolicitudRetiro: true } });
}

export function activeWithdrawalReactivationError(idSolicitudRetiro: number) {
  return new ConflictException({
    code: 'SERVICE_WITHDRAWAL_ACTIVE', idSolicitudRetiro,
    message: `El servicio tiene un retiro por morosidad activo (solicitud N° ${idSolicitudRetiro}). No puede reactivarse hasta que la solicitud se cancele o se resuelva.`,
  });
}
