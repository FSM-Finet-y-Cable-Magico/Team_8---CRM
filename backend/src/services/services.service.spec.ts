import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { buildInstallOrderObservations } from '../common/install-order-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from './services.service';

const comercial: AuthUser = {
  idUsuario: 2,
  idEmpresa: 1,
  email: 'comercial@finet.local',
  nombreCompleto: 'Comercial FiNet',
  roles: ['Comercial'],
};

describe('ServicesService', () => {
  function serviceContextSetup({
    g3 = [],
    g1 = [],
    localOrders = [],
    datosTecnicos = null,
  }: {
    g3?: any[];
    g1?: any[];
    localOrders?: any[];
    datosTecnicos?: any;
  } = {}) {
    const record = {
      idServicio: 3,
      idCliente: 34,
      idEmpresa: 1,
      idContrato: 22,
      idDireccion: 7,
      idZonaPago: null,
      tipoServicio: 'Internet',
      estadoOperativo: 'Activo',
      observaciones: null,
      datosTecnicos,
      fechaCreacion: new Date('2026-10-07T00:00:00.000Z'),
      cliente: { idCliente: 34 },
      empresa: { idEmpresa: 1 },
      contrato: { idContrato: 22, plan: { idPlan: 1 } },
      direccion: null,
      zonaPago: null,
      equipos: [],
      tickets: [],
      ordenes: localOrders,
      solicitudes: [],
    };
    const prisma = {
      cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 34, idEmpresa: 1, contratos: [{ idEmpresa: 1 }] }) },
      servicioContratado: { findMany: jest.fn().mockResolvedValue([record]) },
      integracionInstalacionG3: { findMany: jest.fn().mockResolvedValue(g3) },
      integracionActivacionG1: { findMany: jest.fn().mockResolvedValue(g1) },
      usuario: { findMany: jest.fn().mockResolvedValue([{ idUsuario: 9, nombreCompleto: 'Tecnico Local' }]) },
    };
    return {
      service: new ServicesService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService),
      prisma,
    };
  }

  it('expone una instalacion G3 completada por servicio, contrato y empresa sin inventar una OT local', async () => {
    const closedAt = new Date('2026-10-07T13:00:00.000Z');
    const context = serviceContextSetup({
      datosTecnicos: {
        fuenteInstalacion: 'G3',
        fechaCompletadaG3: '2026-10-07T12:00:00.000Z',
        idTecnicoG3: 77,
        potenciaOpticaDbm: -19.4,
      },
      g3: [{
        idIntegracion: 2, idEmpresa: 1, idContrato: 22, idServicio: 3,
        idOtG3: '53', codigoOtG3: null, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA',
        fechaCierreProcesado: closedAt,
      }],
      g1: [{
        idIntegracion: 1, idEmpresa: 1, idContrato: 22, idServicio: 3,
        estadoIntegracion: 'PENDIENTE_DATOS_EQUIPO_G1', ultimoErrorSanitizado: null,
        fechaCompletado: null, updatedAt: closedAt,
      }],
    });

    const [result] = await context.service.listByCustomer(34, comercial);

    expect(result.instalacion).toEqual(expect.objectContaining({
      fuente: 'G3', idOt: '53', estado: 'COMPLETADA',
      fechaCompletada: '2026-10-07T12:00:00.000Z', fechaProcesamiento: closedAt,
      idTecnico: null, idTecnicoG3: 77, tecnico: null,
    }));
    expect(result.integracionG1).toEqual(expect.objectContaining({ estadoIntegracion: 'PENDIENTE_DATOS_EQUIPO_G1' }));
    expect(context.prisma.integracionInstalacionG3.findMany).toHaveBeenCalledTimes(1);
    expect(context.prisma.integracionActivacionG1.findMany).toHaveBeenCalledTimes(1);
    expect(context.prisma.usuario.findMany).not.toHaveBeenCalled();
  });

  it('conserva una instalacion historica local cuando no existe cierre G3 relacionado', async () => {
    const completedAt = new Date('2025-05-10T12:00:00.000Z');
    const context = serviceContextSetup({
      localOrders: [{
        idOt: 8, idTecnico: 9, tipoOt: 'Instalacion', estado: 'Completada',
        codigoSeguimiento: 'OT-INS-000008', fechaCompletada: completedAt,
        fechaCreacion: new Date('2025-05-01T00:00:00.000Z'),
      }],
    });

    const [result] = await context.service.listByCustomer(34, comercial);

    expect(result.instalacion).toEqual(expect.objectContaining({
      fuente: 'LEGACY_LOCAL', idOt: 8, fechaCompletada: completedAt,
      tecnico: { idUsuario: 9, nombreCompleto: 'Tecnico Local' },
    }));
  });

  it('representa un cierre G3 aunque no existan datos tecnicos opcionales', async () => {
    const processedAt = new Date('2026-10-07T13:00:00.000Z');
    const context = serviceContextSetup({
      datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: '53', resultadoInstalacion: { equipos_instalados: [], equipos_retirados: [] } },
      g3: [{
        idIntegracion: 2, idEmpresa: 1, idContrato: 22, idServicio: 3,
        idOtG3: '53', codigoOtG3: null, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA',
        fechaCierreProcesado: processedAt,
      }],
    });

    const [result] = await context.service.listByCustomer(34, comercial);

    expect(result.instalacion).toEqual(expect.objectContaining({
      fuente: 'G3', idOt: '53', fechaCompletada: null,
      fechaProcesamiento: processedAt, idTecnicoG3: null, tecnico: null,
    }));
  });

  it('no asocia cierres G3 de otro contrato o empresa', async () => {
    const context = serviceContextSetup({
      datosTecnicos: { fuenteInstalacion: 'G3', idOtG3: '53' },
      g3: [
        { idIntegracion: 3, idEmpresa: 2, idContrato: 22, idServicio: 3, idOtG3: '54', codigoOtG3: null, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: new Date() },
        { idIntegracion: 2, idEmpresa: 1, idContrato: 99, idServicio: 3, idOtG3: '53', codigoOtG3: null, estadoIntegracion: 'COMPLETADA', estadoOtG3: 'COMPLETADA', fechaCierreProcesado: new Date() },
      ],
    });

    const [result] = await context.service.listByCustomer(34, comercial);

    expect(result.instalacion).toBeNull();
  });

  it('genera una orden de instalacion desde un servicio pendiente', async () => {
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 7);
    const fechaProgramada = scheduledDate.toISOString().slice(0, 10);
    const serviceRecord = {
      idServicio: 55,
      idCliente: 10,
      idEmpresa: 1,
      idContrato: 30,
      idDireccion: 7,
      estadoOperativo: 'Pendiente Instalacion',
      contrato: { idContrato: 30, estado: 'Firmado', plan: null },
      cliente: { idCliente: 10 },
      empresa: { idEmpresa: 1 },
      direccion: null,
      zonaPago: null,
      equipos: [],
      tickets: [],
      ordenes: [],
      solicitudes: [],
      tipoServicio: 'Internet',
      observaciones: null,
      datosTecnicos: null,
      fechaCreacion: new Date('2026-07-01T00:00:00.000Z'),
    };
    const tx = {
      ordenTrabajo: {
        create: jest.fn().mockResolvedValue({ idOt: 21, tipoOt: 'Instalacion' }),
        update: jest.fn().mockResolvedValue({
          idOt: 21,
          idEmpresa: 1,
          idCliente: 10,
          idServicio: 55,
          idTecnico: 4,
          tipoOt: 'Instalacion',
          estado: 'Pendiente',
          codigoSeguimiento: 'OT-INS-000021',
        }),
      },
      servicioContratado: {
        update: jest.fn().mockResolvedValue({
          ...serviceRecord,
          estadoOperativo: 'Instalacion Programada',
        }),
      },
      historialOt: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      servicioContratado: {
        findUnique: jest.fn().mockResolvedValue(serviceRecord),
      },
      ordenTrabajo: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      direccionServicio: {
        findUnique: jest.fn().mockResolvedValue({ idDireccion: 7, idCliente: 10 }),
      },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { idUsuario: 4, nombreCompleto: 'Terreno FiNet', email: 'terreno@finet.local' },
        ]),
      },
      $transaction: jest.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new ServicesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.createInstallOrder(
      55,
      {
        fechaProgramada,
        tipoConexion: 'Fibra Optica',
        horaVisita: '11:00',
        idTecnico: 4,
        prioridad: 'Media',
      },
      comercial,
    );

    expect(result.orden).toEqual(
      expect.objectContaining({
        codigoSeguimiento: 'OT-INS-000021',
        idServicio: 55,
        tecnico: expect.objectContaining({ nombreCompleto: 'Terreno FiNet' }),
      }),
    );
    expect(tx.servicioContratado.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idServicio: 55 },
        data: { estadoOperativo: 'Instalacion Programada' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'GENERAR_ORDEN_INSTALACION_SERVICIO',
        valorNuevo: expect.objectContaining({
          idCliente: 10,
          idServicio: 55,
          codigoSeguimiento: 'OT-INS-000021',
        }),
      }),
    );
  });

  it('bloquea la creación de un servicio mientras el contrato no está firmado', async () => {
    const prisma = {
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 10,
          idEmpresa: 1,
          contratos: [{ idEmpresa: 1 }],
        }),
      },
      contrato: {
        findUnique: jest.fn().mockResolvedValue({
          idContrato: 30,
          idCliente: 10,
          idEmpresa: 1,
          estado: 'Pendiente firma contrato',
        }),
      },
      servicioContratado: { create: jest.fn() },
    };
    const service = new ServicesService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(service.create({
      idCliente: 10,
      idContrato: 30,
      tipoServicio: 'Internet',
      estadoOperativo: 'Pendiente Instalacion',
    }, comercial)).rejects.toThrow('Debes confirmar la firma del contrato antes de crear un servicio');

    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
  });

  it('deriva el servicio pendiente desde el tipo de plan al confirmar un contrato firmado', async () => {
    const created = {
      idServicio: 56, idCliente: 10, idEmpresa: 1, idContrato: 30, idDireccion: 7, idZonaPago: null,
      tipoServicio: 'Internet + Television', estadoOperativo: 'Pendiente Instalacion',
      cliente: { idCliente: 10 }, empresa: { idEmpresa: 1 },
      contrato: { idContrato: 30, estado: 'Firmado', plan: { idPlan: 7 } },
      direccion: { idDireccion: 7, direccionCompleta: 'Av. Siempre Viva 405' }, zonaPago: null,
      equipos: [], tickets: [], ordenes: [], solicitudes: [], observaciones: null, datosTecnicos: null, fechaCreacion: new Date(),
    };
    const prisma = {
      contrato: { findUnique: jest.fn().mockResolvedValue({ idContrato: 30, idCliente: 10, idEmpresa: 1, idZonaPago: null, estado: 'Firmado', plan: { idPlan: 7, tipoPlan: 'Internet+TV' }, cliente: { idCliente: 10, idEmpresa: 1 } }) },
      servicioContratado: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      direccionServicio: { findFirst: jest.fn().mockResolvedValue({ idDireccion: 7 }) },
      cliente: { findUnique: jest.fn().mockResolvedValue({ idCliente: 10, estado: 'Pendiente firma contrato', contratos: [{ estado: 'Firmado' }], servicios: [{ estadoOperativo: 'Pendiente Instalacion' }] }), update: jest.fn() },
    };
    const audit = { record: jest.fn() };
    const service = new ServicesService(prisma as unknown as PrismaService, audit as unknown as AuditService);

    const result = await service.ensureInstallationServiceForContract(30, comercial);

    expect(result).toBe(created);
    expect(prisma.servicioContratado.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idContrato: 30, tipoServicio: 'Internet + Television', estadoOperativo: 'Pendiente Instalacion' }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_SERVICIO_DESDE_CONTRATO_FIRMADO' }));
  });

  it('expone las horas libres y bloquea visualmente las horas ocupadas del día', async () => {
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 7);
    const fechaProgramada = scheduledDate.toISOString().slice(0, 10);
    const serviceRecord = {
      idServicio: 55,
      idCliente: 10,
      idEmpresa: 1,
      estadoOperativo: 'Pendiente Instalacion',
      contrato: { estado: 'Firmado' },
      ordenes: [],
    };
    const prisma = {
      servicioContratado: { findUnique: jest.fn().mockResolvedValue(serviceRecord) },
      ordenTrabajo: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{
          idTecnico: 4,
          fechaProgramada: new Date(`${fechaProgramada}T00:00:00.000Z`),
          observaciones: buildInstallOrderObservations({ tipoConexion: 'Fibra Optica', horaVisita: '11:00' }),
        }]),
      },
      usuario: { findMany: jest.fn().mockResolvedValue([{ idUsuario: 4, nombreCompleto: 'Terreno FiNet', email: null }]) },
    };
    const service = new ServicesService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    const result = await service.installDayAvailability(55, { fechaProgramada }, comercial);

    expect(result.horarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ horaVisita: '09:00', disponible: true }),
      expect.objectContaining({ horaVisita: '11:00', disponible: false, motivo: 'Horario ocupado' }),
    ]));
  });

  it('rechaza crear manualmente un servicio Activo sin instalacion completada', async () => {
    const prisma = {
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 10,
          idEmpresa: 1,
          contratos: [{ idEmpresa: 1 }],
        }),
      },
      contrato: {
        findUnique: jest.fn().mockResolvedValue({
          idContrato: 30,
          idCliente: 10,
          idEmpresa: 1,
          estado: 'Firmado',
        }),
      },
      direccionServicio: {
        findFirst: jest.fn().mockResolvedValue({ idDireccion: 7 }),
        findUnique: jest.fn().mockResolvedValue({ idDireccion: 7, idCliente: 10 }),
      },
      servicioContratado: { create: jest.fn() },
    };
    const audit = { record: jest.fn() };
    const service = new ServicesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    await expect(service.create({
      idCliente: 10,
      idContrato: 30,
      tipoServicio: 'Internet',
      estadoOperativo: 'Activo',
    }, comercial)).rejects.toThrow('no puede quedar Activo sin una instalacion completada');

    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'RECHAZAR_ACTIVACION_MANUAL_SERVICIO',
    }));
  });
});
