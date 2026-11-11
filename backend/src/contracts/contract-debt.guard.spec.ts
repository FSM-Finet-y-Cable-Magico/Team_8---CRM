import { Prisma } from '@prisma/client';
import { assertNoContractDebt, auditContractDebtRejection, ContractDebtException } from './contract-debt.guard';

const actor = { idEmpresa: 1, idCliente: 10, rut: '11111111-1', idUsuario: 2 };
const invoice = (overrides = {}) => ({ estado: 'Pendiente', monto: 7000,
  fechaLimitePago: new Date('2026-01-01'), pagos: [], prorrogasPago: [], ...overrides });
function setup(invoices: unknown[] = []) {
  const tx = { factura: { findMany: jest.fn().mockResolvedValue(invoices) } };
  return { tx, check: (context = actor) => assertNoContractDebt(tx as never, context) };
}

describe('Veto contractual con saldo exigible del Libro de Control', () => {
  it.each([
    ['sin pago', invoice()],
    ['pago parcial', invoice({ pagos: [{ monto: 3500 }] })],
    ['convenio', invoice({ conveniosPago: [{ estado: 'VIGENTE' }] })],
    ['prorroga aprobada futura', invoice({ prorrogasPago: [{ nuevaFecha: new Date('2099-01-01'), estado: 'APROBADA' }] })],
  ])('mantiene veto por %s, sin exponer saldos o identidad', async (_label, row) => {
    const { check } = setup([row]);
    await expect(check()).rejects.toMatchObject({ response: { code: 'CONTRACT_CUSTOMER_DEBT' } });
    try { await check(); } catch (error) {
      expect(JSON.stringify((error as ContractDebtException).getResponse())).not.toContain(actor.rut);
      expect(JSON.stringify(error)).not.toContain(actor.rut);
      expect(JSON.stringify((error as ContractDebtException).getResponse())).not.toContain('7000');
    }
  });

  it.each([
    ['pago total', invoice({ pagos: [{ monto: 3500 }, { monto: 3500 }] })],
    ['pago superior', invoice({ pagos: [{ monto: 8000 }] })],
    ['anulada', invoice({ estado: 'Anulada' })],
    ['pagada regularizada', invoice({ estado: 'Pagada' })],
    ['anulada sin monto', invoice({ estado: 'Anulada', monto: null })],
  ])('permite continuar por %s sin crear ni firmar nada', async (_label, row) => {
    await expect(setup([row]).check()).resolves.toBeUndefined();
  });

  it('deuda en cualquier factura conserva veto aunque otras esten pagadas', async () => {
    await expect(setup([invoice({ estado: 'Pagada' }), invoice()]).check()).rejects.toBeInstanceOf(ContractDebtException);
  });

  it('no presume regularizacion de un documento abierto sin monto', async () => {
    await expect(setup([invoice({ monto: null })]).check()).rejects.toMatchObject({ response: { code: 'CONTRACT_FINANCIAL_REVIEW' } });
  });

  it('acota deuda a la empresa contractual y reconoce alias sin autorizar asociaciones', async () => {
    const { tx, check } = setup();
    await check({ ...actor, idEmpresa: 2, rut: '11.111.111-1' });
    expect(tx.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      contrato: { idEmpresa: 2, OR: expect.arrayContaining([
        { idCliente: 10 }, { cliente: { rut: { in: expect.arrayContaining(['11111111-1', '111111111', '11.111.111-1']), mode: 'insensitive' } } },
      ]) },
    } }));
    expect(Object.keys(tx)).toEqual(['factura']);
  });

  it('prospecto nuevo con mismo RUT no evita el control sobre identidad historica', async () => {
    const c = setup([invoice()]);
    await expect(assertNoContractDebt(c.tx as never, { idEmpresa: 1, rut: '111111111', idProspecto: 20, idUsuario: 2 }))
      .rejects.toBeInstanceOf(ContractDebtException);
    expect(c.tx.factura.findMany.mock.calls[0][0].where.contrato.OR).not.toContainEqual({ idCliente: undefined });
  });

  it('empresa o identidad indeterminada exige revision sin consultar deuda ajena', async () => {
    const c = setup();
    await expect(assertNoContractDebt(c.tx as never, { idEmpresa: null, idCliente: 10, idUsuario: 2 })).rejects.toBeInstanceOf(ContractDebtException);
    await expect(assertNoContractDebt(c.tx as never, { idEmpresa: 1, rut: 'invalido', idUsuario: 2 })).rejects.toBeInstanceOf(ContractDebtException);
    expect(c.tx.factura.findMany).not.toHaveBeenCalled();
  });

  it('audita la negativa despues del rollback sin almacenar RUT ni saldos', async () => {
    const tx = {};
    const db = { $transaction: jest.fn(work => work(tx)) };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const error = new ContractDebtException(actor, 'DEUDA_PENDIENTE');
    await expect(auditContractDebtRejection(db as never, audit as never, error)).rejects.toBe(error);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'BLOQUEAR_CONTRATACION_POR_DEUDA', valorNuevo: { idEmpresa: 1, idCliente: 10, idProspecto: null, motivo: 'DEUDA_PENDIENTE' },
    }), tx);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(actor.rut);
  });

  it('no oculta fallo de auditoria ni clasifica errores SQL como deuda', async () => {
    const db = { $transaction: jest.fn().mockRejectedValue(new Error('AUDIT_FAILED')) };
    await expect(auditContractDebtRejection(db as never, {} as never, new ContractDebtException(actor, 'DEUDA_PENDIENTE'))).rejects.toThrow('AUDIT_FAILED');
    db.$transaction.mockClear();
    const error = new Prisma.PrismaClientKnownRequestError('QA conflict', { code: 'P2034', clientVersion: '5.22.0' });
    await expect(auditContractDebtRejection(db as never, {} as never, error)).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
    const unrelated = new Prisma.PrismaClientKnownRequestError('QA SQL', { code: 'P2010', clientVersion: '5.22.0', meta: { code: '42P01' } });
    await expect(auditContractDebtRejection(db as never, {} as never, unrelated)).rejects.toBe(unrelated);
  });
});
