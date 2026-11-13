import { BadRequestException, ConflictException, GoneException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from '../customers/customers.service';
import { rutLookupVariants } from '../rut/rut.util';
import { ticketStateCompatibility } from './ticket-ownership';
import { TICKET_ATTENTION_NAMES, ticketAttentionCatalog } from './ticket-attention-categories';
import { TicketsService } from './tickets.service';

const operator = { idUsuario: 7, idEmpresa: 2, email: null, nombreCompleto: 'QA', roles: ['Soporte'] };
const admin = { ...operator, roles: ['Administrador'] };
const request = { rut: '11111111-1', idCategoria: 1, idServicio: 20, prioridad: 'Media' as const, descripcion: 'QA sintetico' };

function setup(estado = 'Abierto') {
  const customer = { idCliente: 5, idEmpresa: 1, estado: 'Moroso', rut: '111111111',
    contratos: [{ idEmpresa: 2 }], servicios: [{ idEmpresa: 2 }] };
  const ticket = { idTicket: 10, idCliente: 5, idEmpresa: 2, idCategoria: 1,
    estado, origen: 'CRM', descripcion: 'Reporte QA', fechaCierre: null };
  const prisma = {
    cliente: { findMany: jest.fn().mockResolvedValue([customer]), findUnique: jest.fn().mockResolvedValue(customer), update: jest.fn() },
    contrato: { findFirst: jest.fn(), update: jest.fn() },
    servicioContratado: { findUnique: jest.fn().mockResolvedValue({ idServicio: 20, idCliente: 5, idEmpresa: 2, idContrato: 30,
      contrato: { idContrato: 30, idCliente: 5, idEmpresa: 2 } }), update: jest.fn() },
    categoriaFalla: { findUnique: jest.fn().mockResolvedValue({ idCategoria: 1, nombre: 'Consulta general' }),
      findMany: jest.fn().mockResolvedValue([{ idCategoria: 1, nombre: 'Consulta general' }]) },
    ticket: { findUnique: jest.fn().mockResolvedValue(ticket), findMany: jest.fn().mockResolvedValue([ticket]),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ticket, ...data })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ idTicket: 10, ...data })) },
    ordenTrabajo: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  prisma.$queryRaw.mockImplementation(async () => {
    const rows = await prisma.categoriaFalla.findMany();
    const tipoDisponible = rows.some((row: any) => Object.prototype.hasOwnProperty.call(row, 'tipo'));
    return rows.map((row: any) => ({ ...row, tipoDisponible,
      tipo: tipoDisponible ? (Object.prototype.hasOwnProperty.call(row, 'tipo') ? row.tipo : 'INTERNA') : null }));
  });
  prisma.$transaction.mockImplementation(callback => callback(prisma));
  const audit = { record: jest.fn() };
  return { prisma, audit, ticket, customer, service: new TicketsService(prisma as never, audit as never),
    customers: new CustomersService(prisma as never, audit as never) };
}

describe('Compatibilidad G8/G3 sin sincronizacion implicita', () => {
  it('C2: crea con Consulta historica y conserva idCategoria real y SLA, sin reclasificar ni tocar G3', async () => {
    const { service, prisma } = setup();
    const historic = { idCategoria: 3, nombre: 'Consulta', slaHoras: 72 };
    prisma.categoriaFalla.findMany.mockResolvedValue([historic]);
    await expect(service.create({ ...request, idCategoria: 3 }, operator)).resolves.toMatchObject({ idCategoria: 3, idEmpresa: 2 });
    expect(historic).toEqual({ idCategoria: 3, nombre: 'Consulta', slaHoras: 72 });
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.update).not.toHaveBeenCalled();
  });
  // Lista independiente de la implementación: contrato de atención G8/G2,
  // Documento 0, Tabla 11.9 ratificada para este cambio (no prueba del proveedor real).
  const attentionNames = ['Falla de Internet', 'Falla de TV', 'Cambio de plan', 'Mudanza',
    'Facturación y cobro', 'Consulta general', 'Baja de servicio'];

  it('G8 conserva exactamente las siete categorías del contrato de atención G2/G8', () => {
    expect([...TICKET_ATTENTION_NAMES]).toEqual(attentionNames);
  });

  it('proyecta IDs y SLA reales sin modificar el catálogo ni ocultar categorías técnicas', async () => {
    const { service, prisma } = setup();
    const rows = [...attentionNames.map((name, index) => Object.freeze({ idCategoria: 803 + index * 17,
      nombre: index % 2 ? name.toUpperCase() : name.toLowerCase(), slaHoras: 6 + index })),
    Object.freeze({ idCategoria: 93, nombre: 'CAMBIO_CREDENCIALES_WIFI', slaHoras: 2 }),
    Object.freeze({ idCategoria: 94, nombre: 'FIBRA_CORTADA', slaHoras: 4 })];
    const before = JSON.stringify(rows);
    prisma.categoriaFalla.findMany.mockResolvedValue(rows);
    const catalog = await service.categories();
    expect(catalog.map(row => row.nombreAtencion).filter(Boolean)).toEqual(attentionNames);
    expect(catalog.map(({ nombreAtencion: _label, ...row }) => row)).toEqual(rows.map(row => ({ ...row, tipo: null, tipoDisponible: false })));
    expect(catalog[7].nombreAtencion).toBeNull();
    expect(JSON.stringify(rows)).toBe(before);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(attentionNames)('crea atención %s con el ID de la base, no por posición', async name => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 914, nombre: name.toUpperCase(), slaHoras: 9 }]);
    await expect(service.create({ ...request, idCategoria: 914 }, operator)).resolves.toMatchObject({ idCategoria: 914, idEmpresa: 2 });
    expect(prisma.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idCategoria: 914 }) }));
    // La auditoría se escribe dentro de la misma transacción que el ticket (segundo argumento).
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ valorNuevo: expect.objectContaining({ categoria: name.toUpperCase() }) }), prisma);
  });

  it.each(['FIBRA_CORTADA', 'CAMBIO_CREDENCIALES_WIFI', 'Facturacion y cobro', 'Consulta QA'])
  ('rechaza alta comercial con categoría técnica o no oficial %s sin escritura', async nombre => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 1, nombre }]);
    await expect(service.create(request, operator)).rejects.toThrow('categoría oficial');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('no inventa IDs ausentes ni escoge entre nombres ambiguos por capitalización', async () => {
    const { service, prisma } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 600, nombre: 'Consulta general' },
      { idCategoria: 601, nombre: 'CONSULTA GENERAL' }]);
    expect((await service.categories()).every(category => category.nombreAtencion === null)).toBe(true);
    await expect(service.create({ ...request, idCategoria: 600 }, operator)).rejects.toThrow('categoría oficial');
    await expect(service.create(request, operator)).rejects.toThrow('Categoria seleccionada invalida');
    expect(ticketAttentionCatalog([])).toEqual([]);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('histórico técnico sigue legible por su ID y nombre aunque no admita alta comercial', async () => {
    const { service, prisma } = setup('DERIVADO_OT');
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 1, nombre: 'FIBRA_CORTADA', slaHoras: 4 }]);
    const listed = await service.list(operator);
    expect(listed[0]).toMatchObject({ idCategoria: 1, categoria: { idCategoria: 1, nombre: 'FIBRA_CORTADA', slaHoras: 4 }, soloLecturaTecnica: true });
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('catálogo global clasificado ofrece ATENCION y conserva TECNICA e INTERNA para históricos', async () => {
    const { service, prisma } = setup();
    const rows = [...attentionNames.map((nombre, i) => ({ idCategoria: 430 + i * 23,
      nombre: nombre.toUpperCase(), tipo: 'ATENCION', slaHoras: 12 })),
    { idCategoria: 731, nombre: 'FIBRA_CORTADA', tipo: 'TECNICA', slaHoras: 4 },
    { idCategoria: 915, nombre: 'CAMBIO_CREDENCIALES_WIFI', tipo: 'INTERNA', slaHoras: 3 },
    { idCategoria: 999, nombre: 'Asistente virtual', tipo: 'INTERNA', slaHoras: 8 }];
    prisma.categoriaFalla.findMany.mockResolvedValue(rows);
    const catalog = await service.categories();
    expect(catalog.filter(row => row.nombreAtencion).map(row => row.nombreAtencion)).toEqual(attentionNames);
    expect(catalog).toEqual(rows.map((row, i) => ({ ...row, tipoDisponible: true, nombreAtencion: attentionNames[i] ?? null })));
    expect(prisma.$queryRaw.mock.calls[0][0].join('')).toContain("to_jsonb(c)->>'tipo'");
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it.each(['TECNICA', 'INTERNA', 'DESCONOCIDA', 'atencion', null])
  ('tipo %s no se convierte en ATENCION por el nombre ni habilita altas comerciales', async tipo => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 1, nombre: 'Consulta general', tipo }]);
    expect((await service.categories())[0]).toMatchObject({ tipo, tipoDisponible: true, nombreAtencion: null });
    await expect(service.create(request, operator)).rejects.toThrow('categoría oficial');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('fallo de lectura no se interpreta como ausencia de tipo ni permite creación', async () => {
    const { service, prisma, audit } = setup();
    prisma.$queryRaw.mockRejectedValue(new Error('QA catalog unavailable'));
    await expect(service.create(request, operator)).rejects.toThrow('QA catalog unavailable');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('ATENCION con nombre ajeno o reservado no se ofrece por su tipo solamente', async () => {
    const { service, prisma } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue(['Consulta inventada', 'CAMBIO_CREDENCIALES_WIFI', 'Asistente virtual']
      .map((nombre, i) => ({ idCategoria: 400 + i, nombre, tipo: 'ATENCION' })));
    expect((await service.categories()).every(row => row.nombreAtencion === null)).toBe(true);
  });

  it.each(['TECNICA', 'ATENCION'])('clasificación manual admite %s sin convertirla en alta comercial', async tipo => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 811, nombre: 'Falla de Internet', tipo }]);
    await expect(service.updateCategory(10, { idCategoria: 811 }, operator)).resolves.toMatchObject({ idCategoria: 811 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CLASIFICAR_TICKET' }), prisma);
  });

  it.each(['INTERNA', 'DESCONOCIDA', null])('clasificación manual no admite tipo %s ni modifica el ticket', async tipo => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 811, nombre: 'Uso reservado', tipo }]);
    await expect(service.updateCategory(10, { idCategoria: 811 }, operator)).rejects.toThrow('clasificación manual');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['CAMBIO_CREDENCIALES_WIFI', 'Asistente virtual'])('base sin tipo no ofrece %s para reclasificación manual', async nombre => {
    const { service, prisma, audit } = setup();
    prisma.categoriaFalla.findMany.mockResolvedValue([{ idCategoria: 811, nombre }]);
    await expect(service.updateCategory(10, { idCategoria: 811 }, operator)).rejects.toThrow('clasificación manual');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('consulta grafias validadas sin modificar la normalizacion ni aceptar RUT invalido', () => {
    expect(rutLookupVariants('11.111.111-1')).toEqual(['11111111-1', '111111111', '11.111.111-1', '11.111.1111']);
    expect(rutLookupVariants('12345670k')).toEqual(expect.arrayContaining(['12345670-K', '12345670K', '12.345.670-k']));
    expect(rutLookupVariants('11111111-2')).toEqual([]);
  });

  it('conserva estado original, distingue DERIVADO_OT de Escalado y falla cerrado ante desconocidos', () => {
    expect(ticketStateCompatibility('DERIVADO_OT')).toEqual({ vocabularioEstado: 'G3', estadoPresentacion: 'Derivado a OT', soloLecturaTecnica: true });
    expect(ticketStateCompatibility('Escalado')).toMatchObject({ vocabularioEstado: 'G8', soloLecturaTecnica: false });
    expect(ticketStateCompatibility('NUEVO_ESTADO')).toMatchObject({ vocabularioEstado: 'DESCONOCIDO', soloLecturaTecnica: true });
    expect(ticketStateCompatibility('Abierto')).not.toHaveProperty('propietario');
  });

  it('lista la fila compartida existente sin duplicarla, conserva empresa y estado G3', async () => {
    const { service, prisma, ticket } = setup('EN_PROGRESO');
    const before = JSON.stringify(ticket);
    const result = await service.list(operator);
    expect(result[0]).toMatchObject({ idTicket: 10, idEmpresa: 2, estado: 'EN_PROGRESO',
      vocabularioEstado: 'G3', estadoPresentacion: 'En progreso', soloLecturaTecnica: true });
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 2 } }));
    expect(JSON.stringify(ticket)).toBe(before);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('bloquea todas las escrituras G8 sobre estados G3 incluso origen CRM y administrador', async () => {
    for (const state of ['ABIERTO', 'EN_PROGRESO', 'DERIVADO_OT', 'RESUELTO', 'DESCONOCIDO']) {
      const { service, prisma, audit } = setup(state);
      for (const user of [operator, admin]) {
        for (const action of [
          () => service.updateCategory(10, { idCategoria: 1 }, user),
          () => service.updatePriority(10, { prioridad: 'Alta' }, user),
          () => service.updateStatus(10, { estado: 'Resuelto' }, user),
          () => service.addTechnicalNote(10, { observacion: 'QA' }, user),
          () => service.registerDiagnosis(10, {} as never, user),
        ]) await expect(action()).rejects.toBeInstanceOf(ConflictException);
      }
      expect(prisma.ticket.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    }
  });

  it('autoriza empresa antes de revelar restricciones del ticket tecnico', async () => {
    const { service, prisma } = setup('RESUELTO');
    await expect(service.updateStatus(10, { estado: 'Abierto' }, { ...operator, idEmpresa: 1 }))
      .rejects.toThrow('El ticket no pertenece a tu empresa');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('mantiene soporte para cliente compartido moroso y RUT compacto sin activar ni fusionar identidades', async () => {
    const { service, prisma } = setup();
    await expect(service.create(request, operator)).resolves.toMatchObject({ idCliente: 5, idEmpresa: 2, estado: 'Abierto' });
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      rut: { in: rutLookupVariants(request.rut), mode: 'insensitive' },
      OR: [{ idEmpresa: 2 }, { contratos: { some: { idEmpresa: 2 } } }, { servicios: { some: { idEmpresa: 2 } } }],
    }, take: 2 }));
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.contrato.update).not.toHaveBeenCalled();
    expect(prisma.servicioContratado.update).not.toHaveBeenCalled();
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
  });

  it('identidad ambigua o RUT invalido no crea ticket ni toma el primer registro', async () => {
    const { service, prisma, customer } = setup();
    prisma.cliente.findMany.mockResolvedValue([customer, { ...customer, idCliente: 6, rut: '11111111-1' }]);
    await expect(service.create(request, operator)).rejects.toBeInstanceOf(ConflictException);
    prisma.cliente.findMany.mockClear();
    await expect(service.create({ ...request, rut: '11111111-2' }, operator)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.cliente.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('coincidencia RUT no autoriza otra empresa ni un servicio ajeno', async () => {
    const { service, prisma, customer } = setup();
    customer.contratos = []; customer.servicios = [];
    await expect(service.create(request, operator)).rejects.toThrow('El cliente no pertenece a tu empresa');
    customer.contratos = [{ idEmpresa: 2 }];
    prisma.servicioContratado.findUnique.mockResolvedValue({ idServicio: 20, idCliente: 5, idEmpresa: 1 } as never);
    await expect(service.create(request, operator)).rejects.toThrow('El servicio contratado no pertenece a tu empresa');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('detecta duplicados historicos con puntos y K sin escoger ni reescribir identidades', async () => {
    const { service, customers, prisma, customer } = setup();
    const historical = [
      { ...customer, rut: '12.345.670-k' },
      { ...customer, idCliente: 6, rut: '12345670K' },
    ];
    const before = JSON.stringify(historical);
    prisma.cliente.findMany.mockImplementation(async ({ where }: any) => {
      const values = (where.rut ?? where.AND[0].rut).in.map((value: string) => value.toUpperCase());
      return historical.filter(row => values.includes(row.rut.toUpperCase()));
    });
    await expect(service.create({ ...request, rut: '12345670-K' }, operator)).rejects.toBeInstanceOf(ConflictException);
    await expect(customers.findByRutOrContract('12.345.670-K', operator)).rejects.toThrow('La identidad requiere revision comercial');
    expect(JSON.stringify(historical)).toBe(before);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(prisma.cliente.update).not.toHaveBeenCalled();
    expect(prisma.contrato.update).not.toHaveBeenCalled();
  });

  it('conserva consultas autorizadas de RUT compacto, detecta ambiguedad y oculta datos globales', async () => {
    const { customers, prisma, customer } = setup();
    await expect(customers.findByRutOrContract('11.111.111-1', operator)).resolves.toMatchObject({
      idCliente: 5, idEmpresa: null, estado: null, estadoGlobalDisponible: false, datosTecnicos: null,
    });
    expect(prisma.cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { rut: { in: rutLookupVariants(request.rut), mode: 'insensitive' } },
      { OR: [{ idEmpresa: 2 }, { contratos: { some: { idEmpresa: 2 } } }] },
    ] } }));
    prisma.cliente.findMany.mockResolvedValue([customer, { ...customer, idCliente: 6 }]);
    await expect(customers.findByRutOrContract('111111111', admin)).rejects.toThrow('La identidad requiere revision comercial');
    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('conserva precedencia de contrato numerico autorizado aunque tenga formato de RUT compacto', async () => {
    const { customers, prisma } = setup();
    prisma.contrato.findFirst.mockResolvedValue({ idContrato: 111111111, idCliente: 5 });
    await expect(customers.findByRutOrContract('111111111', operator)).resolves.toMatchObject({ idCliente: 5 });
    expect(prisma.contrato.findFirst).toHaveBeenCalledWith({ where: { idContrato: 111111111, idEmpresa: 2 } });
    expect(prisma.cliente.findMany).not.toHaveBeenCalled();
  });

  it('revalida estado y empresa al escribir y no audita exito tras conflicto concurrente', async () => {
    const { service, prisma, audit } = setup('En progreso');
    prisma.ticket.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('QA concurrent update', {
      code: 'P2025', clientVersion: '5.22.0',
    }));
    await expect(service.updatePriority(10, { prioridad: 'Alta' }, operator)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { idTicket: 10, idEmpresa: 2, estado: 'En progreso' }, data: { prioridad: 'Alta' } });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('no anuncia una OT ni deriva automaticamente el mismo ticket compartido', async () => {
    const { service, prisma } = setup('DERIVADO_OT');
    await expect(service.createWorkOrder(10, {} as never, operator)).rejects.toBeInstanceOf(GoneException);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
    expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
  });
});
