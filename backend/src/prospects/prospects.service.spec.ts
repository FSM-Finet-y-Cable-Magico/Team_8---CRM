import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { todayDateOnly } from '../common/date-rules';
import { buildInstallOrderObservations } from '../common/install-order-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ProspectsService } from './prospects.service';
import { CoverageDomainService } from '../coverage/coverage-domain.service';

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
      {} as CoverageDomainService,
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
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 9, idEmpresa: 2, activo: true }) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
      {} as CoverageDomainService,
    );

    const result = await service.create(
      {
        idEmpresa: 2,
        rut: '21600781-6',
        nombreCompleto: 'Xiao Zhong',
        email: 'xiao@example.com',
        telefono: '+56940618332',
        direccion: 'Claudio Gay 2547, Santiago',
        idPlanInteres: 9,
      },
      admin,
    );

    expect(result.idEmpresa).toBe(2);
    expect(prisma.prospecto.findFirst).toHaveBeenCalledWith({
      where: { rut: '21600781-6', idEmpresa: 2 },
    });
    expect(prisma.prospecto.create).toHaveBeenCalled();
    expect(prisma.prospecto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idPlanInteres: 9 }),
    }));
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
      {} as CoverageDomainService,
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

  it('bloquea la cotizacion cuando la ubicacion esta fuera de cobertura general', async () => {
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue({
          idProspecto: 11,
          idEmpresa: 1,
          email: 'cliente@example.com',
          estadoPipeline: 'No Factible',
          latitud: -33.58,
          longitud: -70.63,
        }),
      },
      cotizacion: { create: jest.fn() },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
      { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: false, planes: [] }) } as unknown as CoverageDomainService,
    );

    await expect(service.generateQuote(11, { planId: 8 }, admin)).rejects.toThrow('no esta disponible');
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  it('permite cotizar dentro de cobertura general sin depender de una evidencia tecnica previa', async () => {
    const prospect = {
      idProspecto: 14,
      idEmpresa: 1,
      email: 'cliente@example.com',
      nombreCompleto: 'Prospecto FiNet',
      estadoPipeline: 'Prospecto Nuevo',
      idPlanInteres: null,
      latitud: -33.58,
      longitud: -70.63,
    };
    const quote = {
      idCotizacion: 24,
      idProspecto: 14,
      idPlan: 8,
      plan: { idPlan: 8, nombreComercial: 'Fibra 600' },
      prospecto: { empresa: { nombre: 'FiNet Limitada' } },
    };
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue(prospect),
        update: jest.fn().mockResolvedValue({ ...prospect, estadoPipeline: 'Cotizacion Enviada', idPlanInteres: 8 }),
      },
      cotizacion: {
        create: jest.fn().mockResolvedValue(quote),
        update: jest.fn().mockResolvedValue({ ...quote, pdfUrl: '/prospects/14/quotes/24/pdf' }),
      },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 8, idEmpresa: 1, activo: true }) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const mail = { sendQuote: jest.fn().mockResolvedValue({ status: 'skipped' }) };
    const coverage = { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 8 }] }) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      mail as unknown as MailService,
      coverage as unknown as CoverageDomainService,
    );
    jest.spyOn(service as any, 'renderQuotePdfBuffer').mockResolvedValue(Buffer.from('pdf'));

    await expect(service.generateQuote(14, { planId: 8 }, admin)).resolves.toMatchObject({ idCotizacion: 24 });
    expect(prisma.cotizacion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idProspecto: 14, idPlan: 8, factibilidadVerificada: true }),
    }));
    expect(prisma.prospecto.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoPipeline: 'Cotizacion Enviada', idPlanInteres: 8 }),
    }));
  });
  it('ubica automáticamente un prospecto previo al cotizar, sin convertirlo en cliente', async () => {
    const prospect = { idProspecto: 14, idEmpresa: 1, idCliente: null, email: 'prueba@example.com', nombreCompleto: 'Prueba', estadoPipeline: 'Prospecto Nuevo', idPlanInteres: null,
      direccion: 'Plaza de Armas 951', comuna: 'Santiago', region: 'Región Metropolitana', latitud: null, longitud: null };
    const quote = { idCotizacion: 24, prospecto: { empresa: { nombre: 'FiNet' } } };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })) },
      cotizacion: { create: jest.fn().mockResolvedValue(quote), update: jest.fn().mockResolvedValue(quote) },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 8, idEmpresa: 1, activo: true }) },
      cliente: { create: jest.fn() }, servicioContratado: { create: jest.fn() },
    };
    const location = { latitud: -33.4371, longitud: -70.6506 };
    const coverage = { resolveAddress: jest.fn().mockResolvedValue(location), plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, zona: { idZonaPago: 3 }, planes: [{ idPlan: 8 }] }) };
    const audit = { record: jest.fn() };
    const service = new ProspectsService(prisma as unknown as PrismaService, audit as unknown as AuditService,
      { sendQuote: jest.fn().mockResolvedValue({ status: 'skipped' }) } as unknown as MailService, coverage as unknown as CoverageDomainService);
    jest.spyOn(service as any, 'renderQuotePdfBuffer').mockResolvedValue(Buffer.from('pdf'));

    await service.generateQuote(14, { planId: 8, validarDireccion: true }, admin);

    expect(coverage.resolveAddress).toHaveBeenCalledWith({ direccion: prospect.direccion, comuna: prospect.comuna, region: prospect.region });
    expect(coverage.plansForLocation).toHaveBeenCalledWith(1, location, admin);
    expect(prisma.prospecto.update).toHaveBeenCalledWith({ where: { idProspecto: 14 }, data: { ...location, idZonaPago: 3 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ACTUALIZAR_UBICACION_PROSPECTO' }));
    expect(prisma.cliente.create).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.create).not.toHaveBeenCalled();
  });

  it('una dirección previa no localizable bloquea la cotización sin guardar cambios', async () => {
    const prisma = { prospecto: { findUnique: jest.fn().mockResolvedValue({ idProspecto: 14, idEmpresa: 1, direccion: 'Dirección de prueba', comuna: 'Santiago', latitud: null, longitud: null }), update: jest.fn() }, cotizacion: { create: jest.fn() } };
    const service = new ProspectsService(prisma as unknown as PrismaService, {} as AuditService, {} as MailService,
      { resolveAddress: jest.fn().mockRejectedValue(new Error('No pudimos ubicar esa dirección')) } as unknown as CoverageDomainService);
    await expect(service.generateQuote(14, { planId: 8, validarDireccion: true }, admin)).rejects.toThrow('No pudimos ubicar');
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  it('rechaza cotizar un plan activo de otra empresa', async () => {
    const prospect = {
      idProspecto: 12,
      idEmpresa: 1,
      email: 'cliente@example.com',
      nombreCompleto: 'Prospecto FiNet',
      estadoPipeline: 'Factible',
      latitud: -33.58,
      longitud: -70.63,
    };
    const quote = {
      idCotizacion: 22,
      idProspecto: 12,
      idPlan: 9,
      plan: { idPlan: 9, nombreComercial: 'Cable 200 Hogar' },
      prospecto: { empresa: { nombre: 'FiNet Limitada' } },
    };
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue(prospect),
        update: jest.fn().mockResolvedValue(prospect),
      },
      cotizacion: {
        findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1, factibilidadVerificada: true }),
        create: jest.fn().mockResolvedValue(quote),
        update: jest.fn().mockResolvedValue(quote),
      },
      plan: {
        findUnique: jest.fn().mockResolvedValue({ idPlan: 9, idEmpresa: 2, activo: true }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { sendQuote: jest.fn().mockResolvedValue({ status: 'skipped' }) } as unknown as MailService,
      { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 9 }] }) } as unknown as CoverageDomainService,
    );
    jest.spyOn(service as any, 'renderQuotePdfBuffer').mockResolvedValue(Buffer.from('pdf'));

    await expect(service.generateQuote(12, { planId: 9 }, admin)).rejects.toThrow('inactivo');
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  it('no permite cotizar un plan inactivo', async () => {
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue({
          idProspecto: 13,
          idEmpresa: 1,
          email: 'cliente@example.com',
          estadoPipeline: 'Factible',
          latitud: -33.58,
          longitud: -70.63,
        }),
      },
      cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1, factibilidadVerificada: true }) },
      plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 10, activo: false }) },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
      { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 10 }] }) } as unknown as CoverageDomainService,
    );

    await expect(service.generateQuote(13, { planId: 10 }, admin)).rejects.toThrow('inactivo');
  });
  it('registra el contrato pendiente sin crear cliente, servicio ni OT', async () => {
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
      idPlanInteres: 9,
    };
    const createdContract = {
      idContrato: 30,
      idCliente: null,
      idProspecto: 20,
      idPlan: 8,
      idEmpresa: 1,
      estado: 'Pendiente firma contrato',
    };
    const transaction = {
      cliente: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
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
      {} as CoverageDomainService,
    );

    const result = await service.contractPlan(
      20,
      {
        planId: 8,
        fechaInicio: '2026-08-25',
      },
      admin,
    );

    expect(result.contrato).toBe(createdContract);
    expect(transaction.contrato.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'Pendiente firma contrato',
          diaVencimiento: 1,
          proveedorContrato: undefined,
          folioContratoExterno: undefined,
        }),
      }),
    );
    expect(transaction.cliente.create).not.toHaveBeenCalled();
    expect(transaction.direccionServicio.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveProperty('servicioContratado');
    expect(transaction.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProspecto: 20 },
        data: expect.objectContaining({
          estadoPipeline: 'Pendiente firma',
        }),
      }),
    );
    expect(transaction.prospecto.update.mock.calls[0][0].data).not.toHaveProperty('idPlanInteres');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'GENERAR_CONTRATO_PROSPECTO' }),
    );
  });

  it('rechaza confirmar contratacion si el prospecto no tiene cotizacion factible del plan', async () => {
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
      {} as CoverageDomainService,
    );

    await expect(
      service.contractPlan(
        20,
        { planId: 8 },
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
      {} as CoverageDomainService,
    );

    const result = await service.recordLoss(
      10,
      { motivo: 'Precio', observaciones: 'Cliente eligio otra oferta' },
      admin,
    );

    expect(result.estadoPipeline).toBe('Perdido');
    expect(prisma.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          motivoPerdida: 'Precio',
          observacionPerdida: 'Cliente eligio otra oferta',
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
      {} as CoverageDomainService,
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
              horaVisita: '11:00',
            }),
          },
        ]),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
      {} as CoverageDomainService,
    );

    const result = await service.installAvailability(
      10,
      { fechaProgramada: requestedDate, horaVisita: '11:00' },
      admin,
    );

    expect(result.tecnicosDisponibles).toEqual([]);
    expect(result.alternativas.length).toBeGreaterThan(0);
    expect(result.alternativas[0].tecnicosDisponibles[0].idTecnico).toBe(4);

    const day = await service.installDayAvailability(10, { fechaProgramada: requestedDate }, admin);
    expect(day.horarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ horaVisita: '09:00', disponible: true }),
      expect.objectContaining({ horaVisita: '11:00', disponible: false, motivo: 'Horario ocupado' }),
    ]));
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
      {} as CoverageDomainService,
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

  it('agenda una instalación para un prospecto firmado sin crear antes el cliente', async () => {
    const requestedDate = futureDate();
    const prospect = {
      idProspecto: 22,
      idEmpresa: 1,
      idCliente: null,
      estadoPipeline: 'Pendiente activacion',
      direccion: 'Av. Las Condes 123',
    };
    const contract = {
      idContrato: 45,
      idProspecto: 22,
      idCliente: null,
      idEmpresa: 1,
      estado: 'Firmado',
      direccionInstalacion: 'Av. Las Condes 123',
      comunaInstalacion: 'Las Condes',
      ciudadInstalacion: 'Santiago',
    };
    const transaction = {
      direccionServicio: { findFirst: jest.fn(), create: jest.fn() },
      servicioContratado: { findFirst: jest.fn(), update: jest.fn() },
      ordenTrabajo: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idOt: 44, ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idOt: 44, ...data })),
      },
      prospecto: {
        update: jest.fn().mockResolvedValue({ ...prospect, estadoPipeline: 'Instalacion Programada' }),
      },
    };
    const prisma = {
      prospecto: { findUnique: jest.fn().mockResolvedValue(prospect) },
      cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 3 }) },
      contrato: { findFirst: jest.fn().mockResolvedValue(contract) },
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
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { sendQuote: jest.fn() } as unknown as MailService,
      {} as CoverageDomainService,
    );

    await service.createInstallOrder(22, {
      fechaProgramada: requestedDate,
      horaVisita: '10:00',
      tipoConexion: 'Fibra Optica',
      idTecnico: 4,
    }, admin);

    expect(transaction.ordenTrabajo.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idProspecto: 22,
        idCliente: null,
        idServicio: undefined,
        idDireccion: undefined,
      }),
    }));
    expect(transaction.direccionServicio.create).not.toHaveBeenCalled();
    expect(transaction.servicioContratado.findFirst).not.toHaveBeenCalled();
  });
});
