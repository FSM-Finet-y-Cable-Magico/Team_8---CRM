import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ImportsService } from './imports.service';

const admin: AuthUser = {
  idUsuario: 1,
  idEmpresa: 1,
  email: 'admin@finet.local',
  nombreCompleto: 'Admin FiNet',
  roles: ['Administrador'],
};

describe('ImportsService importacion historica', () => {
  it('registra Cliente, direccion y Servicio preexistente de forma auditable sin crear una OT falsa', async () => {
    const tx = {
      cliente: { create: jest.fn().mockResolvedValue({ idCliente: 81 }) },
      direccionServicio: { create: jest.fn().mockResolvedValue({ idDireccion: 91 }) },
      servicioContratado: { create: jest.fn().mockResolvedValue({ idServicio: 71 }) },
      prospecto: { create: jest.fn() },
      ordenTrabajo: { create: jest.fn() },
    };
    const prisma = {
      cliente: { findUnique: jest.fn().mockResolvedValue(null) },
      prospecto: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new ImportsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    const csv = [
      'rut,nombre_completo,telefono,direccion,tipo_registro,tipo_servicio,estado_servicio',
      '25307395-0,Cliente Historico,+56912345678,Av. Costanera 100,cliente,Internet,Activo',
    ].join('\n');
    const file = {
      originalname: 'historicos.csv',
      buffer: Buffer.from(csv, 'utf8'),
    } as Express.Multer.File;

    const result = await service.importClients(file, admin, 1);

    expect(result).toEqual(expect.objectContaining({
      status: 'completada',
      importedRows: 1,
      importedServices: 1,
    }));
    expect(tx.cliente.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        importadoMasivo: true,
        origenContacto: 'Importacion historica',
      }),
    });
    expect(tx.direccionServicio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idCliente: 81,
        direccionCompleta: 'Av. Costanera 100',
      }),
    });
    expect(tx.servicioContratado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idCliente: 81,
        idDireccion: 91,
        tipoServicio: 'Internet',
        estadoOperativo: 'Activo',
        datosTecnicos: expect.objectContaining({ origen: 'Importacion historica' }),
      }),
    });
    expect(tx.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'IMPORTACION_HISTORICA_CLIENTES',
      valorNuevo: expect.objectContaining({
        clientesHistoricos: 1,
        serviciosHistoricos: 1,
        creaOrdenTrabajo: false,
      }),
    }));
  });
});
