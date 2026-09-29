import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExternalTaxDocumentsService } from './external-tax-documents.service';

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
  const untouched = {
    facturaCreate: jest.fn(), pagoCreate: jest.fn(), cargoUpdate: jest.fn(), convenioUpdate: jest.fn(),
    prorrogaUpdate: jest.fn(), statusCalculate: jest.fn(), serviceUpdate: jest.fn(), workOrderCreate: jest.fn(),
  };
  const prisma = {
    empresa: { findUnique: jest.fn(({ where }) => Promise.resolve([1, 2].includes(where.idEmpresa) ? { idEmpresa: where.idEmpresa } : null)) },
    cliente: { findUnique: jest.fn().mockResolvedValue(null) },
    contrato: { findUnique: jest.fn().mockResolvedValue(null) },
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
        const row = rows.find((item) => item.idDocumento === where.idDocumento);
        if (!row) return Promise.resolve(null);
        Object.assign(row, data, { fechaActualizacion: new Date() });
        return Promise.resolve(row);
      }),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ExternalTaxDocumentsService(prisma as never, audit as never);
  return { service, prisma, audit, rows, untouched };
}

describe('Etapa 5 - documentos tributarios externos CU-86', () => {
  it('crea una boleta válida, manual y auditable', async () => {
    const { service, audit } = setup();
    const result = await service.create(baseDto, admin);
    expect(result).toMatchObject({ tipoDocumento: 'BOLETA', folioONumero: 'B-100', fuente: 'EXTERNO_MANUAL', estado: 'REGISTRADO' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'CREAR_DOCUMENTO_TRIBUTARIO_EXTERNO' }));
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
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'INTENTO_DOCUMENTO_TRIBUTARIO_DUPLICADO' }));
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
    await expect(service.create({ ...baseDto, idCliente: 10 }, admin)).rejects.toThrow('cliente pertenece a otra empresa');
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
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'VINCULAR_DOCUMENTO_FACTURA' }));
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
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ACTUALIZAR_DOCUMENTO_TRIBUTARIO_EXTERNO', valorAnterior: expect.any(Object), valorNuevo: expect.any(Object) }));
  });

  it('anula sin borrar físicamente y audita', async () => {
    const { service, rows, audit } = setup();
    const created = await service.create(baseDto, admin);
    await expect(service.deactivate(created.idDocumento, admin)).resolves.toMatchObject({ estado: 'ANULADO' });
    expect(rows).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'DESACTIVAR_DOCUMENTO_TRIBUTARIO_EXTERNO' }));
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
});
