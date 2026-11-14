import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import ExcelJS from 'exceljs';

describe('ReportsService', () => {
  const admin: AuthUser = {
    idUsuario: 1,
    idEmpresa: 1,
    email: 'admin@finet.local',
    nombreCompleto: 'Administrador',
    roles: ['Administrador'],
  };

  it('exporta el libro completo y limita gestiones y pagos al período', async () => {
    const prisma = { empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 2, nombre: 'Empresa QA' }]) } };
    const book = {
      reportRows: jest.fn().mockResolvedValue([
        { idCliente: 8, nombre: 'Cliente QA', rut: '11111111-1', fechaVencimientoEfectiva: '2026-05-10', saldoPendiente: 18000 },
        { idCliente: 8, nombre: 'Cliente QA', rut: '11111111-1', fechaVencimientoEfectiva: '2026-04-10', saldoPendiente: null },
        { idCliente: 8, nombre: 'Cliente QA', rut: '11111111-1', fechaVencimientoEfectiva: null, saldoPendiente: null },
      ]),
      customerHistory: jest.fn().mockResolvedValue({ movements: [
        { tipo: 'CONTACTO_CLIENTE', fecha: '2026-05-15T12:00:00Z', detalle: 'Gestión del período' },
        { tipo: 'CONVENIO', fecha: '2026-04-15T12:00:00Z', detalle: 'Gestión anterior' },
      ], invoices: [{ idFactura: 9, idContrato: 3, pagos: [
        { idPago: 1, fecha: '2026-05-31T23:59:00Z', monto: 2000 },
        { idPago: 2, fecha: '2026-06-01T00:00:00Z', monto: 1000 },
      ] }] }),
    };
    const service = new ReportsService(prisma as never, { record: jest.fn() } as never, book as never);
    const result = await service.export('libro-control', 'xlsx', admin, '2', '2026-05-01', '2026-05-31');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Libro de control', 'Gestiones', 'Pagos']);
    expect(workbook.worksheets.map(sheet => sheet.rowCount)).toEqual([4, 2, 2]);
    expect(book.customerHistory).toHaveBeenCalledTimes(1);
    expect(book.customerHistory).toHaveBeenCalledWith(8, 2, admin);
    expect(book.reportRows.mock.calls[0][0]).toMatchObject({ idEmpresa: 2 });
    expect(workbook.worksheets[0].getRow(2).values).toContain(18000);
  });

  it('inventario incluye resumen actual, asignación, consumibles y movimientos filtrados, con fuente explícita', async () => {
    const prisma = {
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 2, nombre: 'Empresa QA' }]) },
      unidadEquipo: { findMany: jest.fn().mockResolvedValue([{ idUnidad: 7, idEmpresa: 2, idTipoEquipo: 3, numeroSerie: 'SERIE-QA', estado: 'Instalado en cliente', idClienteInstalado: 4, idServicio: 5, idBodegaActual: null }]) },
      tipoEquipo: { findMany: jest.fn().mockResolvedValue([{ idTipoEquipo: 3, nombre: 'ONT QA', categoria: 'ONT' }]) },
      bodega: { findMany: jest.fn().mockResolvedValue([{ idBodega: 9, idEmpresa: 2, nombre: 'Bodega QA' }]) },
      stockConsumible: { findMany: jest.fn().mockResolvedValue([{ idTipoEquipo: 3, idBodega: 9, cantidadDisponible: 2, umbralMinimo: 5 }]) },
      cliente: { findMany: jest.fn().mockResolvedValue([{ idCliente: 4, nombreCompleto: 'Cliente QA', rut: '11111111-1' }]) },
      movimientoInventario: { findMany: jest.fn().mockResolvedValue([{ idMovimiento: 99n, idEmpresaOrigen: 2, idEmpresaDestino: null, idTipoEquipo: 3, cantidad: 1, fecha: new Date('2026-05-15T12:00:00Z') }]) },
    };
    const service = new ReportsService(prisma as never, { record: jest.fn() } as never);
    const result = await service.export('inventario', 'csv', admin, '2', '2026-05-01', '2026-05-31');
    const csv = result.buffer.toString('utf8');
    expect(csv).toContain('Resumen inventario');
    expect(csv).toContain('SERIE-QA');
    expect(csv).toContain('Cliente QA');
    expect(csv).toContain('Consumibles');
    expect(csv).toContain('Movimientos inventario');
    expect(csv).toContain('pendiente consolidación con Inventario y Bodega');
    expect(csv.split('\n')[0]).toContain('Cantidad');
    expect(prisma.unidadEquipo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idEmpresa: 2 } }));
    expect(prisma.movimientoInventario.findMany.mock.calls[0][0].where).toEqual({ OR: [{ idEmpresaOrigen: 2 }, { idEmpresaDestino: 2 }], fecha: { gte: new Date('2026-05-01T00:00:00Z'), lte: new Date('2026-05-31T23:59:59.999Z') } });
  });

  it('CSV conserva columnas de todas las secciones y trata los textos como datos', async () => {
    const prisma = { empresa: { findMany: jest.fn().mockResolvedValue([]) }, cliente: { findMany: jest.fn().mockResolvedValue([{ idCliente: 1, nombreCompleto: '=1+1', rut: '11111111-1', contratos: [], servicios: [], direcciones: [] }]) } };
    const service = new ReportsService(prisma as never, { record: jest.fn() } as never);
    const result = await service.export('clientes', 'csv', admin);
    expect(result.buffer.toString('utf8')).toContain("'=1+1");
    await expect(service.export('clientes', 'pdf' as never, admin)).rejects.toThrow('Formato');
  });

  it('exporta todos los clientes del portal con plan y empresa aunque el periodo sea reciente', async () => {
    const prisma = {
      empresa: { findMany: jest.fn().mockResolvedValue([{ idEmpresa: 2, nombre: 'Cable Mágico' }]) },
      cliente: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ rut: `RUT-${i}`, nombreCompleto: `Cliente ${i}`, idEmpresa: 2, estado: 'Activo', contratos: [{ idEmpresa: 2, estado: 'Firmado', plan: { idEmpresa: 2, nombreComercial: 'Plan 600' } }], servicios: [{ tipoServicio: 'Internet', estadoOperativo: 'Activo' }], direcciones: [] }))) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ReportsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );

    const result = await service.export('clientes', 'csv', admin, '2', '2026-05-01', '2026-05-31');
    const csv = result.buffer.toString('utf8');
    expect(csv.split('\n')).toHaveLength(10);
    expect(csv).toContain('Cable Mágico');
    expect(csv).toContain('Plan 600');
    expect(csv).toContain('Estado servicio');
    expect(csv.split('\n')[0]).not.toMatch(/(^|,)id(,|$)/i);
    expect(prisma.cliente.findMany.mock.calls[0][0].where).toEqual({ OR: [{ idEmpresa: 2 }, { contratos: { some: { idEmpresa: 2 } } }] });
    expect(prisma.cliente.findMany.mock.calls[0][0].include.contratos.where).toEqual({ idEmpresa: 2 });
  });

  it('rechaza un periodo invertido', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2026-07-01', '2026-06-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza periodos anteriores al limite operacional', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('tickets', 'xlsx', admin, 'consolidado', '1700-01-01', '1800-12-31'),
    ).rejects.toThrow('no puede ser anterior a 2000-01-01');
  });

  it('rechaza periodos futuros', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2999-01-01', '2999-01-31'),
    ).rejects.toThrow('no puede incluir fechas futuras');
  });

  it('rechaza fechas calendario inexistentes', async () => {
    const service = new ReportsService(
      {} as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.export('clientes', 'csv', admin, 'consolidado', '2026-02-31', '2026-03-01'),
    ).rejects.toThrow('periodo informado no es valido');
  });
});
