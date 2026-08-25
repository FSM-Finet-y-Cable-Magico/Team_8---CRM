import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { todayDateOnly } from '../common/date-rules';
import { buildInstallOrderObservations } from '../common/install-order-metadata';
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

  function futureDate(days = 2) {
    const date = new Date(`${todayDateOnly()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

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

  it('lista solo prospectos activos no convertidos', async () => {
    const prisma = {
      prospecto: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    await service.list(admin, 'consolidado');

    expect(prisma.prospecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { idCliente: null },
            { OR: [{ estadoPipeline: null }, { estadoPipeline: { not: 'Perdido' } }] },
          ]),
        }),
      }),
    );
  });

  it('no permite cotizar un prospecto marcado como no factible', async () => {
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue({
          idProspecto: 11,
          idEmpresa: 1,
          email: 'cliente@example.com',
          estadoPipeline: 'No Factible',
        }),
      },
      cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1, factibilidadVerificada: true }) },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    await expect(service.generateQuote(11, { planId: 8 }, admin)).rejects.toThrow('Factible');
  });
  it('registra contrato externo y convierte el prospecto en cliente pendiente de firma sin crear servicio ni OT', async () => {
    const prospect = {
      idProspecto: 20,
      idEmpresa: 1,
      idCliente: null,
      rut: '21600781-6',
      nombreCompleto: 'Xiao Zhong',
      email: 'xiao@example.com',
      telefono: '+56940618332',
      direccion: 'Claudio Gay 2547, Santiago',
      estadoPipeline: 'Cotizacion Enviada',
      motivoPerdida: null,
      fechaCreacion: new Date('2026-06-01T00:00:00.000Z'),
      origenContacto: 'Formulario web',
    };
    const createdCustomer = {
      idCliente: 5,
      idEmpresa: 1,
      rut: '21600781-6',
      nombreCompleto: 'Xiao Zhong',
      email: 'xiao@example.com',
      telefono: '+56940618332',
      estado: 'Pendiente firma contrato',
      origenContacto: 'Formulario web',
      importadoMasivo: false,
    };
    const createdContract = {
      idContrato: 30,
      idCliente: 5,
      idPlan: 8,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
      proveedorContrato: 'FACTURACION_CL',
      folioContratoExterno: 'FC-100',
    };
    const transaction = {
      cliente: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdCustomer),
        update: jest.fn(),
      },
      contrato: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdContract),
        update: jest.fn(),
      },
      direccionServicio: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ idDireccion: 12 }),
      },
      prospecto: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
      },
    };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      plan: {
        findUnique: jest.fn().mockResolvedValue({
          idPlan: 8,
          idEmpresa: 1,
          activo: true,
          tipoPlan: 'Internet',
          nombreComercial: 'Fibra 300 Hogar',
          velocidadMbps: 300,
        }),
      },
      cotizacion: {
        findFirst: jest.fn().mockResolvedValue({ idCotizacion: 99, idPlan: 8, factibilidadVerificada: true }),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => unknown) => callback(transaction),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    const result = await service.contractPlan(
      20,
      {
        planId: 8,
        diaVencimiento: 5,
        folioContratoExterno: 'FC-100',
        fechaEnvioCliente: '2026-08-25',
      },
      admin,
    );

    expect(result.cliente.estado).toBe('Pendiente firma contrato');
    expect(result.contrato).toBe(createdContract);
    expect(transaction.contrato.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'Pendiente firma contrato',
          proveedorContrato: 'FACTURACION_CL',
          folioContratoExterno: 'FC-100',
        }),
      }),
    );
    expect(transaction).not.toHaveProperty('servicioContratado');
    expect(transaction.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProspecto: 20 },
        data: expect.objectContaining({
          idCliente: 5,
          estadoPipeline: 'Contrato externo registrado',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'REGISTRAR_CONTRATO_EXTERNO_PROSPECTO' }),
    );
  });

  it('rechaza registrar contrato externo si el prospecto no tiene cotizacion factible del plan', async () => {
    const prospect = {
      idProspecto: 20,
      idEmpresa: 1,
      idCliente: null,
      rut: '21600781-6',
      nombreCompleto: 'Xiao Zhong',
      email: 'xiao@example.com',
      telefono: '+56940618332',
      direccion: 'Claudio Gay 2547, Santiago',
      estadoPipeline: 'Factible',
      motivoPerdida: null,
      fechaCreacion: new Date('2026-06-01T00:00:00.000Z'),
    };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 8, idEmpresa: 1, activo: true }) },
      cotizacion: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    await expect(
      service.contractPlan(
        20,
        { planId: 8, diaVencimiento: 5, folioContratoExterno: 'FC-100' },
        admin,
      ),
    ).rejects.toThrow('cotizacion factible');
  });

  it('marca un prospecto como perdido con motivo, observacion y responsable', async () => {
    const prospect = {
      idProspecto: 10,
      idEmpresa: 1,
      estadoPipeline: 'Factible',
      motivoPerdida: null,
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

    const result = await service.recordLoss(
      10,
      { motivo: 'Precio', observaciones: 'Cliente eligio otra oferta', detalleMotivoPerdida: 'Competidor local' },
      admin,
    );

    expect(result.estadoPipeline).toBe('Perdido');
    expect(prisma.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          motivoPerdida: 'Precio',
          observacionPerdida: 'Competidor local',
          idUsuarioPerdida: admin.idUsuario,
        }),
      }),
    );
  });
  it('rechaza una orden de instalacion programada en una fecha historica', async () => {
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue({
          idProspecto: 10,
          idEmpresa: 1,
          idCliente: 5,
          direccion: 'Av. Siempre Viva 123',
        }),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    await expect(
      service.createInstallOrder(
        10,
        {
          fechaProgramada: '1700-01-01',
          horaVisita: '10:00',
          tipoConexion: 'Fibra Optica',
          idTecnico: 4,
        },
        admin,
      ),
    ).rejects.toThrow('no puede ser anterior a hoy');
  });

  it('sugiere horarios alternativos cuando todos los tecnicos estan ocupados', async () => {
    const requestedDate = futureDate();
    const prospect = {
      idProspecto: 10,
      idEmpresa: 1,
      idCliente: 5,
      estadoPipeline: 'Aceptado',
      direccion: 'Av. Siempre Viva 123',
    };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }) },
      contrato: { findFirst: jest.fn().mockResolvedValue({ idContrato: 2 }) },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { idUsuario: 4, nombreCompleto: 'Tecnico FiNet', email: 'terreno@finet.local' },
        ]),
      },
      ordenTrabajo: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            idTecnico: 4,
            fechaProgramada: new Date(`${requestedDate}T00:00:00.000Z`),
            observaciones: buildInstallOrderObservations({
              tipoConexion: 'Fibra Optica',
              horaVisita: '10:00',
            }),
          },
        ]),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    const result = await service.installAvailability(
      10,
      { fechaProgramada: requestedDate, horaVisita: '10:00' },
      admin,
    );

    expect(result.tecnicosDisponibles).toEqual([]);
    expect(result.alternativas.length).toBeGreaterThan(0);
    expect(result.alternativas[0].tecnicosDisponibles[0].idTecnico).toBe(4);
  });

  it('crea la orden asignada y avanza el prospecto a Instalacion Programada', async () => {
    const requestedDate = futureDate();
    const prospect = {
      idProspecto: 10,
      idEmpresa: 1,
      idCliente: 5,
      estadoPipeline: 'Aceptado',
      direccion: 'Av. Siempre Viva 123',
    };
    const transaction = {
      direccionServicio: {
        findFirst: jest.fn().mockResolvedValue({ idDireccion: 8 }),
        create: jest.fn(),
      },
      servicioContratado: {
        findFirst: jest.fn().mockResolvedValue({ idServicio: 18, idDireccion: 8 }),
        update: jest.fn(),
      },
      ordenTrabajo: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idOt: 30, ...data })),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            idOt: 30,
            idEmpresa: 1,
            idCliente: 5,
            idTecnico: 4,
            idDireccion: 8,
            idServicio: 18,
            tipoOt: 'Instalacion',
            prioridad: 'Media',
            estado: 'Pendiente',
            fechaProgramada: new Date(`${requestedDate}T00:00:00.000Z`),
            observaciones: buildInstallOrderObservations({
              tipoConexion: 'Fibra Optica',
              horaVisita: '10:00',
              observacionesAgenda: 'Coordinar acceso con conserjeria',
            }),
            codigoSeguimiento: data.codigoSeguimiento,
          }),
        ),
      },
      prospecto: {
        update: jest.fn().mockResolvedValue({
          ...prospect,
          estadoPipeline: 'Instalacion Programada',
        }),
      },
    };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }) },
      contrato: { findFirst: jest.fn().mockResolvedValue({ idContrato: 2 }) },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          { idUsuario: 4, nombreCompleto: 'Tecnico FiNet', email: 'terreno@finet.local' },
        ]),
      },
      ordenTrabajo: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(
        (callback: (tx: typeof transaction) => unknown) => callback(transaction),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
    );

    const result = await service.createInstallOrder(
      10,
      {
        fechaProgramada: requestedDate,
        horaVisita: '10:00',
        tipoConexion: 'Fibra Optica',
        idTecnico: 4,
        prioridad: 'Media',
        observaciones: 'Coordinar acceso con conserjeria',
      },
      admin,
    );

    expect(transaction.ordenTrabajo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idTecnico: 4,
          idServicio: 18,
          tipoOt: 'Instalacion',
          fechaProgramada: new Date(`${requestedDate}T00:00:00.000Z`),
        }),
      }),
    );
    expect(transaction.ordenTrabajo.update).toHaveBeenCalledWith({
      where: { idOt: 30 },
      data: { codigoSeguimiento: 'OT-INS-000030' },
    });
    expect(result.prospecto.estadoPipeline).toBe('Instalacion Programada');
    expect(result.orden.tecnico.nombreCompleto).toBe('Tecnico FiNet');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'GENERAR_ORDEN_INSTALACION' }),
    );
  });
});
