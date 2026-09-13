import { ObservationsService } from './observations.service';
const user = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Test', roles: ['Comercial'] };
describe('CU71 contexto de observaciones', () => {
  const db = { cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 3, idEmpresa: 2, contratos: [{ idEmpresa: 1 }] }) }, observacionOperativa: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) } };
  const service = new ObservationsService(db as never, { record: jest.fn() } as never);
  it('usa la empresa autorizada en un cliente compartido', async () => { const result = await service.create({ tipoEntidad: 'Cliente', idEntidad: 3, observacion: 'Llamada' }, user); expect(result.idEmpresa).toBe(1); expect(result.idCliente).toBe(3); });
  it('rechaza un contexto de cliente o empresa manipulado', async () => {
    await expect(service.create({ tipoEntidad: 'Cliente', idEntidad: 3, idCliente: 8, observacion: 'Llamada' }, user)).rejects.toThrow('cliente');
    await expect(service.create({ tipoEntidad: 'Cliente', idEntidad: 3, idEmpresa: 2, observacion: 'Llamada' }, user)).rejects.toThrow('empresa');
  });
  it('rechaza contenido vacío', async () => { await expect(service.create({ tipoEntidad: 'Cliente', idEntidad: 3, observacion: '   ' }, user)).rejects.toThrow('observación'); });
});
