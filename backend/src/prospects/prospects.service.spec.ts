import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { todayDateOnly } from '../common/date-rules';
import { buildInstallOrderObservations } from '../common/install-order-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ProspectsService } from './prospects.service';
import { CoverageDomainService } from '../coverage/coverage-domain.service';
import { Prisma } from '@prisma/client';

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

  function manualFixture(overrides: Record<string, unknown> = {}, contract: unknown = null) {
    const prospect = {
      idProspecto: 10, idEmpresa: 1, idCliente: null, estadoPipeline: 'Prospecto Nuevo',
      motivoPerdida: null, ...overrides,
    };
    const prisma = {
      prospecto: {
        findUnique: jest.fn().mockResolvedValue(prospect),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...prospect, ...data })),
      },
      contrato: { findFirst: jest.fn().mockResolvedValue(contract) },
    };
    const audit = { record: jest.fn() };
    const service = new ProspectsService(prisma as unknown as PrismaService, audit as unknown as AuditService,
      {} as MailService, {} as CoverageDomainService, {} as never);
    return { prospect, prisma, audit, service };
  }

  it.each(['Servicio Activo', 'Instalacion Programada', 'Aceptado', 'Pendiente firma',
    'Contrato externo registrado', 'Factible', 'No Factible', 'Cotizacion Enviada'])(
    'rechaza fabricar la etapa %s mediante PATCH generico incluso como administrador', async (estadoPipeline) => {
      const { service, prisma, audit } = manualFixture();
      await expect(service.updatePipeline(10, { estadoPipeline }, admin)).rejects.toThrow('operacion autorizada');
      expect(prisma.prospecto.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each(['Contactado', 'En Factibilidad', 'Servicio Activo', 'Instalacion Programada', 'Pendiente firma'])(
    'Perdido no puede saltar a %s', async (estadoPipeline) => {
      const { service, prisma } = manualFixture({ estadoPipeline: 'Perdido' });
      await expect(service.updatePipeline(10, { estadoPipeline }, admin)).rejects.toThrow();
      expect(prisma.prospecto.update).not.toHaveBeenCalled();
    },
  );

  it.each(['Firmado', 'Activo', 'Moroso', 'Suspendido', 'Pendiente firma contrato'])(
    'protege relaciones %s tanto al reactivar como al registrar perdida', async (estado) => {
      const { service, prisma } = manualFixture({ estadoPipeline: 'Perdido' }, { idContrato: 20, estado });
      await expect(service.updatePipeline(10, { estadoPipeline: 'Prospecto Nuevo' }, admin)).rejects.toThrow('relaciones comerciales');
      await expect(service.recordLoss(10, { motivo: 'Precio', observaciones: 'Motivo' }, admin)).rejects.toThrow('relaciones comerciales');
      expect(prisma.prospecto.update).not.toHaveBeenCalled();
    },
  );

  it.each(['Servicio Activo', 'Suspendido', 'Moroso', 'Estado historico desconocido'])(
    'conserva estado historico %s para revision sin sobrescribirlo', async (estadoPipeline) => {
      const { service, prisma, prospect } = manualFixture({ estadoPipeline });
      await expect(service.updatePipeline(10, { estadoPipeline: 'Contactado' }, admin)).rejects.toThrow();
      await expect(service.recordLoss(10, { motivo: 'Precio', observaciones: 'Motivo' }, admin)).rejects.toThrow();
      expect(prisma.prospecto.update).not.toHaveBeenCalled();
      expect(prospect.estadoPipeline).toBe(estadoPipeline);
    },
  );

  it.each([true, false])('registra la pérdida del contrato pendiente solo si sigue sin firma (%s)', async unsigned => {
    const { service, prisma, prospect, audit } = manualFixture({ estadoPipeline: 'Pendiente firma' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ available: false }]),
      prospecto: { findUniqueOrThrow: jest.fn().mockResolvedValue(prospect), update: prisma.prospecto.update },
      ordenTrabajo: { findFirst: jest.fn().mockResolvedValue(null) },
      contrato: {
        findMany: jest.fn().mockResolvedValue([{ idContrato: 20 }]),
        findFirst: jest.fn().mockResolvedValue(unsigned ? { idContrato: 20 } : null),
        update: jest.fn(),
      },
      contratoDigital: { updateMany: jest.fn() },
    };
    Object.assign(prisma, { $transaction: jest.fn(callback => callback(tx)) });
    const loss = service.recordLoss(10, { motivo: 'Otro', observaciones: 'La persona no firmó.' }, admin);
    if (unsigned) {
      await expect(loss).resolves.toMatchObject({ estadoPipeline: 'Perdido' });
      expect(tx.contrato.update).toHaveBeenCalledWith({ where: { idContrato: 20 }, data: { estado: 'Anulado' } });
      expect(tx.contratoDigital.updateMany).toHaveBeenCalledWith({ where: { idContrato: 20 }, data: { estadoFirma: 'Anulado' } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'REGISTRAR_PERDIDA_PROSPECTO' }), tx);
    } else {
      await expect(loss).rejects.toThrow('debe seguir pendiente de firma');
      expect(tx.contrato.update).not.toHaveBeenCalled();
      expect(prisma.prospecto.update).not.toHaveBeenCalled();
    }
    expect(tx.contrato.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ estado: 'Pendiente firma contrato', fechaFirmaManual: null }),
    }));
  });

  it('protege el cliente relacionado incluso cuando faltan contratos historicos', async () => {
    const { service, prisma } = manualFixture({ idCliente: 7 });
    await expect(service.updatePipeline(10, { estadoPipeline: 'Contactado' }, admin)).rejects.toThrow('relaciones comerciales');
    await expect(service.recordLoss(10, { motivo: 'Precio', observaciones: 'Motivo' }, admin)).rejects.toThrow('relaciones comerciales');
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
  });

  it('rechaza Sin cobertura como motivo para un contrato pendiente de firma', async () => {
    const { service, prisma } = manualFixture({ estadoPipeline: 'Pendiente firma' });
    await expect(service.recordLoss(10, { motivo: 'Sin cobertura', observaciones: 'Motivo' }, admin))
      .rejects.toThrow('Selecciona un motivo de pérdida comercial');
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
  });

  it('permite avance comercial inicial sin crear conversion ni alterar relaciones', async () => {
    const { service, prisma } = manualFixture();
    await service.updatePipeline(10, { estadoPipeline: 'Contactado' }, admin);
    expect(prisma.prospecto.update).toHaveBeenCalledWith({
      where: {
        idProspecto: 10, idEmpresa: 1, estadoPipeline: 'Prospecto Nuevo', idCliente: null,
        contratos: { none: { estado: { notIn: ['Baja', 'Anulado'] } } },
      },
      data: { estadoPipeline: 'Contactado', motivoPerdida: null }, include: { empresa: true },
    });
  });

  it('si la activacion cambia el prospecto antes del update, falla sin auditar una transicion inexistente', async () => {
    const { service, prisma, audit } = manualFixture();
    prisma.prospecto.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Changed', {
      code: 'P2025', clientVersion: '5.22.0',
    }));
    await expect(service.updatePipeline(10, { estadoPipeline: 'Contactado' }, admin)).rejects.toMatchObject({ status: 409 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('no permite al usuario sin empresa leer un prospecto sin empresa', async () => {
    const { service, prisma } = manualFixture({ idEmpresa: null });
    await expect(service.updatePipeline(10, { estadoPipeline: 'Contactado' }, {
      ...admin, roles: ['Comercial'], idEmpresa: null,
    })).rejects.toThrow('no tiene empresa');
    expect(prisma.prospecto.findUnique).not.toHaveBeenCalled();
  });

  it('mantiene visible y marcado para revision el historico Servicio Activo sin relacion real', async () => {
    const historical = { idProspecto: 10, idCliente: null, idEmpresa: 1, estadoPipeline: 'Servicio Activo',
      clasificacionComercial: 'CLIENTE', contratos: [] };
    const prisma = { prospecto: { findMany: jest.fn().mockResolvedValue([historical]) } };
    const service = new ProspectsService(prisma as unknown as PrismaService, {} as AuditService,
      {} as MailService, {} as CoverageDomainService, {} as never);
    const [result] = await service.list({ ...admin, roles: ['Comercial'] }, '2');
    expect(result).toMatchObject({ ...historical, requiereRevisionComercial: true });
    expect(historical.estadoPipeline).toBe('Servicio Activo');
    expect(prisma.prospecto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ contratos: expect.objectContaining({ where: { idEmpresa: 1 } }) }),
    }));
  });

  it('no bloquea visualmente un contrato real pendiente de firma', async () => {
    const prospect = { idProspecto: 11, idEmpresa: 1, idCliente: null, estadoPipeline: 'Pendiente firma',
      clasificacionComercial: 'PROSPECTO', contratos: [{ idContrato: 22, estado: 'Pendiente firma contrato' }] };
    const fechaHora = new Date('2026-11-11T19:46:58Z');
    const prisma = {
      prospecto: { findMany: jest.fn().mockResolvedValue([prospect]) },
      logAuditoria: { findMany: jest.fn().mockResolvedValue([{ idEntidadAfectada: 22, fechaHora }]) },
    };
    const service = new ProspectsService(prisma as unknown as PrismaService, {} as AuditService,
      {} as MailService, {} as CoverageDomainService, {} as never);
    expect((await service.list(admin))[0]).toMatchObject({
      requiereRevisionComercial: false,
      contratos: [{ idContrato: 22, fechaConfirmacion: fechaHora }],
    });
  });

  it('pendientes consolidados selecciona el contrato propio aunque exista otro ajeno mas reciente', async () => {
    const foreign = { idContrato: 91, idEmpresa: 2, estado: 'Firmado', plan: { idEmpresa: 2 } };
    const own = { idContrato: 90, idEmpresa: 1, estado: 'Firmado', plan: { idEmpresa: 1 } };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ available: false }]),
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 1 }, { idEmpresa: 2 }]) },
      prospecto: { findMany: jest.fn().mockResolvedValue([{ idProspecto: 10, idEmpresa: 1, contratos: [foreign, own] }]) },
    };
    const service = new ProspectsService(prisma as unknown as PrismaService, {} as AuditService,
      {} as MailService, {} as CoverageDomainService, {} as never);
    const [result] = await service.listPendingActivation(admin);
    expect(result.contratos).toEqual([expect.objectContaining({ ...own, origenFirma: 'SIN_FECHA' })]);
    const args = prisma.prospecto.findMany.mock.calls[0][0];
    expect(args.where.OR).toHaveLength(2);
    expect(args.where.OR[0].AND[0]).toEqual({ idEmpresa: 1 });
    expect(args.where.OR[1].AND[0]).toEqual({ idEmpresa: 2 });
    expect(args.include.contratos.take).toBeUndefined();
  });

  it.each([[1, 'FiNet Limitada'], [2, 'Cable Mágico Litoral']])('envía el PDF con diseño de la empresa %s y no de la sesión del administrador',async(idEmpresa, companyName)=>{
    const prospect={idProspecto:10,idEmpresa,latitud:-33.4,longitud:-70.6,email:'qa@example.invalid',nombreCompleto:'QA',rut:'12345678-5',direccion:'Los Arrayanes 245',estadoPipeline:'Factible',idPlanInteres:3};
    const plan={idPlan:3,idEmpresa,activo:true,nombreComercial:'Fibra Hogar 600',tipoPlan:'Internet',tipoCliente:'Residencial',velocidadMbps:600,precioMensual:{toString:()=> '34990'}};
    const quote={idCotizacion:4,codigo:'COT-QA-004',fechaEnvio:new Date('2026-11-12T12:00:00Z'),plan,prospecto:{...prospect,empresa:{nombre:companyName}}};
    const prisma={prospecto:{findUnique:jest.fn().mockResolvedValue(prospect),update:jest.fn()},
      cotizacion:{findFirst:jest.fn().mockResolvedValue({}),create:jest.fn().mockResolvedValue(quote),update:jest.fn().mockResolvedValue(quote)},
      plan:{findUnique:jest.fn().mockResolvedValue(plan)}};
    const mail={sendQuote:jest.fn().mockResolvedValue({status:'sent'})};
    const coverage={plansForLocation:jest.fn().mockResolvedValue({coberturaComercial:true,planes:[plan]})};
    const service=new ProspectsService(prisma as never,{record:jest.fn()} as never,mail as never,coverage as never,{} as never);
    await service.generateQuote(10,{planId:3},{...admin,idEmpresa:idEmpresa === 1 ? 2 : 1});
    expect(mail.sendQuote).toHaveBeenCalledWith(expect.objectContaining({idEmpresa,companyName,to:prospect.email,filename:'COT-QA-004.pdf'}));
    expect(mail.sendQuote).toHaveBeenCalledTimes(1);
    const attachment = mail.sendQuote.mock.calls[0][0].pdf as Buffer;
    expect(attachment.subarray(0,5).toString()).toBe('%PDF-');
    expect(attachment.toString('latin1')).toContain('/Subtype /Image');
  });

  it('reactiva un prospecto perdido y limpia el motivo de perdida', async () => {
    const prospect = {
      idProspecto: 10,
      idEmpresa: 1,
      estadoPipeline: 'Perdido',
      motivoPerdida: 'Precio',
      idCliente: null,
      fechaCreacion: new Date('2026-06-01T00:00:00.000Z'),
    };
    const prisma = {
      contrato: { findFirst: jest.fn().mockResolvedValue(null) },
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
      {} as never,
    );

    const result = await service.updatePipeline(10, { estadoPipeline: 'Prospecto Nuevo' }, admin);

    expect(result.estadoPipeline).toBe('Prospecto Nuevo');
    expect(result.motivoPerdida).toBeNull();
    expect(prisma.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estadoPipeline: 'Prospecto Nuevo',
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
      {} as never,
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

  describe('search (paginado, incluye Perdido)', () => {
    function searchFixture(rows: unknown[] = [], total = 0, grouped: unknown[] = [], options: { formerCount?: number; former?: boolean; invoices?: unknown[] } = {}) {
      const prisma = {
        prospecto: {
          // First count: listing total; second: exclientes in scope.
          count: jest.fn().mockResolvedValueOnce(total).mockResolvedValueOnce(options.formerCount ?? 0),
          findMany: jest.fn().mockResolvedValue(rows),
          groupBy: jest.fn().mockResolvedValue(grouped),
        },
        empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 1 }, { idEmpresa: 2 }]) },
        cliente: { count: jest.fn().mockResolvedValue(options.former ? 1 : 0) },
        factura: { findMany: jest.fn().mockResolvedValue(options.invoices ?? []) },
      };
      const service = new ProspectsService(prisma as unknown as PrismaService, {} as AuditService,
        {} as MailService, {} as CoverageDomainService, {} as never);
      return { prisma, service };
    }
    const lost = { idProspecto: 5, idEmpresa: 1, idCliente: null, estadoPipeline: 'Perdido', motivoPerdida: 'Precio elevado',
      clasificacionComercial: 'PROSPECTO', contratos: [], cotizaciones: [], _count: {} };

    it('no excluye Perdido, pagina en backend y no marca revisión comercial', async () => {
      const { prisma, service } = searchFixture([lost], 101, [
        { estadoPipeline: 'Perdido', _count: { _all: 40 } }, { estadoPipeline: null, _count: { _all: 61 } },
      ]);
      const result = await service.search(admin, { page: 3, pageSize: 20 });
      const call = prisma.prospecto.findMany.mock.calls[0][0];
      expect(JSON.stringify(call.where)).not.toContain('"not":"Perdido"');
      expect(call.where.OR[0].AND).toEqual(expect.arrayContaining([{ idCliente: null }]));
      expect(call).toMatchObject({ skip: 40, take: 20 });
      expect(result).toMatchObject({ total: 101, page: 3, pageSize: 20, counts: { Perdido: 40, 'Prospecto Nuevo': 61 } });
      expect(result.items[0]).toMatchObject({ estadoPipeline: 'Perdido', motivoPerdida: 'Precio elevado', requiereRevisionComercial: false });
    });

    it('busca por nombre, correo, teléfono y RUT con o sin puntos y guion sobre todo el conjunto', async () => {
      const { prisma, service } = searchFixture();
      await service.search(admin, { q: '12.345.678-5' });
      const filters = JSON.stringify(prisma.prospecto.findMany.mock.calls[0][0].where);
      expect(filters).toContain('"nombreCompleto":{"contains":"12.345.678-5"');
      expect(filters).toContain('"email"');
      expect(filters).toContain('"telefono"');
      expect(filters).toContain('"rut":{"contains":"123456785"');
      expect(filters).toContain('"rut":{"contains":"12345678-5"');
      expect(prisma.prospecto.findMany.mock.calls[0][0]).not.toHaveProperty('take', 100);
    });

    it.each(['123456785', '12345678-5', '12.345.678-5'])('RUT válido %s busca todas sus variantes almacenadas sin escribir', async (q) => {
      const { prisma, service } = searchFixture();
      await service.search(admin, { q });
      const where = JSON.stringify(prisma.prospecto.findMany.mock.calls[0][0].where);
      expect(where).toContain(JSON.stringify({ rut: { in: ['12345678-5', '123456785', '12.345.678-5', '12.345.6785'], mode: 'insensitive' } }));
      expect(prisma.prospecto).not.toHaveProperty('update');
    });

    it('RUT con K busca también la k minúscula histórica, y un DV inválido no se normaliza como válido', async () => {
      const { prisma, service } = searchFixture();
      await service.search(admin, { q: '12345670-k' });
      expect(JSON.stringify(prisma.prospecto.findMany.mock.calls[0][0].where)).toContain('"12345670-k"');
      await service.search(admin, { q: '12345678-9' });
      expect(JSON.stringify(prisma.prospecto.findMany.mock.calls[1][0].where)).not.toContain('"rut":{"in"');
    });

    it('filtra por estado Perdido solo en listado y total, no en los contadores', async () => {
      const { prisma, service } = searchFixture();
      await service.search(admin, { estado: 'Perdido', origen: 'Referido', motivoPerdida: 'Precio elevado' });
      expect(JSON.stringify(prisma.prospecto.findMany.mock.calls[0][0].where)).toContain('"estadoPipeline":"Perdido"');
      expect(JSON.stringify(prisma.prospecto.groupBy.mock.calls[0][0].where)).not.toContain('"estadoPipeline":"Perdido"');
      expect(JSON.stringify(prisma.prospecto.groupBy.mock.calls[0][0].where)).toContain('"origenContacto":"Referido"');
    });

    it('un usuario comercial queda limitado a su empresa aunque pida otro scope', async () => {
      const { prisma, service } = searchFixture();
      await service.search({ ...admin, roles: ['Comercial'], idEmpresa: 1 }, { scope: '2' });
      const where = prisma.prospecto.findMany.mock.calls[0][0].where;
      expect(where.OR[0].AND).toEqual(expect.arrayContaining([{ AND: [{ idEmpresa: 1 }] }]));
      // Exclientes: same company scope and only that company's former customers.
      expect(where.OR[1].AND[0]).toEqual({ idEmpresa: 1 });
      expect(JSON.stringify(where.OR[1])).not.toContain('"idEmpresa":2');
      expect(prisma.empresa.findMany).not.toHaveBeenCalled();
    });

    const formerRow = { idProspecto: 410, idEmpresa: 1, idCliente: 33, estadoPipeline: 'Servicio Activo', clasificacionComercial: 'PROSPECTO',
      contratos: [{ idContrato: 20, estado: 'Baja' }], cotizaciones: [], _count: {} };
    const invoice = (monto: number, pagado: number) => ({ monto, estado: 'Vencida', fechaLimitePago: new Date('2026-01-10'), pagos: pagado ? [{ monto: pagado }] : [], prorrogasPago: [] });

    it('suma a los excliente de la empresa con etiqueta de deuda calculada y sin revisión comercial', async () => {
      const { prisma, service } = searchFixture([formerRow], 1, [], { formerCount: 1, former: true, invoices: [invoice(20000, 5000)] });
      const result = await service.search(admin, { scope: '1' });
      expect(result.items[0]).toMatchObject({ idProspecto: 410, estadoPipeline: 'Servicio Activo', requiereRevisionComercial: false,
        excliente: { etiqueta: 'Excliente con deuda pendiente', situacionFinanciera: 'CON_DEUDA' } });
      expect(result.counts).toMatchObject({ Excliente: 1 });
      expect(JSON.stringify(prisma.cliente.count.mock.calls[0][0].where)).toContain('"estadoOperativo":"Baja"');
      expect(prisma.factura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { contrato: { idCliente: 33, idEmpresa: 1 } } }));
    });

    it.each([
      ['sin deuda', [invoice(20000, 20000)], 'Excliente sin deuda'],
      ['sin facturas', [], 'Excliente sin deuda'],
      ['monto desconocido', [{ ...invoice(0, 0), monto: null }], 'Excliente con saldo por revisar'],
    ])('etiqueta %s', async (_name, invoices, etiqueta) => {
      const { service } = searchFixture([formerRow], 1, [], { former: true, invoices });
      expect((await service.search(admin, { scope: '1' })).items[0].excliente).toMatchObject({ etiqueta });
    });

    it('si recontrató en la empresa deja de ser excliente sin escribir nada', async () => {
      const { service } = searchFixture([formerRow], 1, [], { former: false });
      const item = (await service.search(admin, { scope: '1' })).items[0];
      expect(item).not.toHaveProperty('excliente');
    });

    it('el filtro Excliente lista solo exclientes y la vista consolidada considera todas las empresas', async () => {
      const { prisma, service } = searchFixture();
      await service.search(admin, { estado: 'Excliente' });
      const where = prisma.prospecto.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('OR');
      expect(JSON.stringify(where)).toContain('"idCliente":{"not":null}');
      expect(JSON.stringify(where)).not.toContain('"estadoPipeline":"Excliente"');
      expect(prisma.empresa.findMany).toHaveBeenCalled();
    });

    it('rechaza fechas de filtro inválidas', async () => {
      const { service } = searchFixture();
      await expect(service.search(admin, { desde: '2026-13-45' })).rejects.toThrow('Fecha de filtro inválida');
    });
  });

  it('la reactivación conserva en auditoría el motivo, observación, fecha y autor de la pérdida', async () => {
    const fechaPerdida = new Date('2026-10-01T10:00:00Z');
    const { service, audit } = manualFixture({
      estadoPipeline: 'Perdido', motivoPerdida: 'Precio elevado', observacionPerdida: 'Dijo que muy caro', fechaPerdida, idUsuarioPerdida: 7,
    });
    await service.updatePipeline(10, { estadoPipeline: 'Prospecto Nuevo' }, admin);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'REACTIVAR_PROSPECTO',
      valorAnterior: expect.objectContaining({ motivoPerdida: 'Precio elevado', observacionPerdida: 'Dijo que muy caro', fechaPerdida, idUsuarioPerdida: 7 }),
    }));
  });

  it('no reactiva un Perdido con relaciones comerciales vigentes', async () => {
    const { service, prisma, audit } = manualFixture({ estadoPipeline: 'Perdido' }, { idContrato: 9, estado: 'Pendiente firma contrato' });
    await expect(service.updatePipeline(10, { estadoPipeline: 'Prospecto Nuevo' }, admin)).rejects.toThrow('relaciones comerciales');
    expect(prisma.prospecto.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      $queryRaw: jest.fn().mockResolvedValue([{ id_prospecto: 20 }]),
      factura: { findMany: jest.fn().mockResolvedValue([]) },
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
      { registerWithDigitalContract: async (_actor: unknown, register: (tx: typeof transaction) => Promise<{ result: unknown }>) =>
        (await prisma.$transaction(register)).result } as never,
    );

    Object.assign(prospect, { latitud: -33.475, longitud: -70.675 });
    Object.assign(transaction.prospecto, { findUniqueOrThrow: jest.fn().mockResolvedValue(prospect) });
    Object.assign(transaction, { plan: prisma.plan, cotizacion: prisma.cotizacion });
    Object.assign(service['coverageService'], { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 8 }] }) });
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
      {} as never,
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
      idCliente: null,
    };
    const prisma = {
      contrato: { findFirst: jest.fn().mockResolvedValue(null) },
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
