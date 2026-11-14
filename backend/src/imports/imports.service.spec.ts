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
  it.each(['', 'cliente', 'prospecto'])('solo crea prospectos con tipo explícito (tipo: %s)', async tipo => {
    const tx = { cliente: { create: jest.fn(async () => ({ idCliente: 10 })) }, prospecto: { create: jest.fn() }, direccionServicio: { create: jest.fn() } };
    const prisma = { cliente: { findUnique: jest.fn(async () => null) }, prospecto: { findFirst: jest.fn(async () => null) }, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    const service = new ImportsService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService);
    const result = await service.importClients({ originalname: 'clientes.csv', buffer: Buffer.from(`rut,nombre_completo,telefono,direccion,tipo_registro\n25307395-0,Persona QA,+56912345678,Calle QA 100,${tipo}`) } as Express.Multer.File, admin, 1);
    expect(result.importedRows).toBe(1);
    expect(tx.cliente.create).toHaveBeenCalledTimes(tipo === 'prospecto' ? 0 : 1);
    expect(tx.prospecto.create).toHaveBeenCalledTimes(tipo === 'prospecto' ? 1 : 0);
  });

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
