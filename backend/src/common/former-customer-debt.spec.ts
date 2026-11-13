import { assertNoContractDebt } from '../contracts/contract-debt.guard';
import { formerCustomerDebt, formerCustomerLabel } from './returning-customer';

// Consolidation PR #81 (customer-debt.ts) + morosidad branch (derived excliente label): the label shown in Prospectos
// and the recontract guard must never disagree for the same person and company.
const unpaid = { monto: 19990, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [] as Array<{ monto: number }>, prorrogasPago: [] };
const paid = { ...unpaid, estado: 'Pagada', pagos: [{ monto: 19990 }] };
const unknownAmount = { ...unpaid, monto: null };

function db(rows: Array<{ idEmpresa: number; idCliente?: number; rut?: string; invoice: unknown }>) {
  const findMany = jest.fn(async ({ where }: any) => rows
    .filter(row => row.idEmpresa === where.contrato.idEmpresa)
    .filter(row => (where.contrato.OR as any[]).some(identity =>
      (identity.idCliente !== undefined && identity.idCliente === row.idCliente)
      || (identity.cliente?.rut?.in ?? identity.prospecto?.rut?.in ?? []).some((variant: string) => variant.toLowerCase() === row.rut?.toLowerCase())))
    .map(row => structuredClone(row.invoice)));
  return { factura: { findMany } } as never;
}
const guard = (client: never, rut: string | null) => assertNoContractDebt(client, { idEmpresa: 1, idCliente: 30, rut, idUsuario: 5 } as never)
  .then(() => 'PERMITIDA', (error: { reason?: string; response?: { code?: string } }) => error.response?.code ?? error.reason ?? 'RECHAZADA');

describe('Excliente: la etiqueta usa la misma posición de deuda que la guarda de recontratación', () => {
  it('deuda registrada bajo otro formato del mismo RUT: la etiqueta no dice «sin deuda» y la guarda bloquea', async () => {
    const client = db([{ idEmpresa: 1, rut: '12345678-5', invoice: unpaid }]);
    expect(await formerCustomerDebt(client, 30, 1, '12.345.678-5')).toBe('CON_DEUDA');
    expect(formerCustomerLabel('CON_DEUDA')).toBe('Excliente con deuda pendiente');
    expect(await guard(client, '12.345.678-5')).not.toBe('PERMITIDA');
  });

  it('pagada íntegramente: «Excliente sin deuda» y la guarda permite recontratar', async () => {
    const client = db([{ idEmpresa: 1, idCliente: 30, invoice: paid }]);
    expect(await formerCustomerDebt(client, 30, 1, null)).toBe('SIN_DEUDA');
    expect(await guard(client, null)).toBe('PERMITIDA');
  });

  it('monto histórico desconocido: saldo por revisar y la guarda exige revisión, nunca se presume pagado', async () => {
    const client = db([{ idEmpresa: 1, idCliente: 30, invoice: unknownAmount }]);
    expect(await formerCustomerDebt(client, 30, 1, null)).toBe('SALDO_POR_REVISAR');
    expect(await guard(client, null)).not.toBe('PERMITIDA');
  });

  it('la deuda en la otra empresa no cambia la etiqueta ni bloquea en esta', async () => {
    const client = db([{ idEmpresa: 2, idCliente: 30, invoice: unpaid }]);
    expect(await formerCustomerDebt(client, 30, 1, null)).toBe('SIN_DEUDA');
    expect(await guard(client, null)).toBe('PERMITIDA');
  });
});
