import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';

const actor = { idUsuario: 2, idEmpresa: 1, roles: ['Comercial'], email: null, nombreCompleto: 'QA' };
// FINET 13-11-2026: the administrative baja is an Administrador-only exception with a closed non-morosity reason.
const admin = { ...actor, idUsuario: 3, roles: ['Administrador'] };
const adminDto = (observacion = 'Fin de relacion administrativa autorizado') => ({ motivoAdministrativo: 'SOLICITUD_CLIENTE_SIN_DEUDA' as const, observacion });
function setup() {
  const state = { service: { idServicio: 40, idCliente: 10, idContrato: 20, idEmpresa: 1, estadoOperativo: 'Activo', observaciones: null },
    contract: { idContrato: 20, idCliente: 10, idEmpresa: 1, estado: 'Activo' }, customer: 'Activo', audits: [] as unknown[],
    prospects: [] as Array<Record<string, any>>, invoices: [] as Array<Record<string, any>> };
  let otherActive = false;
  const present = () => ({ ...state.service, contrato: { ...state.contract }, cliente: { idCliente: 10 }, ordenes: [], solicitudes: [], equipos: [] });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    servicioContratado: {
      findUnique: jest.fn(async () => present()),
      update: jest.fn(async ({ data }) => { Object.assign(state.service, data); return present(); }),
      count: jest.fn(async () => otherActive ? 1 : 0),
    },
    servicioRetiroSolicitud: { findFirst: jest.fn().mockResolvedValue(null) },
    contrato: {
      update: jest.fn(async ({ data }) => { Object.assign(state.contract, data); return state.contract; }),
      count: jest.fn(async () => ['Baja', 'Anulado'].includes(state.contract.estado) ? 0 : 1),
    },
    factura: { findMany: jest.fn(async () => state.invoices) },
    prospecto: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => state.prospects.find(p => where.idCliente === undefined || p.idCliente === where.idCliente) ?? null),
      create: jest.fn(async ({ data }) => { const row = { idProspecto: 900 + state.prospects.length, ...data }; state.prospects.push(row); return row; }),
      update: jest.fn(),
    },
    cliente: {
      findUnique: jest.fn(async () => ({ estado: state.customer, contratos: [{ estado: state.contract.estado }],
        servicios: [{ estadoOperativo: state.service.estadoOperativo }, ...(otherActive ? [{ estadoOperativo: 'Activo' }] : [])] })),
      update: jest.fn(async ({ data }) => { state.customer = data.estado; }),
    },
    logAuditoria: { create: jest.fn(async ({ data }) => { state.audits.push(data); return data; }) },
  };
  const db = { ...tx, $transaction: jest.fn(async work => {
    const before = structuredClone(state);
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  }) };
  const audit = new AuditService(db as never);
  return { state, tx, db, service: new ServicesService(db as never, audit), other: () => { otherActive = true; } };
}

describe('Suspension, solicitud y baja conservan autoridades distintas', () => {
  it('revalida contrato y empresa bajo bloqueo antes de dar baja', async () => {
    const c = setup();
    const initial = await c.tx.servicioContratado.findUnique();
    c.tx.servicioContratado.findUnique.mockResolvedValueOnce(initial);
    c.state.contract.idEmpresa = 2;
    await expect(c.service.deactivate(40, adminDto(), admin)).rejects.toThrow('no corresponde');
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.service.estadoOperativo).toBe('Activo');
    expect(c.state.audits).toHaveLength(0);
  });
  it('PATCH generico no puede dar de baja ni eludir el endpoint autorizado', async () => {
    const c = setup(); c.state.service.estadoOperativo = 'Suspendido';
    await expect(c.service.update(40, { estadoOperativo: 'Baja' }, actor)).rejects.toThrow('operacion autorizada');
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
  });

  it('retiro por morosidad abierto no puede confirmarse como baja administrativa', async () => {
    const c = setup(); c.state.service.estadoOperativo = 'Suspendido';
    c.tx.servicioRetiroSolicitud.findFirst.mockResolvedValue({ idSolicitudRetiro: 7 } as never);
    await expect(c.service.deactivate(40, adminDto(), admin)).rejects.toThrow('cierre tecnico autorizado');
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.audits).toHaveLength(0);
  });

  it('baja administrativa por otro motivo conserva ruta y auditoria atomica', async () => {
    const c = setup();
    await c.service.deactivate(40, adminDto('Fin de relacion administrativa autorizado'), admin);
    expect(c.state.service.estadoOperativo).toBe('Baja');
    expect(c.state.contract.estado).toBe('Baja');
    expect(c.state.customer).toBe('Baja');
    expect(c.state.audits.map(a => (a as { accion: string }).accion)).toEqual(['DAR_BAJA_SERVICIO', 'EXCLIENTE_VISIBLE_EN_PROSPECTOS']);
    const before = structuredClone(c.state);
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.state).toEqual(before);
    expect(c.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fallo de auditoria revierte servicio, contrato y cliente', async () => {
    const c = setup(); const before = structuredClone(c.state);
    c.tx.logAuditoria.create.mockRejectedValueOnce(new Error('AUDIT_FAILED'));
    await expect(c.service.deactivate(40, adminDto(), admin)).rejects.toThrow('AUDIT_FAILED');
    expect(c.state).toEqual(before);
  });

  it('otro servicio operativo mantiene cliente y contrato sin bajas independientes', async () => {
    const c = setup(); c.other();
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.state.contract.estado).toBe('Activo');
    expect(c.state.customer).toBe('Activo');
    expect(c.tx.cliente.update).not.toHaveBeenCalled();
  });

  it('un usuario no administrador (cualquier empresa) no entra en transaccion ni consulta solicitudes', async () => {
    for (const user of [actor, { ...actor, idEmpresa: 2 }, { ...actor, roles: ['Soporte'] }]) {
      const c = setup();
      await expect(c.service.deactivate(40, adminDto(), user)).rejects.toMatchObject({ response: { code: 'ADMIN_DEACTIVATION_ONLY' } });
      expect(c.db.$transaction).not.toHaveBeenCalled();
      expect(c.tx.servicioRetiroSolicitud.findFirst).not.toHaveBeenCalled();
      expect(c.state.service.estadoOperativo).toBe('Activo');
    }
  });

  it('exige un motivo administrativo cerrado: la morosidad no es un motivo de esta ruta', async () => {
    const c = setup();
    await expect(c.service.deactivate(40, { motivoAdministrativo: 'MOROSIDAD' as never, observacion: 'No paga hace meses' }, admin)).rejects.toThrow('motivo administrativo');
    expect(c.db.$transaction).not.toHaveBeenCalled();
  });

  it('la auditoria registra la baja como ADMINISTRATIVA con su motivo', async () => {
    const c = setup();
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.state.audits[0]).toMatchObject({ accion: 'DAR_BAJA_SERVICIO', idUsuario: 3,
      valorNuevo: expect.objectContaining({ tipoBaja: 'ADMINISTRATIVA', motivoAdministrativo: 'SOLICITUD_CLIENTE_SIN_DEUDA' }) });
  });
});

// Ported from PR #81 (45d4dda6, service-retirement-safety.spec.ts) and adapted to the consolidated excliente rule
// (derived view, FINET 13-11-2026): a linked prospect is reused without rewriting it; only a missing one is created.
describe('La baja directa no es el atajo de una baja por morosidad', () => {
  const overdue = (over: Record<string, unknown> = {}) => ({
    monto: 19990, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [], conveniosPago: [], ...over,
  });
  const suspended = () => { const c = setup(); c.state.service.estadoOperativo = 'Suspendido'; c.state.contract.estado = 'Suspendido'; c.state.customer = 'Suspendido'; return c; };

  it('servicio suspendido con deuda exigible vencida y sin solicitud de retiro no puede darse de baja directamente', async () => {
    const c = suspended(); c.state.invoices = [overdue()];
    await expect(c.service.deactivate(40, adminDto('No paga'), admin)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    // Suspended: rejected before reading invoices (suspension already means non-payment).
    expect(c.tx.factura.findMany).not.toHaveBeenCalled();
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.tx.contrato.update).not.toHaveBeenCalled();
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
    expect(c.state.audits).toHaveLength(0);
  });

  it('una solicitud de retiro cancelada no reabre el atajo mientras la deuda siga vencida', async () => {
    const c = suspended(); c.state.invoices = [overdue()];
    c.tx.servicioRetiroSolicitud.findFirst.mockResolvedValue(null as never); // only CANCELADA/CERRADA requests remain
    await expect(c.service.deactivate(40, adminDto(), admin)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
  });

  it.each([
    ['la deuda ya fue pagada', [overdue({ estado: 'Pagada', pagos: [{ monto: 19990 }] })]],
    ['una prórroga aprobada mantiene vigente el vencimiento', [overdue({ prorrogasPago: [{ nuevaFecha: new Date('2999-01-01'), estado: 'APROBADA' }] })]],
    ['un convenio de pago activo cubre la deuda', [overdue({ conveniosPago: [{ estado: 'ACTIVO' }] })]],
    ['no hay documentos', []],
  ])('un servicio suspendido nunca sale por la baja administrativa, aunque %s', async (_name, invoices) => {
    const c = suspended(); c.state.invoices = invoices;
    await expect(c.service.deactivate(40, adminDto('Termino de relacion solicitado por el cliente'), admin)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
    expect(c.state.audits).toHaveLength(0);
  });

  it.each([
    ['sin convenio', overdue()],
    ['cubierta por un convenio activo', overdue({ conveniosPago: [{ estado: 'ACTIVO' }] })],
  ])('servicio activo con deuda vencida (%s) no puede darse de baja administrativamente', async (_name, invoice) => {
    const c = setup(); c.state.invoices = [invoice];
    await expect(c.service.deactivate(40, adminDto('Cambio de domicilio sin cobertura'), admin)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    expect(c.state.service.estadoOperativo).toBe('Activo');
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
  });

  it.each([
    ['pagada', [overdue({ estado: 'Pagada', pagos: [{ monto: 19990 }] })]],
    ['con prórroga vigente', [overdue({ prorrogasPago: [{ nuevaFecha: new Date('2999-01-01'), estado: 'APROBADA' }] })]],
    ['sin documentos', []],
  ])('servicio activo sin deuda vencida (%s) conserva la baja administrativa autorizada', async (_name, invoices) => {
    const c = setup(); c.state.invoices = invoices;
    await c.service.deactivate(40, adminDto('Cambio de domicilio sin cobertura'), admin);
    expect(c.state.service.estadoOperativo).toBe('Baja');
  });

  it('la baja no borra deuda, facturas ni pagos: solo consulta', async () => {
    const c = setup(); c.state.invoices = [overdue({ estado: 'Pagada', pagos: [{ monto: 19990 }] })];
    const invoices = structuredClone(c.state.invoices);
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.state.service.estadoOperativo).toBe('Baja');
    expect(c.state.invoices).toEqual(invoices);
    expect(Object.keys(c.tx.factura)).toEqual(['findMany']);
  });
});

describe('Baja directa y excliente en Prospectos (misma regla que la baja por retiro)', () => {
  it('al terminar la última relación operativa crea UN prospecto vinculado al mismo cliente, sin recrearlo ni marcar estados nuevos', async () => {
    const c = setup();
    await c.service.deactivate(40, adminDto('Fin de servicio'), admin);
    expect(c.tx.prospecto.create).toHaveBeenCalledTimes(1);
    const data = c.tx.prospecto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ idCliente: 10, idEmpresa: 1, estadoPipeline: 'Fuera pipeline', origenContacto: 'Excliente' });
    expect(data).not.toHaveProperty('clasificacionComercial');
    expect(c.tx.cliente.update).toHaveBeenCalledWith({ where: { idCliente: 10 }, data: { estado: 'Baja' } });
    expect(c.state.prospects).toHaveLength(1);
  });

  it('un prospecto ya vinculado se reutiliza sin escribirlo: su historial no cambia', async () => {
    const c = setup();
    c.state.prospects.push({ idProspecto: 5, idCliente: 10, idEmpresa: 1, estadoPipeline: 'Servicio Activo' });
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.tx.prospecto.update).not.toHaveBeenCalled();
    expect(c.state.prospects[0].estadoPipeline).toBe('Servicio Activo');
  });

  it('si conserva otro servicio operativo no pasa a excliente', async () => {
    const c = setup(); c.other();
    await c.service.deactivate(40, adminDto(), admin);
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.state.audits.map(a => (a as { accion: string }).accion)).toEqual(['DAR_BAJA_SERVICIO']);
  });

  it('un fallo al registrar el excliente revierte también la baja del servicio, el contrato y el cliente', async () => {
    const c = setup(); const before = structuredClone(c.state);
    c.tx.prospecto.create.mockRejectedValueOnce(new Error('PROSPECT_WRITE_FAILED'));
    await expect(c.service.deactivate(40, adminDto(), admin)).rejects.toThrow('PROSPECT_WRITE_FAILED');
    expect(c.state).toEqual(before);
  });

  it('repetir la baja no crea un segundo prospecto', async () => {
    const c = setup();
    await c.service.deactivate(40, adminDto(), admin); await c.service.deactivate(40, adminDto(), admin);
    expect(c.state.prospects).toHaveLength(1);
    expect(c.db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Reactivación manual con retiro por morosidad activo (FINET 13-11-2026)', () => {
  it('PATCH a Activo se rechaza y audita mientras la solicitud no se cancele ni se resuelva', async () => {
    const c = setup(); c.state.service.estadoOperativo = 'Suspendido';
    c.tx.servicioRetiroSolicitud.findFirst.mockResolvedValue({ idSolicitudRetiro: 15 } as never);
    await expect(c.service.update(40, { estadoOperativo: 'Activo' }, actor)).rejects.toMatchObject({ response: { code: 'SERVICE_WITHDRAWAL_ACTIVE', idSolicitudRetiro: 15 } });
    expect(c.tx.servicioRetiroSolicitud.findFirst).toHaveBeenCalledWith({ where: {
      idServicio: 40, idEmpresa: 1, motivo: { equals: 'MOROSIDAD', mode: 'insensitive' }, estado: { notIn: ['CANCELADA', 'CERRADA'] },
    }, select: { idSolicitudRetiro: true } });
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
    expect(c.state.audits).toEqual([expect.objectContaining({ accion: 'RECHAZAR_ACTIVACION_MANUAL_SERVICIO' })]);
  });
});
