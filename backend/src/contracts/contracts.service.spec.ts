import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

const comercial: AuthUser = {
  idUsuario: 2,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('ContractsService', () => {
  it('crea una contratación pendiente de firma sin crear servicio ni OT', async () => {
    const createdContract = {
      idContrato: 40,
      idCliente: 10,
      idPlan: 7,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
      cliente: { idCliente: 10 },
      plan: { idPlan: 7, nombreComercial: 'Fibra 600' },
      zonaPago: null,
      servicios: [],
    };
    const prisma = {
      cliente: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ idCliente: 10, idEmpresa: 1, estado: 'Activo', contratos: [{ idEmpresa: 1 }] })
          .mockResolvedValueOnce({ idCliente: 10, estado: 'Activo', contratos: [{ estado: 'Activo' }, { estado: 'Pendiente firma contrato' }], servicios: [{ estadoOperativo: 'Activo' }] }),
        update: jest.fn(),
      },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 7, idEmpresa: 1, activo: true }) },
      contrato: { create: jest.fn().mockResolvedValue(createdContract) },
      servicioContratado: { create: jest.fn() },
      ordenTrabajo: { create: jest.fn() },
    };
    const audit = { record: jest.fn() };
    const servicesService = { ensureInstallationServiceForContract: jest.fn() };
    const service = new ContractsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      servicesService as never,
    );

    const result = await service.createCustomerContract({ idCliente: 10, idPlan: 7 }, comercial);

    expect(result).toBe(createdContract);
    expect(prisma.contrato.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idCliente: 10, idPlan: 7, estado: 'Pendiente firma contrato' }),
    }));
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });

  it('confirma la firma manual y prepara el servicio pendiente de instalación', async () => {
    const contract = {
      idContrato: 30,
      idCliente: 10,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
      cliente: { idCliente: 10, direcciones: [{ idDireccion: 7, direccionCompleta: 'Av. Siempre Viva 405' }] },
      plan: { idPlan: 7, tipoPlan: 'Internet' },
      zonaPago: null,
      servicios: [],
    };
    const updatedContract = { ...contract, estado: 'Firmado', fechaFirmaManual: new Date('2026-08-25') };
    const prisma = {
      contrato: {
        findUnique: jest.fn().mockResolvedValue(contract),
        update: jest.fn().mockResolvedValue(updatedContract),
      },
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 10,
          estado: 'Pendiente firma contrato',
          contratos: [{ estado: 'Firmado' }],
          servicios: [],
        }),
        update: jest.fn().mockResolvedValue({ idCliente: 10, estado: 'Pendiente Instalacion' }),
      },
    };
    const audit = { record: jest.fn() };
    const servicesService = {
      ensureInstallationServiceForContract: jest.fn().mockResolvedValue({
        idServicio: 55,
        idContrato: 30,
        estadoOperativo: 'Pendiente Instalacion',
      }),
    };
    const service = new ContractsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      servicesService as never,
    );

    await service.confirmManualSignature(30, { observacion: 'Firma corroborada en oficina' }, comercial);

    expect(prisma.contrato.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        estado: 'Firmado',
        idUsuarioFirmaManual: comercial.idUsuario,
      }),
    }));
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { idCliente: 10 },
      data: { estado: 'Pendiente Instalacion' },
    });
    expect(servicesService.ensureInstallationServiceForContract).toHaveBeenCalledWith(30, comercial);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CONFIRMAR_FIRMA_CONTRATO_MANUAL' }));
  });
});
