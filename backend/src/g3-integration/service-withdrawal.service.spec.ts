import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServiceWithdrawalService } from './service-withdrawal.service';

const user = { idUsuario: 5, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };

function setup() {
  const serviceRow = { idServicio: 50, idCliente: 30, idEmpresa: 1, idContrato: 20, estadoOperativo: 'Activo', contrato: { idContrato: 20 } };
  const created = {
    idSolicitudRetiro: 1, idEmpresa: 1, idCliente: 30, idServicio: 50, idContrato: 20,
    motivo: 'Cambio de domicilio', fechaSolicitada: new Date('2026-09-30'), estado: 'REGISTRADA',
    estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3', idUsuarioResponsable: 5, observaciones: null,
  };
  const prisma = {
    servicioContratado: { findUnique: jest.fn().mockResolvedValue(serviceRow), update: jest.fn(), delete: jest.fn() },
    contrato: { findUnique: jest.fn() },
    servicioRetiroSolicitud: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...created, ...data })),
      findUnique: jest.fn().mockResolvedValue(created), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...created, ...data })),
      findMany: jest.fn().mockResolvedValue([created]),
    },
    ordenTrabajo: { create: jest.fn() },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new ServiceWithdrawalService(prisma as never, audit as never), prisma, audit, serviceRow };
}

describe('Etapa 3 - CU-84 solicitud de retiro', () => {
  it('50. registra una solicitud de retiro valida', async () => {
    const { service } = setup(); await expect(service.create({ idServicio: 50, motivo: 'Cambio de domicilio', fechaSolicitada: '2026-09-30' }, user)).resolves.toMatchObject({ estado: 'REGISTRADA', estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3' });
  });
  it('51. servicio es obligatorio y debe existir', async () => {
    const { service, prisma } = setup(); prisma.servicioContratado.findUnique.mockResolvedValue(null);
    await expect(service.create({ idServicio: 999, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('52. empresa cruzada es rechazada', async () => {
    const { service, serviceRow } = setup(); serviceRow.idEmpresa = 2;
    await expect(service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('53. motivo es obligatorio', async () => {
    const { service } = setup(); await expect(service.create({ idServicio: 50, motivo: '   ', fechaSolicitada: '2026-09-30' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('54. registra auditoria con servicio y bloqueo tecnico', async () => {
    const { service, audit } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_SOLICITUD_RETIRO_SERVICIO', valorNuevo: expect.objectContaining({ idServicio: 50, estadoDespachoTecnico: 'BLOQUEADO_CONTRATO_G3' }) }));
  });
  it('55. registrar retiro no borra ni da de baja el Servicio', async () => {
    const { service, prisma } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(prisma.servicioContratado.delete).not.toHaveBeenCalled(); expect(prisma.servicioContratado.update).not.toHaveBeenCalled();
  });
  it('56. sin contrato G3 de retiro no inventa OrdenTrabajo', async () => {
    const { service, prisma } = setup(); await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });
  it('57. el estado de despacho permanece bloqueado hasta existir contrato ratificado', async () => {
    const { service } = setup(); const result = await service.create({ idServicio: 50, motivo: 'Retiro', fechaSolicitada: '2026-09-30' }, user);
    expect(result.estadoDespachoTecnico).toBe('BLOQUEADO_CONTRATO_G3');
  });
});
