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
  it('cancela una agenda existente y devuelve el servicio a pendiente de instalación', async () => {
    const order = {
      idOt: 20,
      idEmpresa: 1,
      idCliente: 10,
      idServicio: 55,
      tipoOt: 'Instalacion',
      estado: 'Pendiente',
    };
    const tx = {
      ordenTrabajo: { update: jest.fn().mockResolvedValue({ ...order, estado: 'Cancelada' }) },
      servicioContratado: { update: jest.fn().mockResolvedValue({ idServicio: 55, estadoOperativo: 'Pendiente Instalacion' }) },
      historialOt: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ordenTrabajo: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    await service.cancelInstallation(20, terreno);

    expect(tx.ordenTrabajo.update).toHaveBeenCalledWith({ where: { idOt: 20 }, data: { estado: 'Cancelada' } });
    expect(tx.servicioContratado.update).toHaveBeenCalledWith({
      where: { idServicio: 55 },
      data: { estadoOperativo: 'Pendiente Instalacion' },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CANCELAR_AGENDA_INSTALACION' }));
  });

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
        update: jest.fn().mockResolvedValue({ idContrato: 30, estado: 'Activo' }),
      },
      servicioContratado: {
        update: jest.fn().mockResolvedValue({ idServicio: 55, estadoOperativo: 'Activo' }),
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
      servicioContratado: {
        findUnique: jest.fn().mockResolvedValue({
          idServicio: 55,
          idCliente: 10,
          idEmpresa: 1,
          idContrato: 30,
          datosTecnicos: null,
        }),
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
    expect(tx.servicioContratado.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { idServicio: 55 },
      data: expect.objectContaining({ estadoOperativo: 'Activo' }),
    }));
    expect(tx.contrato.update).toHaveBeenCalledWith({
      where: { idContrato: 30 },
      data: { estado: 'Activo' },
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

  it('asocia el equipo de inventario y conserva arriendo opcional al cerrar la instalación', async () => {
    const tx = {
      ordenTrabajo: { update: jest.fn().mockResolvedValue({ idOt: 20, codigoSeguimiento: 'OT-INS-000020', estado: 'Completada' }) },
      cliente: { update: jest.fn().mockResolvedValue({ idCliente: 10, estado: 'Activo' }) },
      contrato: { update: jest.fn().mockResolvedValue({ idContrato: 30, estado: 'Activo' }) },
      servicioContratado: { update: jest.fn().mockResolvedValue({ idServicio: 55, estadoOperativo: 'Activo' }) },
      unidadEquipo: { update: jest.fn().mockResolvedValue({ idUnidad: 9, numeroSerie: 'ONT-001', estado: 'Instalado' }) },
      historialEstadoEquipo: { create: jest.fn().mockResolvedValue({}) },
      historialOt: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ordenTrabajo: { findUnique: jest.fn().mockResolvedValue({ idOt: 20, idEmpresa: 1, idCliente: 10, idServicio: 55, tipoOt: 'Instalacion', estado: 'Pendiente', observaciones: null }) },
      prospecto: { findFirst: jest.fn().mockResolvedValue(null) },
      servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 55, idCliente: 10, idEmpresa: 1, idContrato: 30, datosTecnicos: null }) },
      unidadEquipo: { findUnique: jest.fn().mockResolvedValue({ idUnidad: 9, idEmpresa: 1, idServicio: null, estado: 'Disponible', numeroSerie: 'ONT-001', modelo: 'ONT demo', modalidadAsignacion: null, valorArriendoMensual: null, diagnosticoTecnico: null }) },
      $transaction: jest.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new WorkOrdersService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService);

    await service.completeInstallation(20, {
      idUnidad: 9,
      modelo: 'HG8245H',
      macAddress: 'AC:12:34:56:78:90',
      puertoOlt: '0/1/4',
      modalidadAsignacion: 'Propiedad empresa',
    }, terreno);

    expect(tx.unidadEquipo.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { idUnidad: 9 },
      data: expect.objectContaining({
        idServicio: 55,
        idClienteInstalado: 10,
        estado: 'Instalado',
        valorArriendoMensual: null,
      }),
    }));
    expect(tx.historialEstadoEquipo.create).toHaveBeenCalled();
  });

  it('rechaza un equipo ocupado aunque se envíe manualmente al completar la instalación', async () => {
    const prisma = {
      ordenTrabajo: { findUnique: jest.fn().mockResolvedValue({ idOt: 20, idEmpresa: 1, idCliente: 10, idServicio: 55, tipoOt: 'Instalacion', estado: 'Pendiente', observaciones: null }) },
      prospecto: { findFirst: jest.fn().mockResolvedValue(null) },
      servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 55, idCliente: 10, idEmpresa: 1, idContrato: 30, datosTecnicos: null }) },
      unidadEquipo: { findUnique: jest.fn().mockResolvedValue({ idUnidad: 9, idEmpresa: 1, idServicio: 88, idClienteInstalado: 20, estado: 'Instalado', numeroSerie: 'ONT-OCUPADA' }) },
    };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(service.completeInstallation(20, { idUnidad: 9 }, terreno)).rejects.toThrow(
      'no está disponible para instalar',
    );
    expect((prisma as { $transaction?: jest.Mock }).$transaction).toBeUndefined();
  });

  it('convierte el prospecto firmado en cliente y servicio al completar la instalación', async () => {
    const prospect = {
      idProspecto: 42,
      idEmpresa: 1,
      idCliente: null,
      rut: '25307395-0',
      nombreCompleto: 'Jean Guerrero',
      email: 'jean@example.com',
      telefono: '+56912345678',
      direccion: 'Av. Las Condes 123',
      origenContacto: 'Formulario web',
      fechaCreacion: new Date('2026-09-01T00:00:00.000Z'),
    };
    const contract = {
      idContrato: 29,
      idEmpresa: 1,
      idProspecto: 42,
      idCliente: null,
      idZonaPago: null,
      estado: 'Firmado',
      direccionInstalacion: 'Av. Las Condes 123',
      comunaInstalacion: 'Las Condes',
      ciudadInstalacion: 'Santiago',
      plan: { tipoPlan: 'Internet' },
    };
    const tx = {
      cliente: {
        create: jest.fn().mockResolvedValue({ idCliente: 81, estado: 'Activo' }),
      },
      direccionServicio: {
        create: jest.fn().mockResolvedValue({ idDireccion: 91 }),
      },
      servicioContratado: {
        create: jest.fn().mockResolvedValue({ idServicio: 71, idCliente: 81, estadoOperativo: 'Activo' }),
      },
      contrato: {
        update: jest.fn().mockResolvedValue({ ...contract, idCliente: 81, estado: 'Activo' }),
      },
      ordenTrabajo: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idOt: 60, ...data })),
      },
      prospecto: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
      },
      historialOt: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ordenTrabajo: {
        findUnique: jest.fn().mockResolvedValue({
          idOt: 60,
          idEmpresa: 1,
          idCliente: null,
          idProspecto: 42,
          idServicio: null,
          idDireccion: null,
          tipoOt: 'Instalacion',
          estado: 'Pendiente',
          observaciones: buildInstallOrderObservations({ tipoConexion: 'Fibra Optica', horaVisita: '14:00' }),
        }),
      },
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      contrato: { findFirst: jest.fn().mockResolvedValue(contract) },
      $transaction: jest.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new WorkOrdersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.completeInstallation(60, { observaciones: 'Instalación conforme' }, terreno);

    expect(tx.cliente.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ rut: '25307395-0', estado: 'Activo' }),
    }));
    expect(tx.servicioContratado.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idCliente: 81,
        idContrato: 29,
        idDireccion: 91,
        tipoServicio: 'Internet',
        estadoOperativo: 'Activo',
      }),
    }));
    expect(tx.ordenTrabajo.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idCliente: 81, idServicio: 71, estado: 'Completada' }),
    }));
    expect(tx.prospecto.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idCliente: 81, estadoPipeline: 'Servicio Activo' }),
    }));
    expect(result.cliente.idCliente).toBe(81);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'ACTIVAR_CLIENTE_INSTALACION',
      valorNuevo: expect.objectContaining({ idCliente: 81, idServicio: 71, idContrato: 29 }),
    }));
  });
});
