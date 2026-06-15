import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { buildInstallOrderObservations } from '../common/install-order-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersService } from './work-orders.service';

const terreno: AuthUser = {
  idUsuario: 4,
  idEmpresa: 1,
  email: 'terreno@finet.local',
  nombreCompleto: 'Terreno FiNet',
  roles: ['Terreno'],
};

describe('WorkOrdersService', () => {
  it('expone tipo de conexion, hora y tecnico asignado en la vista de ordenes', async () => {
    const prisma = {
      ordenTrabajo: {
        findMany: jest.fn().mockResolvedValue([
          {
            idOt: 20,
            idEmpresa: 1,
            idCliente: 10,
            idTecnico: 4,
            observaciones: buildInstallOrderObservations({
              tipoConexion: 'Fibra Optica',
              horaVisita: '11:00',
              observacionesAgenda: 'Llamar antes',
            }),
          },
        ]),
      },
      prospecto: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { idUsuario: 4, nombreCompleto: 'Terreno FiNet', email: 'terreno@finet.local' },
        ]),
      },
    };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.list(terreno);

    expect(result[0]).toEqual(
      expect.objectContaining({
        tipoConexion: 'Fibra Optica',
        horaVisita: '11:00',
        observacionesAgenda: 'Llamar antes',
        tecnico: expect.objectContaining({ nombreCompleto: 'Terreno FiNet' }),
      }),
    );
  });

  it('rechaza completar la instalacion cuando falta la fecha de creacion del prospecto', async () => {
    const prisma = {
      ordenTrabajo: {
        findUnique: jest.fn().mockResolvedValue({
          idOt: 20,
          idEmpresa: 1,
          idCliente: 10,
          tipoOt: 'Instalacion',
          estado: 'Pendiente',
        }),
      },
      prospecto: {
        findFirst: jest.fn().mockResolvedValue({
          idProspecto: 30,
          idEmpresa: 1,
          idCliente: 10,
          fechaCreacion: null,
        }),
      },
    };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(service.completeInstallation(20, {}, terreno)).rejects.toThrow(
      'falta la fecha de creacion del prospecto',
    );
    expect((prisma as { $transaction?: jest.Mock }).$transaction).toBeUndefined();
  });

  it('rechaza una fecha de creacion del prospecto posterior a la conversion', async () => {
    const prisma = {
      ordenTrabajo: {
        findUnique: jest.fn().mockResolvedValue({
          idOt: 20,
          idEmpresa: 1,
          idCliente: 10,
          tipoOt: 'Instalacion',
          estado: 'Pendiente',
        }),
      },
      prospecto: {
        findFirst: jest.fn().mockResolvedValue({
          idProspecto: 30,
          idEmpresa: 1,
          idCliente: 10,
          fechaCreacion: new Date('2999-01-01T00:00:00.000Z'),
        }),
      },
    };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(service.completeInstallation(20, {}, terreno)).rejects.toBeInstanceOf(BadRequestException);
  });
});
