import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { todayDateOnly } from '../common/date-rules';
import { PrismaService } from '../prisma/prisma.service';

export function calculatePaymentDay(monthly: number, oldDay: number, newDay: number, today = todayDateOnly()) {
  if (!Number.isFinite(monthly) || monthly < 0) throw new BadRequestException('El plan requiere una mensualidad válida para calcular el reajuste.');
  if (!Number.isInteger(newDay) || newDay < 1 || newDay > 28) throw new BadRequestException('El día de pago debe estar entre 1 y 28');
  if (!Number.isInteger(oldDay) || oldDay < 1 || oldDay > 31) throw new BadRequestException('El contrato no tiene un día de pago válido.');
  if (oldDay === newDay) throw new BadRequestException('El plan ya tiene ese día de pago.');
  const now = new Date(today + 'T00:00:00Z');
  const due = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  let base = due(now.getUTCFullYear(), now.getUTCMonth(), oldDay);
  if (base < now) base = due(now.getUTCFullYear(), now.getUTCMonth() + 1, oldDay);
  let next = due(base.getUTCFullYear(), base.getUTCMonth(), newDay);
  if (next < base) next = due(base.getUTCFullYear(), base.getUTCMonth() + 1, newDay);
  const days = Math.round((next.getTime() - base.getTime()) / 86400000);
  return { version: 1, baseDias: 30, mensualidad: monthly, diaAnterior: oldDay, nuevoDia: newDay,
    fechaDesde: base.toISOString().slice(0, 10), proximoVencimiento: next.toISOString().slice(0, 10),
    diasReajuste: days, montoReajuste: Math.round(monthly * days / 30) };
}

export class PaymentDayAdjustment {
  constructor(private readonly prisma: PrismaService) {}
  async preview(idContrato: number, newDay: number, tx: Prisma.TransactionClient = this.prisma) {
    const contract = await tx.contrato.findUnique({ where: { idContrato }, include: { plan: true } });
    if (!contract || !contract.idEmpresa || !contract.idCliente) throw new BadRequestException('Contrato no disponible para cambiar el día de pago.');
    if (!['Activo', 'Moroso', 'Suspendido'].includes(contract.estado)) throw new BadRequestException('El plan debe estar instalado para cambiar su día de pago.');
    if (!contract.plan || contract.plan.idEmpresa !== contract.idEmpresa) throw new BadRequestException('El contrato requiere un plan de su empresa.');
    const price = contract.idZonaPago ? await tx.planZonaPrecio.findFirst({ where: { idPlan: contract.plan.idPlan, idZonaPago: contract.idZonaPago, activo: true }, orderBy: { idPlanZonaPrecio: 'desc' } }) : null;
    const preview = { ...calculatePaymentDay(Number(price?.precioMensual ?? contract.plan.precioMensual), contract.diaVencimiento, newDay), idContrato, idCliente: contract.idCliente, idEmpresa: contract.idEmpresa };
    return { ...preview, fingerprint: createHash('sha256').update(JSON.stringify(preview)).digest('hex') };
  }
  save(idContrato: number, newDay: number, fingerprint: string | undefined, reason: string, idUsuario: number,
    audit?: (idCambio: number, tx: Prisma.TransactionClient) => Promise<unknown>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id_contrato FROM contrato WHERE id_contrato = ${idContrato} FOR UPDATE`;
      const preview = await this.preview(idContrato, newDay, tx);
      if (!fingerprint || preview.fingerprint !== fingerprint) throw new ConflictException('El cálculo cambió. Revisa nuevamente el reajuste antes de confirmar.');
      const previous = await tx.cambioCondicionPago.findFirst({ where: { idContrato, tipoCambio: 'DIA_PAGO', reajuste: { not: Prisma.DbNull } }, orderBy: { idCambio: 'desc' } });
      const saved = previous?.reajuste as { idCargo?: number } | null;
      if (saved?.idCargo) {
        const charge = await tx.cargoAdicional.findUnique({ where: { idCargo: saved.idCargo } });
        if (charge?.estado === 'PENDIENTE_FACTURACION') throw new ConflictException('El plan ya tiene un reajuste pendiente de facturación.');
      }
      const charge = preview.montoReajuste > 0 ? await tx.cargoAdicional.create({ data: {
        idEmpresa: preview.idEmpresa, idCliente: preview.idCliente, idContrato, tipo: 'OTRO', monto: preview.montoReajuste,
        fecha: new Date(preview.fechaDesde + 'T00:00:00Z'), estado: 'PENDIENTE_FACTURACION', afectaSaldo: false,
        observacion: `Reajuste de día de pago: ${preview.diasReajuste} días, mensualidad / 30.`, idUsuarioResponsable: idUsuario,
      } }) : null;
      const change = await tx.cambioCondicionPago.create({ data: {
        idEmpresa: preview.idEmpresa, idCliente: preview.idCliente, idContrato, tipoCambio: 'DIA_PAGO', valorAnterior: String(preview.diaAnterior),
        valorNuevo: String(newDay), justificacion: `${reason} · Reajuste: ${preview.montoReajuste} por ${preview.diasReajuste} días; próximo vencimiento ${preview.proximoVencimiento}.`, idUsuarioResponsable: idUsuario,
        reajuste: { ...preview, idCargo: charge?.idCargo ?? null, estado: charge ? 'PENDIENTE_FACTURACION' : 'SIN_CARGO' },
      } });
      await tx.contrato.update({ where: { idContrato }, data: { diaVencimiento: newDay } });
      if (audit) await audit(change.idCambio, tx);
      return change;
    });
  }
}
