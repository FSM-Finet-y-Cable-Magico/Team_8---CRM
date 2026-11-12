import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';

const actor = { idUsuario: 2, idEmpresa: 1, roles: ['Comercial'], email: null, nombreCompleto: 'QA' };
function setup() {
  const state = { service: { idServicio: 40, idCliente: 10, idContrato: 20, idEmpresa: 1, estadoOperativo: 'Activo', observaciones: null },
    contract: { idContrato: 20, idCliente: 10, idEmpresa: 1, estado: 'Activo' }, customer: 'Activo', audits: [] as unknown[] };
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
    contrato: { update: jest.fn(async ({ data }) => { Object.assign(state.contract, data); return state.contract; }) },
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
    expect(c.state.audits).toHaveLength(1);
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
