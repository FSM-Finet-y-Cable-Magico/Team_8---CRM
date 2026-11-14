import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { evaluateSuspension, SuspensionFacts, SuspensionInvoice } from './suspension-eligibility';

/** CU-30 (FINET 13-11-2026): automatic eligibility, manual execution. Clock fixed at 2026-11-13. */
const TODAY = new Date('2026-11-13T00:00:00.000Z');
const CUT = 5;
const due = (daysAgo: number) => new Date(TODAY.getTime() - daysAgo * 86_400_000);

function bill(overrides: Partial<SuspensionInvoice> = {}): SuspensionInvoice {
  return { idFactura: 80, monto: new Prisma.Decimal(20_000), estado: 'Pendiente', fechaLimitePago: due(CUT), pagos: [], prorrogasPago: [], conveniosPago: [], ...overrides };
}
function facts(overrides: Partial<SuspensionFacts> = {}): SuspensionFacts {
  return {
    contrato: { idContrato: 30, idEmpresa: 1, idCliente: 10, estado: 'Moroso' }, cliente: { idCliente: 10 },
    facturas: [bill()], servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Activo', tipoServicio: 'Internet' }], cutDays: CUT, ...overrides,
  };
}
const evaluate = (overrides: Partial<SuspensionFacts> = {}) => evaluateSuspension(facts(overrides), TODAY);

describe('evaluateSuspension: elegibilidad automática del corte (CU-30)', () => {
  it.each([
    [CUT - 1, false, 'BAJO_UMBRAL_CORTE'],
    [CUT, true, null],
    [CUT + 1, true, null],
  ])('%i días de atraso con umbral %i → elegible=%s', (days, eligible, code) => {
    const result = evaluate({ facturas: [bill({ fechaLimitePago: due(days as number) })] });
    expect(result.elegible).toBe(eligible);
    expect(result.motivo?.code ?? null).toBe(code);
    expect(result.umbralDias).toBe(CUT);
    expect(result.motivoSuspension).toBe('NO PAGO');
  });

  it('respeta el umbral configurado, no un valor fijo', () => {
    expect(evaluate({ cutDays: 20, facturas: [bill({ fechaLimitePago: due(19) })] }).motivo?.code).toBe('BAJO_UMBRAL_CORTE');
    expect(evaluate({ cutDays: 20, facturas: [bill({ fechaLimitePago: due(20) })] }).elegible).toBe(true);
  });

  it.each([
    ['saldo 0 (pagada con pagos)', bill({ pagos: [{ monto: 20_000 }] })],
    ['factura Pagada', bill({ estado: 'Pagada' })],
    ['factura Anulada', bill({ estado: 'Anulada' })],
    ['deuda futura', bill({ fechaLimitePago: new Date(TODAY.getTime() + 3 * 86_400_000) })],
    ['sin monto fiable', bill({ monto: null })],
  ])('%s no habilita el corte', (_label, invoice) => {
    const result = evaluate({ facturas: [invoice] });
    expect(result.elegible).toBe(false);
    expect(result.motivo?.code).toBe('SIN_DEUDA_VENCIDA');
  });

  it('pago parcial: el saldo restante vencido sí habilita el corte', () => {
    const result = evaluate({ facturas: [bill({ pagos: [{ monto: 5_000 }] })] });
    expect(result.elegible).toBe(true);
    expect(result.facturas).toEqual([expect.objectContaining({ idFactura: 80, saldoExigible: 15_000, diasAtraso: CUT })]);
  });

  it('una prórroga aprobada vigente desplaza el vencimiento efectivo', () => {
    const extended = bill({ fechaLimitePago: due(30), prorrogasPago: [{ nuevaFecha: due(2), estado: 'APROBADA' }] });
    expect(evaluate({ facturas: [extended] }).motivo?.code).toBe('BAJO_UMBRAL_CORTE');
  });

  it.each(['APROBADO', 'ACTIVO'])('convenio %s cubre la deuda: no corresponde suspender', estado => {
    const result = evaluate({ facturas: [bill({ fechaLimitePago: due(40), conveniosPago: [{ estado }] })] });
    expect(result.elegible).toBe(false);
    expect(result.motivo?.code).toBe('DEUDA_CUBIERTA_POR_CONVENIO');
  });

  it.each(['CADUCADO', 'INCUMPLIDO', 'ANULADO'])('convenio %s no cubre la deuda', estado => {
    expect(evaluate({ facturas: [bill({ conveniosPago: [{ estado }] })] }).elegible).toBe(true);
  });

  it('una factura cubierta no impide el corte por otra vencida sin convenio', () => {
    const result = evaluate({ facturas: [bill({ conveniosPago: [{ estado: 'ACTIVO' }] }), bill({ idFactura: 81, fechaLimitePago: due(9) })] });
    expect(result.elegible).toBe(true);
    expect(result.facturas.map(item => item.idFactura)).toEqual([81]);
    expect(result.deuda).toEqual(expect.objectContaining({ facturasVencidas: 2, cubiertasPorConvenio: 1, facturasSobreUmbral: 1 }));
  });

  it.each(['Baja', 'Anulado', 'Pendiente', 'Firmado'])('contrato en estado %s no se suspende', estado => {
    expect(evaluate({ contrato: { idContrato: 30, idEmpresa: 1, idCliente: 10, estado } }).motivo?.code).toBe('ESTADO_CONTRATO');
  });

  it('contrato ya suspendido sin servicios activos: idempotente, sin escritura', () => {
    const result = evaluate({ contrato: { idContrato: 30, idEmpresa: 1, idCliente: 10, estado: 'Suspendido' }, servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Suspendido' }] });
    expect(result).toEqual(expect.objectContaining({ elegible: false, yaSuspendido: true }));
  });

  it('solo afecta servicios activos de este contrato y empresa', () => {
    const result = evaluate({ servicios: [
      { idServicio: 55, idEmpresa: 1, estadoOperativo: 'Activo' }, { idServicio: 56, idEmpresa: 1, estadoOperativo: 'Activo' },
      { idServicio: 57, idEmpresa: 2, estadoOperativo: 'Activo' }, { idServicio: 58, idEmpresa: 1, estadoOperativo: 'Baja' },
    ] });
    expect(result.serviciosAfectados.map(item => item.idServicio)).toEqual([55, 56]);
  });

  it('sin servicios activos que suspender no habilita el botón', () => {
    expect(evaluate({ servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Suspendido' }] }).motivo?.code).toBe('SIN_SERVICIOS_ACTIVOS');
  });

  it('cliente y contrato que no corresponden bloquean', () => {
    expect(evaluate({ cliente: { idCliente: 99 } }).motivo?.code).toBe('CONTRATO_INCONSISTENTE');
    expect(evaluate({ contrato: { idContrato: 30, idEmpresa: null, idCliente: 10, estado: 'Moroso' } }).motivo?.code).toBe('CONTRATO_INCONSISTENTE');
  });
});

describe('BillingService.suspendContract: revalida y escribe todo o nada', () => {
  const commercial: AuthUser = { idUsuario: 7, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
  const support: AuthUser = { ...commercial, idUsuario: 8, roles: ['Soporte'] };
  const otherCompany: AuthUser = { ...commercial, idUsuario: 9, idEmpresa: 2 };

  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-13T12:00:00.000Z') }));
  afterEach(() => jest.useRealTimers());

  function contract(overrides: Record<string, unknown> = {}) {
    return {
      idContrato: 30, idCliente: 10, idEmpresa: 1, estado: 'Moroso', cliente: { idCliente: 10, idEmpresa: 1, estado: 'Moroso', nombreCompleto: 'QA' },
      facturas: [bill({ fechaLimitePago: due(12) })],
      servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Activo', tipoServicio: 'Internet' }, { idServicio: 57, idEmpresa: 2, estadoOperativo: 'Activo', tipoServicio: 'TV' }],
      ...overrides,
    };
  }
  function setup(rows: Array<Record<string, unknown>>, { failSerialization = 0, auditFails = false } = {}) {
    let read = 0;
    const tx = {
      contrato: { findUnique: jest.fn(async () => rows[Math.min(read++, rows.length - 1)]), update: jest.fn(async ({ data }) => ({ ...rows[0], ...data })), findFirst: jest.fn().mockResolvedValue(null) },
      cliente: { updateMany: jest.fn() }, servicioContratado: { updateMany: jest.fn() },
    };
    const audit = { record: jest.fn(async () => { if (auditFails) throw new Error('AUDIT_FAILED'); }) };
    let failures = failSerialization;
    const prisma = {
      ...tx, empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Finet' }) },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual({ isolationLevel: 'Serializable' });
        if (failures-- > 0) throw Object.assign(new Error('serialization'), { code: 'P2034' });
        return work(tx);
      }),
    };
    const service = new BillingService(prisma as unknown as PrismaService, audit as unknown as AuditService, { get: jest.fn().mockReturnValue(String(CUT)) } as unknown as ConfigService);
    return { service, tx, audit, prisma };
  }

  it('suspende contrato, servicios activos de la empresa y cliente, con auditoría NO PAGO y observación', async () => {
    const { service, tx, audit } = setup([contract()]);
    const result = await service.suspendContract(30, commercial, { observacion: '  Cliente no responde  ' });
    expect(result).toEqual(expect.objectContaining({ estado: 'Suspendido', yaSuspendido: false, serviciosSuspendidos: [55] }));
    expect(tx.servicioContratado.updateMany).toHaveBeenCalledWith({ where: { idServicio: { in: [55] }, idContrato: 30, idEmpresa: 1, estadoOperativo: 'Activo' }, data: { estadoOperativo: 'Suspendido' } });
    expect(tx.cliente.updateMany).toHaveBeenCalledWith({ where: { idCliente: 10, idEmpresa: 1, estado: { not: 'Baja' } }, data: { estado: 'Suspendido' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'SUSPENDER_SERVICIO_NO_PAGO', valorNuevo: expect.objectContaining({
      motivo: 'NO PAGO', observacion: 'Cliente no responde', umbralDias: CUT, facturasVencidas: [80], serviciosSuspendidos: [55] }) }), tx);
  });

  it('no actualiza el estado global de un cliente compartido con otra empresa', async () => {
    const { service, tx } = setup([contract()]);
    tx.contrato.findFirst.mockResolvedValue({ idContrato: 31 });
    await service.suspendContract(30, commercial);
    expect(tx.cliente.updateMany).not.toHaveBeenCalled();
  });

  it('deuda cubierta por convenio activo: rechaza sin escribir', async () => {
    const { service, tx, audit } = setup([contract({ facturas: [bill({ fechaLimitePago: due(40), conveniosPago: [{ estado: 'ACTIVO' }] })] })]);
    await expect(service.suspendContract(30, commercial)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUSPENSION_NOT_ELIGIBLE', requisito: 'DEUDA_CUBIERTA_POR_CONVENIO' }) });
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(tx.servicioContratado.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('pago concurrente: la transacción serializable reintenta, relee el saldo pagado y no suspende', async () => {
    const paid = contract({ facturas: [bill({ fechaLimitePago: due(12), pagos: [{ monto: 20_000 }] })] });
    const { service, tx, prisma } = setup([paid], { failSerialization: 1 });
    await expect(service.suspendContract(30, commercial)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.contrato.update).not.toHaveBeenCalled();
  });

  it('doble suspensión: la segunda no escribe ni audita de nuevo', async () => {
    const { service, tx, audit } = setup([contract({ estado: 'Suspendido', servicios: [{ idServicio: 55, idEmpresa: 1, estadoOperativo: 'Suspendido' }] })]);
    await expect(service.suspendContract(30, commercial)).resolves.toEqual(expect.objectContaining({ yaSuspendido: true, serviciosSuspendidos: [] }));
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('auditoría fallida: la transacción completa falla (nada queda suspendido)', async () => {
    const { service } = setup([contract()], { auditFails: true });
    await expect(service.suspendContract(30, commercial)).rejects.toThrow('AUDIT_FAILED');
  });

  it('roles y empresa: Soporte no suspende; otra empresa no accede', async () => {
    await expect(setup([contract()]).service.suspendContract(30, support)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup([contract()]).service.suspensionEligibility(30, support)).rejects.toBeInstanceOf(ForbiddenException);
    const { service, tx } = setup([contract()]);
    await expect(service.suspendContract(30, otherCompany)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contrato.update).not.toHaveBeenCalled();
  });

  it('la consulta de elegibilidad es de solo lectura y usa la misma regla', async () => {
    const { service, tx, audit } = setup([contract()]);
    const result = await service.suspensionEligibility(30, commercial);
    expect(result).toEqual(expect.objectContaining({ idContrato: 30, elegible: true, umbralDias: CUT, motivoSuspension: 'NO PAGO',
      empresa: { idEmpresa: 1, nombre: 'Finet' }, serviciosAfectados: [{ idServicio: 55, tipoServicio: 'Internet' }] }));
    expect(tx.contrato.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
