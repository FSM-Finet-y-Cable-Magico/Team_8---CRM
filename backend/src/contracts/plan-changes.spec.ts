import { ContractsService } from './contracts.service';
import { todayDateOnly } from '../common/date-rules';
const user = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Test', roles: ['Comercial'] };
function setup() {
  const contract = { idContrato: 1, idCliente: 3, cliente: { idCliente: 3 }, idEmpresa: 1, idPlan: 10, idZonaPago: null, estado: 'Activo', servicios: [{ idServicio: 4, estadoOperativo: 'Activo', datosTecnicos: { mac: 'preservada' } }, { idServicio: 5, estadoOperativo: 'Baja' }] };
  const plan = { idPlan: 11, idEmpresa: 1, activo: true, tipoPlan: 'Internet', nombreComercial: 'Nuevo', velocidadMbps: 600, precioMensual: 20000 };
  const change = { idCambioPlan: 8, idContrato: 1, idPlanAnterior: 10, idPlanNuevo: 11, precioNuevo: 20000, estadoCambio: 'Pendiente' };
  const db = { contrato: { findUnique: jest.fn().mockResolvedValue(contract), update: jest.fn().mockResolvedValue({ ...contract, idPlan: 11 }) },
    plan: { findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.idPlan === 10 ? { ...plan, idPlan: 10, precioMensual: 10000 } : plan)) },
    historialCambioPlan: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idCambioPlan: 8, ...data })), findMany: jest.fn().mockResolvedValue([change]), findUnique: jest.fn().mockResolvedValue(change), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    servicioContratado: { update: jest.fn() }, logAuditoria: { create: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn() };
  db.$transaction.mockImplementation(fn => fn(db));
  const service = new ContractsService(db as never, { record: jest.fn() } as never, {} as never);
  return { db, service, contract, plan, change };
}
describe('CU73 fechas, aislamiento e historial', () => {
  it('programa sin modificar contrato ni servicios', async () => {
    const { db, service } = setup();
    const future = todayDateOnly(new Date(Date.now() + 86400000 * 3));
    const result = await service.changePlan(1, { newPlanId: 11, fechaEfectiva: future }, user);
    expect(result.cambioPlan.estadoCambio).toBe('Pendiente');
    expect(result.idPlan).toBe(10);
    expect(db.contrato.update).not.toHaveBeenCalled(); expect(db.servicioContratado.update).not.toHaveBeenCalled();
  });
  it('aplica hoy y conserva servicios dados de baja y datos técnicos', async () => {
    const { db, service } = setup();
    const result = await service.changePlan(1, { newPlanId: 11, fechaEfectiva: todayDateOnly() }, user);
    expect(result.cambioPlan.estadoCambio).toBe('Aplicado');
    expect(db.servicioContratado.update).toHaveBeenCalledTimes(1);
    expect(db.servicioContratado.update).toHaveBeenCalledWith(expect.objectContaining({ where: { idServicio: 4 }, data: expect.objectContaining({ datosTecnicos: expect.objectContaining({ mac: 'preservada', precioMensual: 20000 }) }) }));
  });
  it('rechaza otro pendiente', async () => {
    const { db, service } = setup(); db.historialCambioPlan.findFirst.mockResolvedValue({ idCambioPlan: 8 } as never);
    await expect(service.changePlan(1, { newPlanId: 11, fechaEfectiva: todayDateOnly() }, user)).rejects.toThrow('pendiente');
    expect(db.historialCambioPlan.create).not.toHaveBeenCalled();
  });
  it.each(['Baja', 'Anulado', 'Pendiente firma contrato'])('rechaza contrato %s', async estado => {
    const { service, contract } = setup(); contract.estado = estado;
    await expect(service.changePlan(1, { newPlanId: 11, fechaEfectiva: todayDateOnly() }, user)).rejects.toThrow('vigente');
  });
  it('rechaza otra empresa y fecha pasada', async () => {
    const { service, plan } = setup(); plan.idEmpresa = 2;
    await expect(service.changePlan(1, { newPlanId: 11, fechaEfectiva: todayDateOnly() }, user)).rejects.toThrow('empresa');
    plan.idEmpresa = 1;
    await expect(service.changePlan(1, { newPlanId: 11, fechaEfectiva: '2020-01-01' }, user)).rejects.toThrow('fecha');
  });
  it('el procesador aplica una sola vez aunque lea de nuevo el mismo candidato', async () => {
    const { service, db, change } = setup();
    await service.applyDuePlanChanges(); change.estadoCambio = 'Aplicado'; await service.applyDuePlanChanges();
    expect(db.contrato.update).toHaveBeenCalledTimes(1);
    expect(db.historialCambioPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { estadoCambio: 'Pendiente', fechaEfectiva: { lte: expect.any(Date) } } }));
  });
  it('cancela automáticamente un pendiente cuyo contrato ya no está vigente', async () => {
    const { service, db, contract } = setup(); contract.estado = 'Baja'; await service.applyDuePlanChanges();
    expect(db.contrato.update).not.toHaveBeenCalled();
    expect(db.historialCambioPlan.update).toHaveBeenCalledWith({ where: { idCambioPlan: 8 }, data: { estadoCambio: 'Cancelado' } });
  });
  it('rechaza cancelar un cambio aplicado', async () => {
    const { service, db } = setup(); db.historialCambioPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancelPlanChange(1, 8, user)).rejects.toThrow('pendiente');
  });
  it('la descarga selecciona la versión solicitada y valida el parámetro', async () => {
    const { service, db } = setup(); Object.assign(db, { contratoDigital: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(service.downloadDigitalContract(1, user, {} as never, 2)).rejects.toThrow('generado');
    expect((db as any).contratoDigital.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { idContrato: 1, version: 2 } }));
    await expect(service.downloadDigitalContract(1, user, {} as never, 0)).rejects.toThrow('Versión');
  });
});
