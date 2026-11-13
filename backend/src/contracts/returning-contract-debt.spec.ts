import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoContractDebt, ContractDebtException } from './contract-debt.guard';

/*
 * Etapa H: un excliente puede gestionarse, pero no completar una nueva contratación mientras mantenga
 * deuda exigible o un saldo indeterminado EN ESA EMPRESA. Al regularizar vuelve a ser elegible, sin que
 * eso cree contrato, instalación ni servicio. Se usa la misma guarda que ya protege cada punto de contratación.
 */
const unpaid = { monto: 19990, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [] as Array<{ monto: number }>, prorrogasPago: [] };
function tx(invoicesByCompany: Record<number, unknown[]>) {
  const findMany = jest.fn(async ({ where }: any) => structuredClone(invoicesByCompany[where.contrato.idEmpresa] ?? []));
  return { client: { factura: { findMany } } as never, findMany };
}
const context = { idEmpresa: 1, idCliente: 30, rut: '12.345.678-5', idUsuario: 5 };

describe('Nueva contratación de un excliente condicionada a su deuda real', () => {
  it('con deuda exigible en la empresa no puede contratar', async () => {
    const { client } = tx({ 1: [unpaid] });
    await expect(assertNoContractDebt(client, context)).rejects.toMatchObject({ reason: 'DEUDA_PENDIENTE' });
  });

  it('tras pagar íntegramente vuelve a ser elegible; la guarda solo consulta y no crea nada', async () => {
    const { client, findMany } = tx({ 1: [{ ...unpaid, estado: 'Pagada', pagos: [{ monto: 19990 }] }] });
    await expect(assertNoContractDebt(client, context)).resolves.toBeUndefined();
    expect(Object.keys((client as any))).toEqual(['factura']);
    expect(Object.keys((client as any).factura)).toEqual(['findMany']);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('un pago parcial no basta', async () => {
    const { client } = tx({ 1: [{ ...unpaid, pagos: [{ monto: 10000 }] }] });
    await expect(assertNoContractDebt(client, context)).rejects.toBeInstanceOf(ContractDebtException);
  });

  it('deuda histórica de monto indeterminado exige revisión financiera, no se presume pagada', async () => {
    const { client } = tx({ 1: [{ ...unpaid, monto: null }] });
    await expect(assertNoContractDebt(client, context)).rejects.toMatchObject({ reason: 'REVISION_FINANCIERA' });
  });

  it('la deuda en la otra empresa no bloquea esta: el bloqueo no se amplía entre FiNet y Cable Mágico', async () => {
    const { client, findMany } = tx({ 2: [unpaid] });
    await expect(assertNoContractDebt(client, context)).resolves.toBeUndefined();
    expect(findMany.mock.calls[0][0].where.contrato.idEmpresa).toBe(1);
  });

  it('busca la identidad histórica por cliente y por variantes de formato del RUT (alias), sin asociarlas', async () => {
    const { client, findMany } = tx({ 1: [] });
    await assertNoContractDebt(client, context);
    const or = findMany.mock.calls[0][0].where.contrato.OR;
    expect(or).toEqual(expect.arrayContaining([{ idCliente: 30 }]));
    const variants = or.find((part: any) => part.cliente)?.cliente.rut.in as string[];
    expect(variants).toEqual(expect.arrayContaining(['12345678-5']));
  });

  it('sin empresa o sin identidad no se decide: revisión financiera', async () => {
    await expect(assertNoContractDebt(tx({}).client, { ...context, idEmpresa: null })).rejects.toMatchObject({ reason: 'REVISION_FINANCIERA' });
    await expect(assertNoContractDebt(tx({}).client, { idEmpresa: 1, idUsuario: 5 })).rejects.toMatchObject({ reason: 'REVISION_FINANCIERA' });
  });
});

describe('La guarda de deuda sigue presente en cada punto de contratación', () => {
  const source = (relative: string) => readFileSync(join(__dirname, '..', relative), 'utf8');
  it.each([
    ['contracts/contracts.service.ts', 'createCustomerContract', 'nueva contratación de un cliente existente (retorno del excliente)'],
    ['contracts/contracts.service.ts', 'markContractSigned', 'confirmación de firma manual'],
    ['contracts/e-signature.service.ts', 'assertNoContractDebt', 'firma electrónica'],
    ['prospects/prospects.service.ts', 'contractPlan', 'generación de contrato desde un prospecto'],
  ])('%s · %s (%s)', (file, method, _label) => {
    const text = source(file);
    const start = text.indexOf(method === 'assertNoContractDebt' ? 'assertNoContractDebt(tx' : `async ${method}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = text.indexOf('\n  async ', start + 10);
    expect(text.slice(start, next === -1 ? undefined : next)).toContain('assertNoContractDebt(');
  });

  it('un servicio solo puede crearse sobre un contrato firmado y vigente (nunca sobre uno en Baja)', () => {
    const text = source('services/services.service.ts');
    const start = text.indexOf('private async assertContract(');
    expect(text.slice(start, start + 600)).toContain("['Firmado', 'Activo', 'Suspendido', 'Moroso']");
  });
});
