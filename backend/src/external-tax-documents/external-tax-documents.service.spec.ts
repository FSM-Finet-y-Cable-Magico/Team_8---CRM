import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExternalTaxDocumentsService } from './external-tax-documents.service';
import { AuditService } from '../audit/audit.service';

const admin = { idUsuario: 1, idEmpresa: 1, email: null, nombreCompleto: 'Admin', roles: ['Administrador'] };
const adminCompany2 = { ...admin, idUsuario: 3, idEmpresa: 2 };
const commercial = { idUsuario: 2, idEmpresa: 1, email: null, nombreCompleto: 'Comercial', roles: ['Comercial'] };
const baseDto = {
  idEmpresa: 1,
  tipoDocumento: 'BOLETA',
  folioONumero: ' B-100 ',
  emisorProveedor: ' Proveedor Demo ',
  fechaEmision: '2026-09-27',
  montoNeto: 8403.36,
  montoExento: 0,
  iva: 1596.64,
  montoTotal: 10000,
  urlDocumento: 'https://docs.example.test/documento.pdf?token=secret',
  referenciaExterna: 'Carpeta externa',
};

function setup() {
  const rows: any[] = [];
  const persistedAudits: any[] = [];
  const untouched = {
    facturaCreate: jest.fn(), pagoCreate: jest.fn(), cargoUpdate: jest.fn(), convenioUpdate: jest.fn(),
    prorrogaUpdate: jest.fn(), statusCalculate: jest.fn(), serviceUpdate: jest.fn(), workOrderCreate: jest.fn(),
  };
  const prisma = {
    empresa: { findUnique: jest.fn(({ where }) => Promise.resolve([1, 2].includes(where.idEmpresa) ? { idEmpresa: where.idEmpresa } : null)) },
    cliente: { findUnique: jest.fn().mockResolvedValue(null) },
    contrato: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    factura: { findUnique: jest.fn().mockResolvedValue(null), create: untouched.facturaCreate },
    pago: { create: untouched.pagoCreate },
    cargoAdicional: { findUnique: jest.fn().mockResolvedValue(null), update: untouched.cargoUpdate },
    convenioPago: { update: untouched.convenioUpdate },
    prorrogaPago: { update: untouched.prorrogaUpdate },
    servicioContratado: { update: untouched.serviceUpdate },
    ordenTrabajo: { create: untouched.workOrderCreate },
    documentoTributarioExterno: {
      findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((row) =>
        row.idEmpresa === where.idEmpresa && row.tipoDocumento === where.tipoDocumento
        && row.emisorNormalizado === where.emisorNormalizado && row.folioNormalizado === where.folioNormalizado
        && (!where.idDocumento?.not || row.idDocumento !== where.idDocumento.not)) ?? null)),
      findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((row) => row.idDocumento === where.idDocumento) ?? null)),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(rows)),
      count: jest.fn().mockImplementation(() => Promise.resolve(rows.length)),
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { idDocumento: rows.length + 1, fechaRegistro: new Date(), fechaActualizacion: new Date(), ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const index = rows.findIndex((item) => item.idDocumento === where.idDocumento);
        if (index < 0) return Promise.resolve(null);
        const updated = { ...rows[index], ...data, fechaActualizacion: new Date() };
        rows[index] = updated;
        return Promise.resolve(updated);
      }),
    },
    logAuditoria: { create: jest.fn(({ data }) => { persistedAudits.push(data); return Promise.resolve(data); }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (operations) => {
    if (typeof operations !== 'function') return Promise.all(operations);
    const before = rows.map(row => ({ ...row }));
    const auditsBefore = [...persistedAudits];
    try { return await operations(prisma); }
    catch (error) {
      rows.splice(0, rows.length, ...before);
      persistedAudits.splice(0, persistedAudits.length, ...auditsBefore);
      throw error;
    }
  });
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ExternalTaxDocumentsService(prisma as never, audit as never);
  return { service, prisma, audit, rows, untouched, persistedAudits };
}

describe('Etapa 5 - documentos tributarios externos CU-86', () => {
  it('crea una boleta válida, manual y auditable', async () => {
    const { service, audit } = setup();
    const result = await service.create(baseDto, admin);
    expect(result).toMatchObject({ tipoDocumento: 'BOLETA', folioONumero: 'B-100', fuente: 'EXTERNO_MANUAL', estado: 'REGISTRADO' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_DOCUMENTO_TRIBUTARIO_EXTERNO' }), expect.any(Object));
    expect(audit.record.mock.calls[0][0].valorNuevo.urlDocumento).toBe('https://docs.example.test/documento.pdf');
  });

  it('crea una factura válida', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, tipoDocumento: 'FACTURA', folioONumero: 'F-1' }, admin)).resolves.toMatchObject({ tipoDocumento: 'FACTURA' });
  });

  it('normaliza espacios y mayúsculas sin perder el valor visible limpio', async () => {
    const { service } = setup();
    const result = await service.create({ ...baseDto, folioONumero: ' ab  10 ', emisorProveedor: ' proveedor  sur ' }, admin);
    expect(result).toMatchObject({ folioONumero: 'ab 10', folioNormalizado: 'AB 10', emisorProveedor: 'proveedor sur', emisorNormalizado: 'PROVEEDOR SUR' });
  });

  it('rechaza folio vacío aunque el DTO no haya pasado por el pipe', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, folioONumero: '   ' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza fecha comercial inválida', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, fechaEmision: '2026-02-30' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza monto total negativo en la defensa de servicio', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, montoNeto: undefined, montoExento: undefined, iva: undefined, montoTotal: -1 }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza componentes que superan el total', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, montoNeto: 9000, montoExento: undefined, iva: 2000, montoTotal: 10000 }, admin)).rejects.toThrow('no pueden superar');
  });

  it('rechaza componentes completos incoherentes', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, montoNeto: 8000, montoExento: 0, iva: 1000, montoTotal: 10000 }, admin)).rejects.toThrow('deben coincidir');
  });

  it('persiste dinero con Decimal y dos decimales', async () => {
    const { service } = setup();
    const result = await service.create(baseDto, admin);
    expect(result.montoTotal).toBeInstanceOf(Prisma.Decimal);
    expect(result.montoTotal.toFixed(2)).toBe('10000.00');
  });

  it('bloquea duplicado normalizado en la misma empresa y lo audita', async () => {
    const { service, audit } = setup();
    await service.create(baseDto, admin);
    await expect(service.create({ ...baseDto, folioONumero: 'b-100', emisorProveedor: 'PROVEEDOR DEMO' }, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'INTENTO_DOCUMENTO_TRIBUTARIO_DUPLICADO' }), expect.any(Object));
  });

  it('permite el mismo folio y emisor en otra empresa', async () => {
    const { service } = setup();
    await service.create(baseDto, admin);
    await expect(service.create({ ...baseDto, idEmpresa: 2 }, adminCompany2)).resolves.toMatchObject({ idEmpresa: 2 });
  });

  it('rechaza empresa inexistente', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, idEmpresa: 99 }, { ...admin, idEmpresa: 99 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza cliente inexistente', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, idCliente: 10 }, admin)).rejects.toThrow('Cliente no encontrado');
  });

  it('rechaza cliente de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 2 });
    await expect(service.create({ ...baseDto, idCliente: 10 }, admin)).rejects.toThrow('cliente no tiene contrato en esta empresa');
  });

  it('acepta documento de cliente compartido respaldado por contrato propio', async () => {
    const { service, prisma, rows } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 2 });
    prisma.contrato.findUnique.mockResolvedValue({ idContrato: 20, idEmpresa: 1, idCliente: 10 });
    await expect(service.create({ ...baseDto, idCliente: 10, idContrato: 20 }, admin)).resolves.toMatchObject({ idEmpresa: 1, idCliente: 10 });
    expect(rows).toHaveLength(1);
    expect(prisma.cliente).not.toHaveProperty('update');
  });

  it('sin referencia explícita exige relación contractual en la empresa del documento', async () => {
    const { service, prisma } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 2 });
    prisma.contrato.findFirst.mockResolvedValue({ idContrato: 20 });
    await expect(service.create({ ...baseDto, idCliente: 10 }, admin)).resolves.toMatchObject({ idEmpresa: 1 });
    expect(prisma.contrato.findFirst).toHaveBeenCalledWith({ where: { idCliente: 10, idEmpresa: 1 }, select: { idContrato: true } });
  });

  it('una factura propia no autoriza vincular un cliente distinto', async () => {
    const { service, prisma, rows } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 2 });
    prisma.factura.findUnique.mockResolvedValue({ idFactura: 30, idContrato: 20, contrato: { idEmpresa: 1, idCliente: 99 } });
    await expect(service.create({ ...baseDto, idCliente: 10, idFactura: 30 }, admin)).rejects.toThrow('no corresponde al cliente');
    expect(rows).toHaveLength(0);
  });

  it('rechaza contrato de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.contrato.findUnique.mockResolvedValue({ idContrato: 20, idEmpresa: 2, idCliente: 10 });
    await expect(service.create({ ...baseDto, idContrato: 20 }, admin)).rejects.toThrow('contrato pertenece a otra empresa');
  });

  it('rechaza contrato que no corresponde al cliente', async () => {
    const { service, prisma } = setup();
    prisma.cliente.findUnique.mockResolvedValue({ idCliente: 10, idEmpresa: 1 });
    prisma.contrato.findUnique.mockResolvedValue({ idContrato: 20, idEmpresa: 1, idCliente: 11 });
    await expect(service.create({ ...baseDto, idCliente: 10, idContrato: 20 }, admin)).rejects.toThrow('no corresponde al cliente');
  });

  it('rechaza factura de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.factura.findUnique.mockResolvedValue({ idFactura: 30, idContrato: 20, contrato: { idEmpresa: 2, idCliente: 10 } });
    await expect(service.create({ ...baseDto, idFactura: 30 }, admin)).rejects.toThrow('factura pertenece a otra empresa');
  });

  it('rechaza factura que no corresponde al contrato', async () => {
    const { service, prisma } = setup();
    prisma.contrato.findUnique.mockResolvedValue({ idContrato: 20, idEmpresa: 1, idCliente: 10 });
    prisma.factura.findUnique.mockResolvedValue({ idFactura: 30, idContrato: 21, contrato: { idEmpresa: 1, idCliente: 10 } });
    await expect(service.create({ ...baseDto, idContrato: 20, idFactura: 30 }, admin)).rejects.toThrow('no corresponde al contrato');
  });

  it('vincula explícitamente una factura y audita el vínculo', async () => {
    const { service, prisma, audit } = setup();
    prisma.factura.findUnique.mockResolvedValue({ idFactura: 30, idContrato: 20, contrato: { idEmpresa: 1, idCliente: 10 } });
    await service.create({ ...baseDto, idFactura: 30 }, admin);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'VINCULAR_DOCUMENTO_FACTURA' }), expect.any(Object));
  });

  it('rechaza cargo adicional de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.cargoAdicional.findUnique.mockResolvedValue({ idCargo: 40, idEmpresa: 2, idCliente: 10, idContrato: 20 });
    await expect(service.create({ ...baseDto, idCargoAdicional: 40 }, admin)).rejects.toThrow('cargo adicional pertenece a otra empresa');
  });

  it.each([
    ['https://example.test/document.pdf'],
    ['http://example.test/document.pdf'],
  ])('permite URL segura %s', async (urlDocumento) => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, urlDocumento }, admin)).resolves.toMatchObject({ urlDocumento: expect.stringMatching(/^https?:/) });
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/plain,secreto'])('rechaza esquema peligroso %s', async (urlDocumento) => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, urlDocumento }, admin)).rejects.toThrow('solo puede usar http o https');
  });

  it('rechaza credenciales embebidas en URL', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, urlDocumento: 'https://usuario:secreto@example.test/documento' }, admin)).rejects.toThrow('no puede incluir credenciales');
  });

  it('crea sin URL ni proveedor externo configurado', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, urlDocumento: undefined }, admin)).resolves.toMatchObject({ urlDocumento: null, fuente: 'EXTERNO_MANUAL' });
  });

  it('Administrador edita metadata y registra valores anterior/nuevo', async () => {
    const { service, audit } = setup();
    const created = await service.create(baseDto, admin);
    const updated = await service.update(created.idDocumento, { folioONumero: 'B-101' }, admin);
    expect(updated.folioNormalizado).toBe('B-101');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ACTUALIZAR_DOCUMENTO_TRIBUTARIO_EXTERNO', valorAnterior: expect.any(Object), valorNuevo: expect.any(Object) }), expect.any(Object));
  });

  it('anula sin borrar físicamente y audita', async () => {
    const { service, rows, audit } = setup();
    const created = await service.create(baseDto, admin);
    await expect(service.deactivate(created.idDocumento, admin)).resolves.toMatchObject({ estado: 'ANULADO' });
    expect(rows).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'DESACTIVAR_DOCUMENTO_TRIBUTARIO_EXTERNO' }), expect.any(Object));
  });

  it.each(['create', 'update', 'deactivate', 'findOne'] as const)('usuario sin permiso no puede ejecutar %s', async (operation) => {
    const { service } = setup();
    const call = operation === 'create' ? service.create(baseDto, commercial)
      : operation === 'update' ? service.update(1, { estado: 'ANULADO' }, commercial)
      : operation === 'deactivate' ? service.deactivate(1, commercial)
      : service.findOne(1, commercial);
    await expect(call).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('empresa cruzada no consulta para un usuario sin privilegio', async () => {
    const { service, rows } = setup();
    rows.push({ idDocumento: 1, idEmpresa: 2 });
    await expect(service.findOne(1, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lista con paginación obligatoria', async () => {
    const { service } = setup();
    const result = await service.list({ page: 2, pageSize: 10, idEmpresa: 1 }, admin);
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, totalRows: 0, totalPages: 1 });
  });

  it.each([
    ['tipoDocumento', 'FACTURA'], ['folio', 'F-1'], ['idCliente', 10], ['idContrato', 20],
    ['idFactura', 30], ['estado', 'REGISTRADO'], ['emisorProveedor', 'Proveedor'], ['search', '12.345'],
  ] as const)('aplica filtro %s', async (field, value) => {
    const { service, prisma } = setup();
    await service.list({ idEmpresa: 1, [field]: value }, admin);
    const where = prisma.documentoTributarioExterno.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(String(value));
  });

  it('aplica rango de fecha comercial', async () => {
    const { service, prisma } = setup();
    await service.list({ idEmpresa: 1, fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' }, admin);
    expect(prisma.documentoTributarioExterno.findMany.mock.calls[0][0].where.fechaEmision).toEqual({ gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T00:00:00.000Z') });
  });

  it('rechaza rango de fecha invertido', async () => {
    const { service } = setup();
    await expect(service.list({ fechaDesde: '2026-12-31', fechaHasta: '2026-01-01' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('consulta detalle y audita la consulta', async () => {
    const { service, audit } = setup();
    const created = await service.create(baseDto, admin);
    await service.findOne(created.idDocumento, admin);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CONSULTAR_DOCUMENTO_TRIBUTARIO_EXTERNO' }));
  });

  it('crear documento no escribe Factura, Pago, saldo, convenio, prórroga, cargo, servicio u OT', async () => {
    const { service, untouched } = setup();
    await service.create(baseDto, admin);
    Object.values(untouched).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('editar documento no escribe entidades financieras ni lifecycle', async () => {
    const { service, untouched } = setup();
    const created = await service.create(baseDto, admin);
    await service.update(created.idDocumento, { referenciaExterna: 'corregida' }, admin);
    Object.values(untouched).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('un documento sin cliente conserva una referencia externa sin crear identidad ni deuda', async () => {
    const { service, prisma, rows, untouched } = setup();
    await expect(service.create(baseDto, admin)).resolves.toMatchObject({ fuente: 'EXTERNO_MANUAL' });
    expect(rows[0].idCliente).toBeUndefined();
    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
    Object.values(untouched).forEach(spy => expect(spy).not.toHaveBeenCalled());
  });

  it('una referencia bancaria fuera del rango de ID se rechaza antes de consultar Factura', async () => {
    const { service, prisma, rows } = setup();
    await expect(service.create({ ...baseDto, idFactura: 987654321012 }, admin)).rejects.toThrow('no un folio ni una referencia bancaria');
    expect(prisma.factura.findUnique).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('una factura inexistente se informa como referencia CRM, sin guardar documento', async () => {
    const { service, rows } = setup();
    await expect(service.create({ ...baseDto, idFactura: 9876 }, admin)).rejects.toThrow('Factura CRM no encontrada');
    expect(rows).toHaveLength(0);
  });

  it('componentes opcionales null permanecen ausentes, sin convertirlos en cero', async () => {
    const { service } = setup();
    await expect(service.create({ ...baseDto, montoNeto: null, montoExento: null, iva: null } as never, admin)).resolves.toMatchObject({ montoNeto: null, montoExento: null, iva: null });
  });

  it('revierte el alta cuando AuditService real no puede persistir la auditoría', async () => {
    const { prisma, rows, persistedAudits } = setup();
    prisma.logAuditoria.create.mockRejectedValueOnce(new Error('AUDIT_FAILURE'));
    const service = new ExternalTaxDocumentsService(prisma as never, new AuditService(prisma as never));
    await expect(service.create(baseDto, admin)).rejects.toThrow('AUDIT_FAILURE');
    expect(rows).toHaveLength(0);
    expect(persistedAudits).toHaveLength(0);
  });

  it('revierte documento y primera auditoría si falla la auditoría de vínculo de factura', async () => {
    const { prisma, rows, persistedAudits } = setup();
    prisma.factura.findUnique.mockResolvedValue({ idFactura: 30, idContrato: 20, contrato: { idEmpresa: 1, idCliente: 10 } });
    const persist = prisma.logAuditoria.create.getMockImplementation()!;
    prisma.logAuditoria.create.mockImplementationOnce(persist).mockRejectedValueOnce(new Error('LINK_AUDIT_FAILURE'));
    const service = new ExternalTaxDocumentsService(prisma as never, new AuditService(prisma as never));
    await expect(service.create({ ...baseDto, idFactura: 30 }, admin)).rejects.toThrow('LINK_AUDIT_FAILURE');
    expect(rows).toHaveLength(0);
    expect(persistedAudits).toHaveLength(0);
  });

  it.each(['update', 'deactivate'] as const)('revierte %s si falla la auditoría y conserva documento anterior', async operation => {
    const { service, audit, rows, prisma } = setup();
    const current = await service.create(baseDto, admin);
    const before = { ...rows[0] };
    audit.record.mockRejectedValueOnce(new Error('AUDIT_FAILURE'));
    await expect(operation === 'update' ? service.update(current.idDocumento, { folioONumero: 'CORRECCION' }, admin) : service.deactivate(current.idDocumento, admin)).rejects.toThrow('AUDIT_FAILURE');
    expect(rows).toEqual([before]);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.any(Array), current.idDocumento, 1);
  });

  it('autoriza antes de bloquear una fila ajena y no ejecuta escrituras', async () => {
    const { service, prisma, rows } = setup();
    rows.push({ idDocumento: 1, idEmpresa: 2 });
    await expect(service.deactivate(1, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.documentoTributarioExterno.update).not.toHaveBeenCalled();
  });

  it('anular dos veces devuelve el estado confirmado sin una segunda escritura ni auditoría', async () => {
    const { service, prisma, audit } = setup();
    const current = await service.create(baseDto, admin);
    await service.deactivate(current.idDocumento, admin);
    const audits = audit.record.mock.calls.length;
    await expect(service.deactivate(current.idDocumento, admin)).resolves.toMatchObject({ estado: 'ANULADO' });
    expect(prisma.documentoTributarioExterno.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(audits);
  });

  it('la auditoría de duplicado es estricta y no modifica el documento existente', async () => {
    const { service, audit, rows } = setup();
    await service.create(baseDto, admin);
    audit.record.mockRejectedValueOnce(new Error('DUPLICATE_AUDIT_FAILURE'));
    await expect(service.create(baseDto, admin)).rejects.toThrow('DUPLICATE_AUDIT_FAILURE');
    expect(rows).toHaveLength(1);
  });

  it.each([
    new ConflictException('AUDIT_CONFLICT'),
    new Prisma.PrismaClientKnownRequestError('AUDIT_UNIQUE', { code: 'P2002', clientVersion: 'test', meta: { modelName: 'LogAuditoria', target: ['id_log'] } }),
  ])('no confunde un error de auditoría con documento duplicado', async error => {
    const { service, audit, rows } = setup();
    audit.record.mockRejectedValueOnce(error);
    await expect(service.create(baseDto, admin)).rejects.toBe(error);
    expect(rows).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0].accion).toBe('CREAR_DOCUMENTO_TRIBUTARIO_EXTERNO');
  });

  it('conflicto concurrente de la identidad compuesta devuelve 409 y registra intento', async () => {
    const { service, audit, prisma, rows } = setup();
    prisma.documentoTributarioExterno.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('DUPLICATE', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['id_empresa', 'tipo_documento', 'emisor_normalizado', 'folio_normalizado'] },
    }));
    await expect(service.create(baseDto, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'INTENTO_DOCUMENTO_TRIBUTARIO_DUPLICADO' }), expect.any(Object));
  });
});
