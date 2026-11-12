import { managedProspectWhere } from './customer-lifecycle';
import { ensureReturningProspect, isReturningProspect, returningSituation } from './returning-customer';

// Subconjunto del predicado de Prisma sobre filas en memoria; no se instancia base ni cliente.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (value === null || typeof value !== 'object') return row[key] === value;
    if ('is' in value) return row[key] != null && matches(row[key], value.is);
    if ('some' in value) return row[key].some((child: any) => matches(child, value.some));
    if ('none' in value) return !row[key].some((child: any) => matches(child, value.none));
    if ('in' in value) return value.in.includes(row[key]);
    if ('notIn' in value) return !value.notIn.includes(row[key]);
    if ('not' in value) return row[key] !== null && row[key] !== value.not;
    throw new Error(`Unsupported fixture predicate: ${key}`);
  });
}

const prospectRow = (over: Record<string, unknown> = {}) => ({
  idProspecto: 10, idEmpresa: 1, idCliente: 30, clasificacionComercial: 'EXCLIENTE', estadoPipeline: 'Fuera pipeline', contratos: [],
  cliente: { servicios: [{ idEmpresa: 1, estadoOperativo: 'Baja' }], contratos: [{ idEmpresa: 1, estado: 'Baja' }] }, ...over,
});

describe('Excliente: visibilidad en Prospectos sin duplicar identidades', () => {
  const where = managedProspectWhere({ idEmpresa: 1 }, [1, 2]);

  it('sin empresas a considerar conserva exactamente la consulta anterior', () => {
    expect(managedProspectWhere({ idEmpresa: 1 })).toEqual({
      AND: [{ idEmpresa: 1 }, { idCliente: null }, { contratos: { none: { estado: { in: ['Firmado', 'Activo', 'Suspendido', 'Moroso'] } } } }],
    });
  });

  it('un excliente vinculado, sin servicios ni contratos operativos en su empresa, es visible', () => {
    expect(matches(prospectRow(), where)).toBe(true);
  });

  it('servicio o contrato operativo vigente en la misma empresa lo oculta sin escribir nada', () => {
    const active = prospectRow({ cliente: { servicios: [{ idEmpresa: 1, estadoOperativo: 'Activo' }], contratos: [] } });
    const contract = prospectRow({ cliente: { servicios: [], contratos: [{ idEmpresa: 1, estado: 'Pendiente firma contrato' }] } });
    expect(matches(active, where)).toBe(false);
    expect(matches(contract, where)).toBe(false);
    expect(active.clasificacionComercial).toBe('EXCLIENTE');
  });

  it('el servicio activo en la OTRA empresa no impide ser excliente en esta', () => {
    const shared = prospectRow({ cliente: { servicios: [{ idEmpresa: 1, estadoOperativo: 'Baja' }, { idEmpresa: 2, estadoOperativo: 'Activo' }], contratos: [{ idEmpresa: 2, estado: 'Activo' }] } });
    expect(matches(shared, where)).toBe(true);
    expect(matches(shared, managedProspectWhere({ idEmpresa: 2 }, [1, 2]))).toBe(false);
  });

  it('contratos en Baja o Anulado no son relación operativa', () => {
    const closed = prospectRow({ cliente: { servicios: [], contratos: [{ idEmpresa: 1, estado: 'Baja' }, { idEmpresa: 1, estado: 'Anulado' }] } });
    expect(matches(closed, where)).toBe(true);
  });

  it('un prospecto convertido en cliente que NO está marcado EXCLIENTE sigue fuera del listado', () => {
    expect(matches(prospectRow({ clasificacionComercial: 'CLIENTE' }), where)).toBe(false);
    expect(matches(prospectRow({ clasificacionComercial: 'PROSPECTO' }), where)).toBe(false);
  });

  it('un prospecto sin cliente vinculado conserva su visibilidad habitual y nunca cuenta como excliente', () => {
    const unlinked = prospectRow({ idCliente: null, cliente: null });
    expect(matches(unlinked, where)).toBe(true); // por la vía normal de siempre, no por la de retorno
    expect(isReturningProspect(unlinked)).toBe(false);
    expect(matches(unlinked, { AND: [{ idEmpresa: 1 }, { idCliente: { not: null } }] })).toBe(false);
  });

  it('el alcance por empresa se respeta: otra empresa no ve el excliente', () => {
    expect(matches(prospectRow({ idEmpresa: 2 }), where)).toBe(false);
  });

  it('prospectos nuevos y perdidos siguen visibles como antes', () => {
    const lead = { idEmpresa: 1, idCliente: null, clasificacionComercial: 'PROSPECTO', estadoPipeline: 'Perdido', contratos: [], cliente: null };
    expect(matches(lead, where)).toBe(true);
    expect(isReturningProspect(lead)).toBe(false);
    expect(isReturningProspect(prospectRow())).toBe(true);
  });
});

describe('Excliente: marcar al terminar la última relación operativa', () => {
  const customer = { idCliente: 30, idEmpresa: 1, rut: '12.345.678-5', nombreCompleto: 'Cliente Historico', email: 'c@example.invalid', telefono: '+56900000000', estado: 'Baja' };
  type Row = Record<string, any>;

  function setup(opts: { customer?: Row | null; services?: Row[]; contracts?: Row[]; prospects?: Row[] } = {}) {
    const prospects: Row[] = [...(opts.prospects ?? [])]; const services = opts.services ?? []; const contracts = opts.contracts ?? [];
    let nextId = 100;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cliente: { findUnique: jest.fn().mockResolvedValue(opts.customer === undefined ? customer : opts.customer), update: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
      servicioContratado: { count: jest.fn(async ({ where }: any) => services.filter(s => s.idEmpresa === where.idEmpresa && s.estadoOperativo !== 'Baja').length) },
      contrato: { count: jest.fn(async ({ where }: any) => contracts.filter(c => c.idEmpresa === where.idEmpresa && !where.estado.notIn.includes(c.estado)).length) },
      prospecto: {
        findFirst: jest.fn(async ({ where }: any) => where.idCliente === null
          ? prospects.find(p => p.idEmpresa === where.idEmpresa && p.idCliente === null && where.rut.in.includes(p.rut)) ?? null
          : prospects.find(p => p.idEmpresa === where.idEmpresa && p.idCliente === where.idCliente) ?? null),
        create: jest.fn(async ({ data }: any) => { const row = { idProspecto: nextId++, ...data }; prospects.push(row); return row; }),
        update: jest.fn(async ({ where, data }: any) => Object.assign(prospects.find(p => p.idProspecto === where.idProspecto)!, data)),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const run = (idEmpresa = 1) => ensureReturningProspect(tx as never, audit as never, { idCliente: 30, idEmpresa, idUsuario: 5 });
    return { tx, audit, prospects, run };
  }

  it('sin prospecto previo crea UNO vinculado al cliente con su identidad, sin crear ni modificar al cliente', async () => {
    const c = setup({ contracts: [{ idEmpresa: 1, estado: 'Baja' }], services: [{ idEmpresa: 1, estadoOperativo: 'Baja' }] });
    const result = await c.run();
    expect(result).toEqual({ action: 'CREADO', idProspecto: 100 });
    expect(c.tx.prospecto.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      idCliente: 30, idEmpresa: 1, rut: '12345678-5', nombreCompleto: 'Cliente Historico', estadoPipeline: 'Fuera pipeline',
      clasificacionComercial: 'EXCLIENTE', disponibleRemarketing: true, origenContacto: 'Excliente' }) });
    for (const method of ['update', 'create', 'delete', 'deleteMany'] as const) expect(c.tx.cliente[method]).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledTimes(1);
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'MARCAR_EXCLIENTE_PROSPECTO', entidadAfectada: 'prospecto', idEntidadAfectada: 100 }), c.tx);
  });

  it('serializa sobre la fila del cliente antes de decidir', async () => {
    const c = setup(); await c.run();
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(c.tx.cliente.findUnique.mock.invocationCallOrder[0]);
  });

  it('reutiliza el prospecto histórico vinculado: marca la clasificación y no crea otro', async () => {
    const c = setup({ prospects: [{ idProspecto: 10, idEmpresa: 1, idCliente: 30, rut: '12345678-5', clasificacionComercial: 'CLIENTE', estadoPipeline: 'Servicio Activo', disponibleRemarketing: false }] });
    expect(await c.run()).toEqual({ action: 'REUTILIZADO', idProspecto: 10 });
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.tx.prospecto.update).toHaveBeenCalledWith({ where: { idProspecto: 10 }, data: { clasificacionComercial: 'EXCLIENTE', disponibleRemarketing: true } });
    expect(c.prospects[0].estadoPipeline).toBe('Servicio Activo');
  });

  it('es idempotente: repetir la operación no crea ni audita de nuevo', async () => {
    const c = setup();
    const first = await c.run(); const second = await c.run();
    expect(first.action).toBe('CREADO'); expect(second).toEqual({ action: 'YA_MARCADO', idProspecto: 100 });
    expect(c.prospects).toHaveLength(1);
    expect(c.audit.record).toHaveBeenCalledTimes(1);
  });

  it('si conserva otro servicio o contrato operativo en la misma empresa NO pasa a excliente', async () => {
    for (const over of [{ services: [{ idEmpresa: 1, estadoOperativo: 'Activo' }] }, { contracts: [{ idEmpresa: 1, estado: 'Firmado' }] }]) {
      const c = setup(over);
      expect(await c.run()).toEqual({ action: 'MANTIENE_RELACION_OPERATIVA' });
      expect(c.tx.prospecto.create).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
    }
  });

  it('la relación operativa en la otra empresa no impide ser excliente en esta', async () => {
    const c = setup({ services: [{ idEmpresa: 2, estadoOperativo: 'Activo' }, { idEmpresa: 1, estadoOperativo: 'Baja' }], contracts: [{ idEmpresa: 2, estado: 'Activo' }] });
    expect((await c.run(1)).action).toBe('CREADO');
    expect(c.prospects[0].idEmpresa).toBe(1);
  });

  it('un prospecto con el mismo RUT (otro formato) sin vínculo no se modifica ni se duplica: queda para revisión', async () => {
    const c = setup({ prospects: [{ idProspecto: 55, idEmpresa: 1, idCliente: null, rut: '12345678-5', clasificacionComercial: 'PROSPECTO' }] });
    expect(await c.run()).toEqual({ action: 'PROSPECTO_SIN_VINCULO_EXISTENTE', idProspecto: 55 });
    expect(c.tx.prospecto.create).not.toHaveBeenCalled(); expect(c.tx.prospecto.update).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'EXCLIENTE_REQUIERE_REVISION_PROSPECTO', idEntidadAfectada: 55 }), c.tx);
  });

  it('un cliente inexistente no escribe nada', async () => {
    const c = setup({ customer: null });
    expect(await c.run()).toEqual({ action: 'CLIENTE_INEXISTENTE' });
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
  });

  it('un fallo de auditoría se propaga para que la transacción de la baja revierta todo', async () => {
    const c = setup(); c.audit.record.mockRejectedValueOnce(new Error('AUDIT_FAILED'));
    await expect(c.run()).rejects.toThrow('AUDIT_FAILED');
  });
});

describe('Excliente: situación financiera calculada, nunca guardada', () => {
  const row = { idCliente: 30, idEmpresa: 1, rut: '12345678-5', clasificacionComercial: 'EXCLIENTE' };
  const db = (invoices: any[]) => ({ factura: { findMany: jest.fn().mockResolvedValue(invoices) } }) as never;
  const unpaid = { monto: 20000, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [] };

  it.each([
    ['sin facturas', [], 'SIN_DEUDA', 'Excliente sin deuda'],
    ['factura pagada', [{ ...unpaid, estado: 'Pagada', pagos: [{ monto: 20000 }] }], 'SIN_DEUDA', 'Excliente sin deuda'],
    ['factura anulada', [{ ...unpaid, estado: 'Anulada' }], 'SIN_DEUDA', 'Excliente sin deuda'],
    ['saldo pendiente', [unpaid], 'CON_DEUDA', 'Excliente con deuda pendiente'],
    ['saldo parcial', [{ ...unpaid, pagos: [{ monto: 5000 }] }], 'CON_DEUDA', 'Excliente con deuda pendiente'],
    ['monto histórico indeterminado', [{ ...unpaid, monto: null }], 'INDETERMINADA', 'Excliente con saldo por revisar'],
  ])('%s', async (_name, invoices, position, label) => {
    expect(await returningSituation(db(invoices), row)).toEqual({ situacionFinanciera: position, etiqueta: label });
  });

  it('la deuda se acota a la empresa del prospecto y sin empresa queda indeterminada', async () => {
    const client = db([unpaid]);
    await returningSituation(client, row);
    expect((client as any).factura.findMany.mock.calls[0][0].where.contrato.idEmpresa).toBe(1);
    expect((await returningSituation(db([unpaid]), { ...row, idEmpresa: null })).situacionFinanciera).toBe('INDETERMINADA');
  });

  it('pagar la deuda íntegramente cambia la etiqueta sin tocar el registro', async () => {
    expect((await returningSituation(db([unpaid]), row)).situacionFinanciera).toBe('CON_DEUDA');
    expect((await returningSituation(db([{ ...unpaid, estado: 'Pagada', pagos: [{ monto: 20000 }] }]), row)).situacionFinanciera).toBe('SIN_DEUDA');
  });
});
