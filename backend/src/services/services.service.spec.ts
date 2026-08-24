import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
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
      contrato: { idContrato: 30, estado: 'Pendiente', plan: null },
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
});
