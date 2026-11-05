import { activeCustomerWhere, activeProspectWhere, pendingActivationWhere, resolveCustomerLifecycleStatus } from './customer-lifecycle';

// In-memory Prisma predicate subset for fixtures; no database/client is instantiated.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (value === null || typeof value !== 'object') return row[key] === value;
    if ('some' in value) return row[key].some((child: any) => matches(child, value.some));
    if ('none' in value) return !row[key].some((child: any) => matches(child, value.none));
    if ('in' in value) return value.in.includes(row[key]);
    if ('notIn' in value) return !value.notIn.includes(row[key]);
    if ('not' in value) return row[key] !== null && row[key] !== value.not;
    throw new Error(`Unsupported fixture predicate: ${key}`);
  });
}

describe('Customer lifecycle: relaciones, no etiquetas historicas', () => {
  const customers = [
    { idCliente: 1, idEmpresa: 1, estado: 'Activo', contratos: [{ idEmpresa: 1 }], servicios: [{ idEmpresa: 1, estadoOperativo: 'Activo' }] },
    { idCliente: 2, idEmpresa: 2, estado: 'Activo', contratos: [{ idEmpresa: 2 }], servicios: [{ idEmpresa: 2, estadoOperativo: 'Activo' }] },
    { idCliente: 3, idEmpresa: 1, estado: 'Moroso', contratos: [{ idEmpresa: 1 }, { idEmpresa: 2 }], servicios: [
      { idEmpresa: 1, estadoOperativo: 'Suspendido' }, { idEmpresa: 2, estadoOperativo: 'Activo' },
    ] },
    { idCliente: 4, idEmpresa: 2, estado: 'Activo', contratos: [], servicios: [] },
  ];

  it.each([[1, [1]], [2, [2, 3]]] as const)('cuenta activos solo por servicios de empresa %i', (idEmpresa, expected) => {
    const predicate = activeCustomerWhere({
      OR: [{ idEmpresa }, { contratos: { some: { idEmpresa } } }],
    }, { idEmpresa });
    expect(customers.filter((row) => matches(row, predicate)).map((row) => row.idCliente)).toEqual(expected);
    expect(customers[2].estado).toBe('Moroso');
  });

  it('consolidado no duplica compartidos ni cuenta registrado sin servicio', () => {
    expect(customers.filter((row) => matches(row, activeCustomerWhere({}, {}))).map((row) => row.idCliente)).toEqual([1, 2, 3]);
  });

  const base = { idEmpresa: 1, idCliente: null, clasificacionComercial: 'PROSPECTO', estadoPipeline: 'Prospecto Nuevo', contratos: [] };
  const signed = { idEmpresa: 1, estado: 'Firmado', servicios: [] };
  const cases = [
    { name: 'sin contrato', row: base, prospect: true, pending: false },
    { name: 'firma pendiente', row: { ...base, contratos: [{ ...signed, estado: 'Pendiente firma contrato' }] }, prospect: true, pending: false },
    { name: 'firmado sin activacion', row: { ...base, contratos: [signed] }, prospect: false, pending: true },
    { name: 'cliente compartido esperando segundo contrato', row: { ...base, idCliente: 3, clasificacionComercial: 'CLIENTE', contratos: [signed] }, prospect: false, pending: true },
    { name: 'servicio activo', row: { ...base, idCliente: 3, contratos: [{ ...signed, servicios: [{ estadoOperativo: 'Activo' }] }] }, prospect: false, pending: false },
    { name: 'servicio suspendido', row: { ...base, idCliente: 3, contratos: [{ ...signed, estado: 'Suspendido', servicios: [{ estadoOperativo: 'Suspendido' }] }] }, prospect: false, pending: false },
    { name: 'servicio moroso', row: { ...base, idCliente: 3, contratos: [{ ...signed, estado: 'Moroso', servicios: [{ estadoOperativo: 'Moroso' }] }] }, prospect: false, pending: false },
    { name: 'etiquetas falsas sin relaciones', row: { ...base, estadoPipeline: 'Servicio Activo', clasificacionComercial: 'CLIENTE' }, prospect: true, pending: false },
    { name: 'contrato ajeno requiere auditoria', row: { ...base, contratos: [{ ...signed, idEmpresa: 2 }] }, prospect: false, pending: false },
    { name: 'prospecto de otra empresa', row: { ...base, idEmpresa: 2 }, prospect: false, pending: false },
    { name: 'Perdido sin contrato', row: { ...base, estadoPipeline: 'Perdido' }, prospect: false, pending: false },
    { name: 'Perdido con firma real para revision', row: { ...base, estadoPipeline: 'Perdido', contratos: [signed] }, prospect: false, pending: true },
  ];
  it.each(cases)('$name', ({ row, prospect, pending }) => {
    const snapshot = JSON.stringify(row);
    expect(matches(row, activeProspectWhere({ idEmpresa: 1 }))).toBe(prospect);
    expect(matches(row, pendingActivationWhere({ idEmpresa: 1 }))).toBe(pending);
    expect(JSON.stringify(row)).toBe(snapshot);
  });

  it('consolidado exige la misma empresa en prospecto y contrato', () => {
    const predicate = { OR: [1, 2].map((idEmpresa) => pendingActivationWhere({ idEmpresa })) };
    expect(matches({ ...base, contratos: [{ ...signed, idEmpresa: 2 }] }, predicate)).toBe(false);
    expect(matches({ ...base, contratos: [signed] }, predicate)).toBe(true);
    expect(matches({ ...base, idEmpresa: 2, contratos: [{ ...signed, idEmpresa: 2 }] }, predicate)).toBe(true);
  });

  it.each(['Moroso', 'Suspendido'])('no sobreescribe el estado financiero global %s', (currentStatus) => {
    expect(resolveCustomerLifecycleStatus({ currentStatus, contractStates: ['Activo'], serviceStates: ['Activo'] })).toBe(currentStatus);
  });
});
