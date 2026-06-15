import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
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
