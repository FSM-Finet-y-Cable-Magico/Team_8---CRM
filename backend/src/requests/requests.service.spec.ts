import { RequestsService } from './requests.service';
const user = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Test', roles: ['Comercial'] };
function setup() {
  const row = { idSolicitud: 1, idEmpresa: 1, estado: 'Abierta', observaciones: null, motivoNoFactible: null };
  const db = { solicitudCliente: { findUnique: jest.fn().mockResolvedValue(row), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idSolicitud: 1, ...data })), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data })) },
    cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 3, idEmpresa: 1, contratos: [] }) }, servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 5, idCliente: 9, idEmpresa: 1 }) } };
  return { db, row, service: new RequestsService(db as never, { record: jest.fn() } as never) };
}
describe('CU66 solicitudes internas', () => {
  it('no vincula un servicio de otro cliente', async () => { const { service, db } = setup();
    await expect(service.create({ idCliente: 3, idServicio: 5, tipoSolicitud: 'Consulta', descripcion: 'Prueba' }, user)).rejects.toThrow('cliente'); expect(db.solicitudCliente.create).not.toHaveBeenCalled(); });
  it('exige motivo para no factibilidad y registra cierre', async () => { const { service, db } = setup();
    await expect(service.updateFeasibility(1, { factible: false }, user)).rejects.toThrow('motivo');
    await service.updateFeasibility(1, { factible: false, motivoNoFactible: 'Fuera del alcance comercial' }, user);
    expect(db.solicitudCliente.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: 'No Factible', fechaCierre: expect.any(Date), factible: false }) })); });
  it('no reabre una solicitud cerrada', async () => { const { service, row } = setup(); row.estado = 'Cerrada'; await expect(service.updateStatus(1, { estado: 'Abierta' }, user)).rejects.toThrow('cerrada'); });
  it('no permite gestionar solicitudes de otra empresa', async () => { const { service, row } = setup(); row.idEmpresa = 2; await expect(service.updateStatus(1, { estado: 'Cerrada' }, user)).rejects.toThrow('empresa'); });
  it('guarda observaciones aunque el estado no cambie', async () => { const { service, db } = setup(); await service.updateStatus(1, { estado: 'Abierta', observaciones: 'Seguimiento' }, user); expect(db.solicitudCliente.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ observaciones: 'Seguimiento' }) })); });
});
