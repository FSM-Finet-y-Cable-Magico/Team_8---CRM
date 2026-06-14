import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const admin: AuthUser = {
    idUsuario: 1,
    idEmpresa: 1,
    email: 'admin@finet.local',
    nombreCompleto: 'Administrador',
    roles: ['Administrador'],
  };

  it('muestra la empresa y los datos tecnicos de cada equipo', async () => {
    const prisma = {
      unidadEquipo: {
        findMany: jest.fn().mockResolvedValue([
          {
            idUnidad: 4,
            idTipoEquipo: 10,
            idEmpresa: 2,
            idClienteInstalado: 20,
            diagnosticoTecnico: 'Instalacion router/ONU - MAC: AA:BB:CC:DD:EE:FF; Puerto OLT: OLT-1/1/3',
          },
        ]),
      },
      tipoEquipo: {
        findMany: jest.fn().mockResolvedValue([{ idTipoEquipo: 10, nombre: 'Router/ONU' }]),
      },
      empresa: {
        findMany: jest.fn().mockResolvedValue([{ idEmpresa: 2, nombre: 'Cable Magico' }]),
      },
      cliente: {
        findMany: jest.fn().mockResolvedValue([{ idCliente: 20, nombreCompleto: 'Cliente Cable' }]),
      },
    };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.list(admin);

    expect(result[0]).toEqual(
      expect.objectContaining({
        empresa: expect.objectContaining({ nombre: 'Cable Magico' }),
        clienteInstalado: expect.objectContaining({ nombreCompleto: 'Cliente Cable' }),
        macAddress: 'AA:BB:CC:DD:EE:FF',
        puertoOlt: 'OLT-1/1/3',
      }),
    );
  });

  it('asocia serie, MAC, puerto OLT, cliente y orden de instalacion', async () => {
    const unit = {
      idUnidad: 4,
      idTipoEquipo: 10,
      idEmpresa: 2,
      numeroSerie: 'DEMO-FINET-RTR-004',
      modelo: 'FiberHome ONU',
      estado: 'Disponible',
      diagnosticoTecnico: null,
      idClienteInstalado: null,
    };
    const tx = {
      unidadEquipo: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...unit, ...data })),
      },
      historialEstadoEquipo: { create: jest.fn().mockResolvedValue({}) },
      ordenTrabajo: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      unidadEquipo: { findUnique: jest.fn().mockResolvedValue(unit) },
      cliente: {
        findUnique: jest.fn().mockResolvedValue({ idCliente: 20, idEmpresa: 1, contratos: [{ idEmpresa: 2 }] }),
      },
      ordenTrabajo: {
        findUnique: jest.fn().mockResolvedValue({ idOt: 30, idCliente: 20, idEmpresa: 2, tipoOt: 'Instalacion' }),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new InventoryService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.installRouter(
      4,
      { idCliente: 20, idOt: 30, macAddress: 'AA:BB:CC:DD:EE:FF', puertoOlt: 'OLT-1/1/3' },
      admin,
    );

    expect(result).toEqual(
      expect.objectContaining({
        estado: 'Instalado',
        idClienteInstalado: 20,
        diagnosticoTecnico: expect.stringContaining('MAC: AA:BB:CC:DD:EE:FF; Puerto OLT: OLT-1/1/3'),
      }),
    );
    expect(tx.ordenTrabajo.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idOt: 30 } }),
    );
  });
});
