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
      cliente: {
        findMany: jest.fn().mockResolvedValue([
          { idCliente: 10, nombreCompleto: 'Manolito Gamer', rut: '12345678-5' },
        ]),
      },
      prospecto: {
        findMany: jest.fn().mockResolvedValue([
          {
            idProspecto: 30,
            idEmpresa: 1,
            idCliente: 10,
            rut: '12345678-5',
            nombreCompleto: 'Manolito Gamer',
            fechaCreacion: new Date('2026-07-01T00:00:00.000Z'),
            fechaConversion: null,
            tiempoConversionDias: null,
            estadoPipeline: 'Instalacion Programada',
          },
        ]),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { idUsuario: 4, nombreCompleto: 'Terreno FiNet', email: 'terreno@finet.local' },
        ]),
      },
      ticket: {
        findMany: jest.fn().mockResolvedValue([]),
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
        cliente: expect.objectContaining({ nombreCompleto: 'Manolito Gamer' }),
        prospecto: expect.objectContaining({ nombreCompleto: 'Manolito Gamer' }),
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
  it('permite completar una instalacion asociada directamente a un servicio sin prospecto', async () => {
    const tx = {
      ordenTrabajo: {
        update: jest.fn().mockResolvedValue({
          idOt: 20,
          idEmpresa: 1,
          idCliente: 10,
          idServicio: 55,
          tipoOt: 'Instalacion',
          estado: 'Completada',
        }),
      },
      cliente: {
        update: jest.fn().mockResolvedValue({ idCliente: 10, estado: 'Activo' }),
      },
      contrato: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      servicioContratado: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      historialOt: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      ordenTrabajo: {
        findUnique: jest.fn().mockResolvedValue({
          idOt: 20,
          idEmpresa: 1,
          idCliente: 10,
          idServicio: 55,
          tipoOt: 'Instalacion',
          estado: 'Pendiente',
          observaciones: buildInstallOrderObservations({
            tipoConexion: 'Fibra Optica',
            horaVisita: '11:00',
          }),
        }),
      },
      prospecto: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.completeInstallation(20, { observaciones: 'Instalacion realizada' }, terreno);

    expect(result).toEqual(
      expect.objectContaining({
        cliente: expect.objectContaining({ estado: 'Activo' }),
        prospect: null,
      }),
    );
    expect(tx.servicioContratado.updateMany).toHaveBeenCalledWith({
      where: { idServicio: 55 },
      data: { estadoOperativo: 'Activo' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'ACTIVAR_CLIENTE_INSTALACION',
        valorNuevo: expect.objectContaining({
          idServicio: 55,
          fechaCreacionProspecto: null,
          fechaConversion: null,
          tiempoConversionDias: null,
        }),
      }),
    );
  });
});
