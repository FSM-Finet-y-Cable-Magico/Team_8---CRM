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

  it('confirma la firma manual y deja la contratación pendiente de activación sin crear cliente ni servicio', async () => {
    const contract = {
      idContrato: 30,
      idCliente: null,
      idProspecto: 22,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
      direccionInstalacion: 'Av. Siempre Viva 405',
      cliente: null,
      prospecto: { idProspecto: 22, direccion: 'Av. Siempre Viva 405' },
      plan: { idPlan: 7, tipoPlan: 'Internet' },
      zonaPago: null,
      servicios: [],
    };
    const signedContract = { ...contract, estado: 'Firmado', fechaFirmaManual: new Date('2026-08-25') };
    const transaction = {
      contrato: {
        update: jest.fn().mockResolvedValue(signedContract),
      },
      prospecto: {
        update: jest.fn().mockResolvedValue({ idProspecto: 22, estadoPipeline: 'Pendiente activacion' }),
      },
    };
    const prisma = {
      contrato: {
        findUnique: jest.fn().mockResolvedValueOnce(contract).mockResolvedValueOnce(signedContract),
      },
      $transaction: jest.fn().mockImplementation(
        async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
      ),
      cliente: { create: jest.fn(), update: jest.fn() },
      servicioContratado: { create: jest.fn() },
      ordenTrabajo: { create: jest.fn() },
      direccionServicio: { create: jest.fn() },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const servicesService = { ensureInstallationServiceForContract: jest.fn() };
    const service = new ContractsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      servicesService as never,
    );

    const result = await service.confirmManualSignature(30, { observacion: 'Firma corroborada en oficina' }, comercial);

    expect(result).toBe(signedContract);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.contrato.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { idContrato: 30 },
      data: expect.objectContaining({
        estado: 'Firmado',
        idUsuarioFirmaManual: comercial.idUsuario,
        fechaFirmaManual: expect.any(Date),
      }),
    }));
    expect(transaction.prospecto.update).toHaveBeenCalledWith({
      where: { idProspecto: 22 },
      data: { estadoPipeline: 'Pendiente activacion' },
    });
    expect(prisma.cliente.create).not.toHaveBeenCalled();
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(prisma.direccionServicio.create).not.toHaveBeenCalled();
    expect(servicesService.ensureInstallationServiceForContract).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'CONFIRMAR_FIRMA_CONTRATO_MANUAL',
      valorNuevo: expect.objectContaining({
        idProspecto: 22,
        estadoActivacion: 'Pendiente Instalacion',
      }),
    }));
  });

  it('mantiene la firma idempotente cuando el contrato ya está firmado', async () => {
    const signedContract = {
      idContrato: 30,
      idCliente: null,
      idProspecto: 22,
      idEmpresa: 1,
      estado: 'Firmado',
      direccionInstalacion: 'Av. Siempre Viva 405',
      cliente: null,
      prospecto: { idProspecto: 22, direccion: 'Av. Siempre Viva 405' },
      plan: { idPlan: 7, tipoPlan: 'Internet' },
      zonaPago: null,
      servicios: [],
    };
    const prisma = {
      contrato: { findUnique: jest.fn().mockResolvedValue(signedContract) },
      $transaction: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const servicesService = { ensureInstallationServiceForContract: jest.fn() };
    const service = new ContractsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      servicesService as never,
    );

    const result = await service.confirmManualSignature(30, {}, comercial);

    expect(result).toBe(signedContract);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(servicesService.ensureInstallationServiceForContract).not.toHaveBeenCalled();
  });
});
