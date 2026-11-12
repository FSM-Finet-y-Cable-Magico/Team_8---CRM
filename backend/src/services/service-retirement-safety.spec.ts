import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';

const actor = { idUsuario: 2, idEmpresa: 1, roles: ['Comercial'], email: null, nombreCompleto: 'QA' };
function setup() {
  const state = { service: { idServicio: 40, idCliente: 10, idContrato: 20, idEmpresa: 1, estadoOperativo: 'Activo', observaciones: null },
    contract: { idContrato: 20, idCliente: 10, idEmpresa: 1, estado: 'Activo' }, customer: 'Activo', audits: [] as unknown[], prospects: [] as Array<Record<string, any>>, invoices: [] as Array<Record<string, any>> };
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
      count: jest.fn(async () => state.contract.estado === 'Baja' ? 0 : 1),
    },
    factura: { findMany: jest.fn(async () => state.invoices) },
    prospecto: {
      findFirst: jest.fn(async () => state.prospects[0] ?? null),
      create: jest.fn(async ({ data }) => { const row = { idProspecto: 900 + state.prospects.length, ...data }; state.prospects.push(row); return row; }),
      update: jest.fn(async ({ data }) => Object.assign(state.prospects[0], data)),
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
    await expect(c.service.deactivate(40, {}, actor)).rejects.toThrow('no corresponde');
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
    await expect(c.service.deactivate(40, {}, actor)).rejects.toThrow('cierre tecnico autorizado');
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.state.audits).toHaveLength(0);
  });

  it('baja administrativa por otro motivo conserva ruta y auditoria atomica', async () => {
    const c = setup();
    await c.service.deactivate(40, { observacion: 'Fin de relacion administrativa autorizado' }, actor);
    expect(c.state.service.estadoOperativo).toBe('Baja');
    expect(c.state.contract.estado).toBe('Baja');
    expect(c.state.customer).toBe('Baja');
    expect(c.state.audits.map(a => (a as { accion: string }).accion)).toEqual(['DAR_BAJA_SERVICIO', 'MARCAR_EXCLIENTE_PROSPECTO']);
    const before = structuredClone(c.state);
    await c.service.deactivate(40, {}, actor);
    expect(c.state).toEqual(before);
    expect(c.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('fallo de auditoria revierte servicio, contrato y cliente', async () => {
    const c = setup(); const before = structuredClone(c.state);
    c.tx.logAuditoria.create.mockRejectedValueOnce(new Error('AUDIT_FAILED'));
    await expect(c.service.deactivate(40, {}, actor)).rejects.toThrow('AUDIT_FAILED');
    expect(c.state).toEqual(before);
  });

  it('otro servicio operativo mantiene cliente y contrato sin bajas independientes', async () => {
    const c = setup(); c.other();
    await c.service.deactivate(40, {}, actor);
    expect(c.state.contract.estado).toBe('Activo');
    expect(c.state.customer).toBe('Activo');
    expect(c.tx.cliente.update).not.toHaveBeenCalled();
  });

  it('otra empresa no entra en transaccion ni consulta solicitudes', async () => {
    const c = setup();
    await expect(c.service.deactivate(40, {}, { ...actor, idEmpresa: 2 })).rejects.toThrow('empresa');
    expect(c.db.$transaction).not.toHaveBeenCalled();
    expect(c.tx.servicioRetiroSolicitud.findFirst).not.toHaveBeenCalled();
  });
});

describe('La baja directa no es el atajo de una baja por morosidad', () => {
  const overdue = (over: Record<string, unknown> = {}) => ({
    monto: 19990, estado: 'Vencida', fechaLimitePago: new Date('2020-01-10'), pagos: [], prorrogasPago: [], conveniosPago: [], ...over,
  });
  const suspended = () => { const c = setup(); c.state.service.estadoOperativo = 'Suspendido'; c.state.contract.estado = 'Suspendido'; c.state.customer = 'Suspendido'; return c; };

  it('servicio suspendido con deuda exigible vencida y sin solicitud de retiro no puede darse de baja directamente', async () => {
    const c = suspended(); c.state.invoices = [overdue()];
    await expect(c.service.deactivate(40, { observacion: 'No paga' }, actor)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    expect(c.tx.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idContrato: 20, contrato: { idEmpresa: 1, idCliente: 10 } } }));
    expect(c.tx.servicioContratado.update).not.toHaveBeenCalled();
    expect(c.tx.contrato.update).not.toHaveBeenCalled();
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
    expect(c.state.audits).toHaveLength(0);
  });

  it('una solicitud de retiro cancelada no reabre el atajo mientras la deuda siga vencida', async () => {
    const c = suspended(); c.state.invoices = [overdue()];
    c.tx.servicioRetiroSolicitud.findFirst.mockResolvedValue(null as never); // solo quedan solicitudes CANCELADA/CERRADA
    await expect(c.service.deactivate(40, {}, actor)).rejects.toMatchObject({ response: { code: 'MOROSITY_WITHDRAWAL_REQUIRED' } });
    expect(c.state.service.estadoOperativo).toBe('Suspendido');
  });

  it.each([
    ['la deuda ya fue pagada', [overdue({ estado: 'Pagada', pagos: [{ monto: 19990 }] })]],
    ['una prórroga aprobada mantiene vigente el vencimiento', [overdue({ prorrogasPago: [{ nuevaFecha: new Date('2999-01-01'), estado: 'APROBADA' }] })]],
    ['un convenio de pago activo cubre la deuda', [overdue({ conveniosPago: [{ estado: 'ACTIVO' }] })]],
    ['no hay documentos', []],
  ])('suspendido sin deuda exigible vencida (%s) conserva la baja por otro motivo', async (_name, invoices) => {
    const c = suspended(); c.state.invoices = invoices;
    await c.service.deactivate(40, { observacion: 'Termino de relacion solicitado por el cliente' }, actor);
    expect(c.state.service.estadoOperativo).toBe('Baja');
    expect((c.state.audits[0] as { accion: string }).accion).toBe('DAR_BAJA_SERVICIO');
  });

  it('servicio activo con facturas vencidas conserva la baja administrativa: no es un retiro por morosidad', async () => {
    const c = setup(); c.state.invoices = [overdue()];
    await c.service.deactivate(40, { observacion: 'Cambio de domicilio sin cobertura' }, actor);
    expect(c.state.service.estadoOperativo).toBe('Baja');
    expect(c.tx.factura.findMany).not.toHaveBeenCalled();
  });

  it('la baja no borra deuda, facturas ni pagos: solo consulta', async () => {
    const c = suspended(); c.state.invoices = [overdue({ estado: 'Pagada', pagos: [{ monto: 19990 }] })];
    const invoices = structuredClone(c.state.invoices);
    await c.service.deactivate(40, {}, actor);
    expect(c.state.invoices).toEqual(invoices);
    expect(Object.keys(c.tx.factura)).toEqual(['findMany']);
  });
});

describe('Baja efectiva y retorno del excliente a Prospectos', () => {
  it('al terminar la última relación operativa crea un prospecto vinculado al mismo cliente, sin recrearlo', async () => {
    const c = setup();
    await c.service.deactivate(40, { observacion: 'Fin de servicio' }, actor);
    expect(c.tx.prospecto.create).toHaveBeenCalledTimes(1);
    expect(c.tx.prospecto.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      idCliente: 10, idEmpresa: 1, clasificacionComercial: 'EXCLIENTE', disponibleRemarketing: true, estadoPipeline: 'Fuera pipeline' }) });
    expect(c.tx.cliente.update).toHaveBeenCalledWith({ where: { idCliente: 10 }, data: { estado: 'Baja' } });
    expect(c.state.prospects).toHaveLength(1);
  });

  it('si conserva otro servicio operativo no pasa a excliente', async () => {
    const c = setup(); c.other();
    await c.service.deactivate(40, {}, actor);
    expect(c.tx.prospecto.create).not.toHaveBeenCalled();
    expect(c.state.audits.map(a => (a as { accion: string }).accion)).toEqual(['DAR_BAJA_SERVICIO']);
  });

  it('un fallo al registrar el retorno revierte también la baja del servicio, el contrato y el cliente', async () => {
    const c = setup(); const before = structuredClone(c.state);
    c.tx.prospecto.create.mockRejectedValueOnce(new Error('PROSPECT_WRITE_FAILED'));
    await expect(c.service.deactivate(40, {}, actor)).rejects.toThrow('PROSPECT_WRITE_FAILED');
    expect(c.state).toEqual(before);
  });

  it('repetir la baja no crea un segundo prospecto de retorno', async () => {
    const c = setup();
    await c.service.deactivate(40, {}, actor); await c.service.deactivate(40, {}, actor);
    expect(c.state.prospects).toHaveLength(1);
    expect(c.db.$transaction).toHaveBeenCalledTimes(1);
  });
});
