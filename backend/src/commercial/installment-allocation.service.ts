import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { ACCESS_ROLES } from '../common/permissions';
import { isAdministrator, normalizeRoles } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyInstallmentsDto, ReverseInstallmentDto } from './installment-allocation.dto';

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const sum = (values: Prisma.Decimal[]) => values.reduce((a, b) => a.plus(b), money(0));
const ledgerInclude = { detalles: true, pago: { select: { fechaPago: true } } } as const;
type Operation = Prisma.OperacionImputacionCuotaGetPayload<{ include: typeof ledgerInclude }>;

@Injectable()
export class InstallmentAllocationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private positive(value: string) {
    if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException('Monto decimal invalido');
    const result = money(value);
    if (!result.gt(0)) throw new BadRequestException('El monto debe ser positivo');
    return result;
  }

  private async context(tx: Prisma.TransactionClient, idConvenio: number, user: AuthUser) {
    if (!normalizeRoles(user.roles).some(role => (ACCESS_ROLES.VIEW_CONTROL_BOOK as readonly string[]).includes(role))) throw new ForbiddenException('Consulta no autorizada');
    const agreement = await tx.convenioPago.findUnique({ where: { idConvenio }, include: {
      cuotas: { orderBy: [{ fechaVencimiento: 'asc' }, { numero: 'asc' }] }, servicio: true,
      factura: { include: { contrato: { include: { cliente: true } } } },
    } });
    if (!agreement) throw new NotFoundException('Convenio no encontrado');
    if (!isAdministrator(user.roles) && user.idEmpresa !== agreement.idEmpresa) throw new ForbiddenException('El registro pertenece a otra empresa');
    const invoice = agreement.factura, contract = invoice?.contrato;
    if (!invoice || !contract || !contract.idCliente || contract.cliente?.idCliente !== agreement.idCliente
      || contract.idCliente !== agreement.idCliente || contract.idEmpresa !== agreement.idEmpresa
      || invoice.idFactura !== agreement.idFactura || agreement.idContrato !== contract.idContrato
      || (agreement.idServicio != null && (!agreement.servicio || agreement.servicio.idEmpresa !== agreement.idEmpresa
        || agreement.servicio.idCliente !== agreement.idCliente || agreement.servicio.idContrato !== contract.idContrato))) {
      throw new ConflictException('Relaciones del convenio incompatibles; requiere revision');
    }
    return { agreement, invoice, contract };
  }

  private async ledger(tx: Prisma.TransactionClient, idFactura: number) {
    return tx.operacionImputacionCuota.findMany({ where: { idFactura }, include: ledgerInclude, orderBy: { idOperacion: 'asc' } });
  }
  private net(ops: Operation[], matches: (op: Operation, line: Operation['detalles'][number]) => boolean) {
    return sum(ops.flatMap(op => op.detalles.filter(line => matches(op, line)).map(line => op.tipo === 'APLICAR' ? line.monto : line.monto.negated())));
  }
  private present(op: Operation) {
    return { idOperacion: op.idOperacion, idEmpresa: op.idEmpresa, idPago: op.idPago, idConvenio: op.idConvenio,
      idFactura: op.idFactura, idUsuario: op.idUsuario, idAuditoria: String(op.idAuditoria), clave: op.clave,
      tipo: op.tipo, motivo: op.motivo, fecha: op.fecha,
      detalles: op.detalles.map(line => ({ idImputacion: line.idImputacion, idCuota: line.idCuota, monto: line.monto.toFixed(2), idOriginal: line.idOriginal })) };
  }

  async detail(idConvenio: number, user: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const { agreement, invoice } = await this.context(tx, idConvenio, user);
      const ops = await this.ledger(tx, invoice.idFactura);
      const payments = await tx.pago.findMany({ where: { idFactura: invoice.idFactura, idCliente: agreement.idCliente },
        select: { idPago: true, monto: true, fechaPago: true, pasarela: true }, orderBy: { idPago: 'asc' } });
      return {
        idConvenio, idEmpresa: agreement.idEmpresa, idFactura: invoice.idFactura, estadoConvenio: agreement.estado,
        puedeImputar: isAdministrator(user.roles) && agreement.estado === 'APROBADO',
        cuotas: agreement.cuotas.map(q => {
          const net = this.net(ops, (_op, line) => line.idCuota === q.idCuota);
          const hasHistory = ops.some(op => op.detalles.some(line => line.idCuota === q.idCuota));
          const review = q.estado === 'CANCELADA' || (!hasHistory && (q.estado === 'PAGADA' || q.fechaPago != null)) || net.lt(0) || net.gt(q.monto);
          return { idCuota: q.idCuota, numero: q.numero, fechaVencimiento: q.fechaVencimiento, monto: q.monto.toFixed(2),
            imputado: net.toFixed(2), saldo: review ? null : q.monto.minus(net).toFixed(2),
            estado: review ? 'REQUIERE_REVISION' : net.eq(q.monto) ? 'PAGADA' : net.gt(0) ? 'PARCIAL' : 'PENDIENTE', estadoRegistrado: q.estado, fechaPago: q.fechaPago };
        }),
        pagos: payments.map(p => { const net = this.net(ops, op => op.idPago === p.idPago);
          return { idPago: p.idPago, monto: p.monto.toFixed(2), fechaPago: p.fechaPago, origen: p.pasarela,
            imputado: net.toFixed(2), disponible: p.monto.minus(net).toFixed(2) }; }),
        operaciones: ops.filter(op => op.idConvenio === idConvenio && op.idEmpresa === agreement.idEmpresa).map(op => ({ ...this.present(op),
          detalles: this.present(op).detalles.map(line => ({ ...line, reversible: op.tipo === 'APLICAR'
            ? money(line.monto).minus(this.net(ops, (_o, l) => l.idOriginal === line.idImputacion).negated()).toFixed(2) : '0.00' })),
        })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  apply(idConvenio: number, dto: ApplyInstallmentsDto, user: AuthUser) {
    return this.write(idConvenio, dto, user);
  }
  reverse(idConvenio: number, idImputacion: number, dto: ReverseInstallmentDto, user: AuthUser) {
    return this.write(idConvenio, dto, user, idImputacion);
  }

  private async write(idConvenio: number, dto: ApplyInstallmentsDto | ReverseInstallmentDto, user: AuthUser, originalId?: number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          if (!isAdministrator(user.roles)) throw new ForbiddenException('Solo administradores pueden imputar o revertir');
          if (typeof dto.clave !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(dto.clave)
            || typeof dto.motivo !== 'string' || !dto.motivo.trim() || dto.motivo.trim().length > 250) throw new BadRequestException('Clave y motivo obligatorios');
          const { agreement, invoice } = await this.context(tx, idConvenio, user);
          const original = originalId ? await tx.imputacionCuota.findUnique({ where: { idImputacion: originalId }, include: { operacion: true } }) : null;
          if (originalId && (!original || original.idOriginal != null || original.operacion.tipo !== 'APLICAR'
            || original.operacion.idConvenio !== idConvenio || original.operacion.idEmpresa !== agreement.idEmpresa || original.operacion.idFactura !== invoice.idFactura)) throw new BadRequestException('Imputacion original incompatible');
          const idPago = original ? original.operacion.idPago : (dto as ApplyInstallmentsDto).idPago;
          if (!Number.isSafeInteger(idPago) || idPago < 1) throw new BadRequestException('Pago invalido');
          const input = original ? [{ idCuota: original.idCuota, monto: (dto as ReverseInstallmentDto).monto }]
            : (dto as ApplyInstallmentsDto).cuotas;
          if (!Array.isArray(input) || !input.length || input.length > 100) throw new BadRequestException('Selecciona cuotas');
          const lines = input.map(line => ({ idCuota: line.idCuota, monto: this.positive(line.monto) })).sort((a, b) => a.idCuota - b.idCuota);
          if (lines.some(line => !Number.isSafeInteger(line.idCuota) || line.idCuota < 1) || new Set(lines.map(line => line.idCuota)).size !== lines.length) throw new BadRequestException('Cuotas invalidas o repetidas');
          const tipo = original ? 'REVERSAR' : 'APLICAR';
          const canonical = { tipo, idConvenio, idPago, idOriginal: original?.idImputacion ?? null,
            motivo: dto.motivo.trim(), cuotas: lines.map(line => ({ idCuota: line.idCuota, monto: line.monto.toFixed(2) })) };
          const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
          // Lock order: payment, then selected installments by ascending ID.
          await tx.$queryRaw`SELECT id_pago FROM pago WHERE id_pago = ${idPago} FOR UPDATE`;
          const payment = await tx.pago.findUnique({ where: { idPago }, select: { idPago: true, idFactura: true, idCliente: true, monto: true } });
          if (!payment || payment.idFactura !== invoice.idFactura || payment.idCliente !== agreement.idCliente || !payment.monto.gt(0)) throw new BadRequestException('El pago no corresponde a factura, cliente y empresa');
          const existing = await tx.operacionImputacionCuota.findUnique({ where: { idEmpresa_clave: { idEmpresa: agreement.idEmpresa, clave: dto.clave } }, include: ledgerInclude });
          if (existing) {
            if (existing.hash !== hash) throw new ConflictException('Clave idempotente utilizada con otra distribucion');
            return { duplicado: true, operacion: this.present(existing) };
          }
          if (agreement.estado !== 'APROBADO') throw new BadRequestException('El convenio debe estar aprobado');
          if (!original && invoice.estado === 'Anulada') throw new BadRequestException('La factura esta anulada');
          for (const line of lines) await tx.$queryRaw`SELECT id_cuota FROM cuota_convenio_pago WHERE id_cuota = ${line.idCuota} FOR UPDATE`;
          const quotas = await tx.cuotaConvenioPago.findMany({ where: { idCuota: { in: lines.map(line => line.idCuota) }, idConvenio } });
          if (quotas.length !== lines.length) throw new BadRequestException('Las cuotas no pertenecen al convenio');
          const ops = await this.ledger(tx, invoice.idFactura);
          if (original && lines[0].monto.gt(original.monto.plus(this.net(ops, (_op, line) => line.idOriginal === original.idImputacion)))) throw new ConflictException('La reversa supera el importe reversible');
          const used = this.net(ops, op => op.idPago === idPago);
          if (used.lt(0) || used.gt(payment.monto)) throw new ConflictException('Saldo del pago inconsistente');
          if (!original && sum(lines.map(line => line.monto)).gt(payment.monto.minus(used))) throw new ConflictException('Saldo imputable del pago insuficiente');
          for (const q of quotas) {
            const net = this.net(ops, (_op, line) => line.idCuota === q.idCuota);
            const hasHistory = ops.some(op => op.detalles.some(line => line.idCuota === q.idCuota));
            if (q.estado === 'CANCELADA' || (!hasHistory && (q.estado === 'PAGADA' || q.fechaPago != null))) throw new ConflictException('Cuota historica sin trazabilidad o cancelada; requiere revision');
            const amount = lines.find(line => line.idCuota === q.idCuota)!.monto;
            const after = original ? net.minus(amount) : net.plus(amount);
            if (net.lt(0) || net.gt(q.monto) || after.lt(0) || after.gt(q.monto)) throw new ConflictException('La imputacion supera el saldo de la cuota');
          }
          const audit = await this.audit.record({ idUsuario: user.idUsuario, accion: original ? 'REVERSAR_IMPUTACION_CUOTA' : 'IMPUTAR_PAGO_CUOTAS',
            entidadAfectada: 'convenio_pago', idEntidadAfectada: idConvenio, valorNuevo: { ...canonical, idEmpresa: agreement.idEmpresa, clave: dto.clave } }, tx);
          if (!audit) throw new ConflictException('No se confirmo la auditoria');
          const created = await tx.operacionImputacionCuota.create({ data: { idEmpresa: agreement.idEmpresa, idPago, idFactura: invoice.idFactura,
            idConvenio, idUsuario: user.idUsuario, idAuditoria: audit.idLog, clave: dto.clave, hash, tipo, motivo: dto.motivo.trim(),
            detalles: { create: lines.map(line => ({ idCuota: line.idCuota, monto: line.monto, idOriginal: original?.idImputacion })) } }, include: ledgerInclude });
          const updated = [...ops, created];
          for (const q of quotas) {
            const net = this.net(updated, (_op, line) => line.idCuota === q.idCuota);
            const paid = net.eq(q.monto);
            const dates = updated.filter(op => op.tipo === 'APLICAR' && op.detalles.some(line => line.idCuota === q.idCuota
              && line.monto.plus(this.net(updated, (_o, reversal) => reversal.idOriginal === line.idImputacion)).gt(0)))
              .map(op => op.pago.fechaPago.getTime());
            await tx.cuotaConvenioPago.update({ where: { idCuota: q.idCuota }, data: {
              estado: paid ? 'PAGADA' : q.estado === 'VENCIDA' ? 'VENCIDA' : 'PENDIENTE',
              fechaPago: paid ? new Date(Math.max(...dates)) : null,
            } });
          }
          return { duplicado: false, operacion: this.present(created) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
      } catch (error) {
        const { code, meta } = error as { code?: string; meta?: { code?: string } };
        // Raw SELECT ... FOR UPDATE reports PostgreSQL serialization/deadlock
        // as P2010, unlike ORM queries (P2034). Retry the whole transaction only.
        const retryable = ['P2034', 'P2002'].includes(code ?? '')
          || (code === 'P2010' && ['40001', '40P01'].includes(meta?.code ?? ''));
        if (retryable && attempt < 2) continue;
        if (retryable) throw new ConflictException('La imputacion cambio concurrentemente; reintenta con la misma clave');
        throw error;
      }
    }
    throw new ConflictException('No se pudo confirmar la imputacion');
  }
}
