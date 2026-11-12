import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';

export async function prepareInstallmentPayment(tx: Prisma.TransactionClient, input: {
  idCuota: number; idFactura: number; idContrato: number; idCliente: number; idEmpresa: number; monto: number;
}) {
  const quota = await tx.cuotaConvenioPago.findUnique({ where: { idCuota: input.idCuota }, include: { convenio: { include: { servicio: true } } } });
  const agreement = quota?.convenio;
  if (!quota || !agreement || agreement.idFactura !== input.idFactura || agreement.idContrato !== input.idContrato
    || agreement.idCliente !== input.idCliente || agreement.idEmpresa !== input.idEmpresa
    || (agreement.idServicio != null && (!agreement.servicio || agreement.servicio.idContrato !== input.idContrato
      || agreement.servicio.idCliente !== input.idCliente || agreement.servicio.idEmpresa !== input.idEmpresa))) {
    throw new BadRequestException('La cuota no corresponde a la factura, cliente y empresa.');
  }
  if (agreement.estado !== 'APROBADO') throw new BadRequestException('El convenio no está vigente.');
  const operations = await tx.operacionImputacionCuota.findMany({ where: { idFactura: input.idFactura, detalles: { some: { idCuota: quota.idCuota } } }, include: { detalles: true } });
  const lines = operations.flatMap(op => op.detalles.filter(line => line.idCuota === quota.idCuota).map(line => ({ amount: line.monto, sign: op.tipo === 'APLICAR' ? 1 : -1 })));
  const paid = lines.reduce((total, line) => total.plus(line.amount.mul(line.sign)), new Prisma.Decimal(0));
  if (quota.estado === 'CANCELADA' || (!lines.length && (quota.estado === 'PAGADA' || quota.fechaPago != null)) || paid.lt(0) || paid.gt(quota.monto)) throw new ConflictException('La cuota requiere revisión de sus pagos.');
  if (new Prisma.Decimal(input.monto).gt(quota.monto.minus(paid))) throw new BadRequestException('El pago supera el saldo pendiente de la cuota.');
  return { quota, paid, input };
}

export async function recordInstallmentPayment(tx: Prisma.TransactionClient, auditService: AuditService,
  context: Awaited<ReturnType<typeof prepareInstallmentPayment>>, payment: { idPago: number }, idUsuario: number, fechaPago: Date) {
  const { quota, paid, input } = context;
  const amount = new Prisma.Decimal(input.monto);
  const key = `pago-cuota-${payment.idPago}-${quota.idCuota}`;
  const audit = await auditService.record({ idUsuario, accion: 'REGISTRAR_PAGO_CUOTA', entidadAfectada: 'cuota_convenio_pago', idEntidadAfectada: quota.idCuota,
    valorNuevo: { idConvenio: quota.idConvenio, idCuota: quota.idCuota, idPago: payment.idPago, idFactura: input.idFactura, monto: amount.toFixed(2) } }, tx);
  if (!audit) throw new ConflictException('No se pudo confirmar el registro del pago.');
  await tx.operacionImputacionCuota.create({ data: {
    idEmpresa: input.idEmpresa, idPago: payment.idPago, idFactura: input.idFactura, idConvenio: quota.idConvenio,
    idUsuario, idAuditoria: audit.idLog, clave: key, hash: createHash('sha256').update(JSON.stringify({ idCuota: quota.idCuota, idPago: payment.idPago, monto: amount.toFixed(2) })).digest('hex'),
    tipo: 'APLICAR', motivo: `Pago manual de cuota ${quota.numero}`, detalles: { create: { idCuota: quota.idCuota, monto: amount } },
  } });
  const paidInFull = paid.plus(amount).eq(quota.monto);
  await tx.cuotaConvenioPago.update({ where: { idCuota: quota.idCuota }, data: { estado: paidInFull ? 'PAGADA' : 'PENDIENTE', fechaPago: paidInFull ? fechaPago : null } });
}

export async function prepareAgreementPayment(tx: Prisma.TransactionClient, input: {
  idConvenio: number; idFactura: number; idContrato: number; idCliente: number; idEmpresa: number; monto: number;
}) {
  const agreement = await tx.convenioPago.findUnique({ where: { idConvenio: input.idConvenio }, include: { cuotas: { orderBy: [{ fechaVencimiento: 'asc' }, { numero: 'asc' }] } } });
  if (!agreement || agreement.idFactura !== input.idFactura || agreement.idContrato !== input.idContrato || agreement.idCliente !== input.idCliente || agreement.idEmpresa !== input.idEmpresa || agreement.estado !== 'APROBADO') throw new BadRequestException('El convenio no corresponde a la factura o no está vigente.');
  let remaining = new Prisma.Decimal(input.monto);
  const installments: Array<Awaited<ReturnType<typeof prepareInstallmentPayment>>> = [];
  for (const quota of agreement.cuotas) {
    if (remaining.isZero()) break;
    const context = await prepareInstallmentPayment(tx, { ...input, idCuota: quota.idCuota, monto: 0 });
    const balance = context.quota.monto.minus(context.paid);
    if (!balance.gt(0)) continue;
    const amount = Prisma.Decimal.min(balance, remaining);
    installments.push({ ...context, input: { ...context.input, monto: amount.toNumber() } });
    remaining = remaining.minus(amount);
  }
  if (remaining.gt(0)) throw new BadRequestException('El pago supera el saldo pendiente del convenio.');
  return installments;
}
