import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ProspectsService } from './prospects.service';

describe('ProspectsService', () => {
  const admin: AuthUser = {
    idUsuario: 1,
    idEmpresa: 1,
    email: 'admin@finet.local',
    nombreCompleto: 'Administrador',
    roles: ['Administrador'],
  };

  it('reactiva un prospecto perdido y limpia el motivo de perdida', async () => {
    const prospect = {
      idProspecto: 10,
      idEmpresa: 1,
      estadoPipeline: 'Perdido',
      motivoPerdida: 'Precio',
      fechaCreacion: new Date('2026-06-01T00:00:00.000Z'),
    };
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue(prospect),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    const result = await service.updatePipeline(10, { estadoPipeline: 'Servicio Activo' }, admin);

    expect(result.estadoPipeline).toBe('Servicio Activo');
    expect(result.motivoPerdida).toBeNull();
    expect(prisma.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estadoPipeline: 'Servicio Activo',
          motivoPerdida: null,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'REACTIVAR_PROSPECTO' }),
    );
  });

  it('permite registrar el mismo RUT como prospecto de otra empresa', async () => {
    const prisma = {
      prospecto: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          idProspecto: 20,
          idEmpresa: 2,
          rut: '21600781-6',
          estadoPipeline: 'Prospecto Nuevo',
        }),
      },
      cliente: {
        findUnique: jest.fn().mockResolvedValue({
          idCliente: 5,
          idEmpresa: 1,
          contratos: [{ idEmpresa: 1 }],
        }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    const result = await service.create(
      {
        idEmpresa: 2,
        rut: '21600781-6',
        nombreCompleto: 'Xiao Zhong',
        email: 'xiao@example.com',
        telefono: '+56940618332',
        direccion: 'Claudio Gay 2547, Santiago',
      },
      admin,
    );

    expect(result.idEmpresa).toBe(2);
    expect(prisma.prospecto.findFirst).toHaveBeenCalledWith({
      where: { rut: '21600781-6', idEmpresa: 2 },
    });
    expect(prisma.prospecto.create).toHaveBeenCalled();
  });
});
