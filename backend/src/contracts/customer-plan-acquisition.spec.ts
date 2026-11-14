import { ConfigService } from '@nestjs/config';
import { ContractsService } from './contracts.service';
import { ProspectsService } from '../prospects/prospects.service';
import { AuthUser } from '../common/auth.types';

const actor: AuthUser = { idUsuario: 2, idEmpresa: 1, roles: ['Comercial'], nombreCompleto: 'QA', email: 'qa@example.invalid' };
const identity = { rut: '11111111-1', nombreCompleto: 'Cliente QA', telefono: '+56912345678', email: 'qa@example.invalid' };
function fixture() {
  const customer = { ...identity, idCliente: 10, idEmpresa: 1, estado: 'Moroso', contratos: [{ idEmpresa: 1 }] };
  const location = { ...identity, idProspecto: 20, idCliente: 10, idEmpresa: 1, origenContacto: 'Plan adicional',
    latitud: -33.4, longitud: -70.6, direccion: 'Nueva Dirección 123', comuna: 'Santiago', idZonaPago: 8 };
  const quote = { idCotizacion: 30, idProspecto: 20, idPlan: 7, fechaEnvio: new Date(), factibilidadVerificada: true, prospecto: location };
  const plan = { idPlan: 7, idEmpresa: 1, activo: true };
  const created = { idContrato: 40, idCliente: 10, idProspecto: 20, idEmpresa: 1, idPlan: 7, estado: 'Pendiente firma contrato' };
  const db = { cliente: { findUnique: jest.fn().mockResolvedValue(customer), update: jest.fn() },
    plan: { findUnique: jest.fn().mockResolvedValue(plan) },
    cotizacion: { findUnique: jest.fn().mockResolvedValue(quote), findMany: jest.fn().mockResolvedValue([]) },
    prospecto: { create: jest.fn().mockResolvedValue(location) },
    contrato: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
    servicioContratado: { create: jest.fn() }, ordenTrabajo: { create: jest.fn() },
    factura: { findMany: jest.fn().mockResolvedValue([]) }, $queryRaw: jest.fn(), $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async fn => fn(db));
  const audit = { record: jest.fn() };
  const coverage = { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true,
    planes: [{ idPlan: 7, origenPrecio: 'ZONA_PADRE', precioAplicable: 19990 }], zona: { idZonaPago: 8 }, microzona: { idZonaPago: 9 } }) };
  const service = new ContractsService(db as never, audit as never, {} as never, new ConfigService(), coverage as never);
  // Exercise registration rules against the caller transaction; PDF/signature commit is covered by contracts-pdf.spec.
  const register = jest.spyOn(service, 'registerWithDigitalContract').mockImplementation((async (_user: unknown,
    work: (tx: unknown) => Promise<{ result: unknown }>) => (await work(db)).result) as never);
  const prospects = new ProspectsService(db as never, audit as never, {} as never, coverage as never, service);
  return { db, quote, location, customer, created, coverage, service, prospects, audit, register };
}
const dto = { idCliente: 10, idPlan: 7, idCotizacion: 30, observacion: 'Segundo domicilio' };

describe('Añadir plan con dirección y cotización', () => {
  it('recupera historial persistente por cliente y empresa con su contratación asociada', async () => {
    const h = fixture(); h.db.cotizacion.findMany.mockResolvedValue([{ ...h.quote, codigo: 'COT-QA',
      plan: { idEmpresa: 1, nombreComercial: 'Plan QA', activo: true }, prospecto: { ...h.location,
        contratos: [{ idContrato: 40, estado: 'Pendiente firma contrato' }] } }]);
    const rows = await h.prospects.customerQuotes(10, 1, actor);
    expect(rows).toEqual([expect.objectContaining({ idCotizacion: 30, planNombre: 'Plan QA', direccion: 'Nueva Dirección 123',
      contrato: { idContrato: 40, estado: 'Pendiente firma contrato' } })]);
    expect(h.db.cotizacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      fechaEnvio: { not: null }, prospecto: { idCliente: 10, idEmpresa: 1, origenContacto: 'Plan adicional' },
    } }));
  });
  it('no lee historial de cotizaciones de otra empresa', async () => {
    const h = fixture();
    await expect(h.prospects.customerQuotes(10, 2, actor)).rejects.toThrow('Cliente no encontrado');
    expect(h.db.cotizacion.findMany).not.toHaveBeenCalled();
  });
  it('crea pendiente de firma con dirección propia y delega PDF + envío sin crear servicio ni OT', async () => {
    const h = fixture();
    await expect(h.service.createCustomerContract(dto, actor)).resolves.toBe(h.created);
    expect(h.register).toHaveBeenCalledTimes(1);
    expect(h.db.contrato.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      idCliente: 10, idProspecto: 20, idPlan: 7, idEmpresa: 1, idZonaPago: 8,
      direccionInstalacion: 'Nueva Dirección 123', comunaInstalacion: 'Santiago',
      estado: 'Pendiente firma contrato', observacionContrato: 'Segundo domicilio',
    }) }));
    expect(h.db.cliente.update).not.toHaveBeenCalled();
    expect(h.db.servicioContratado.create).not.toHaveBeenCalled();
    expect(h.db.ordenTrabajo.create).not.toHaveBeenCalled();
  });
  it('impide saltar la cotización', async () => {
    const h = fixture();
    await expect(h.service.createCustomerContract({ idCliente: 10, idPlan: 7 }, actor)).rejects.toThrow('cotización factible');
    expect(h.register).not.toHaveBeenCalled();
  });
  it.each([{ idCliente: 99 }, { idEmpresa: 2 }, { latitud: null }, { comuna: '' }, { email: 'otro@example.invalid' }])('rechaza ubicación o identidad incoherente %j', async changes => {
    const h = fixture(); Object.assign(h.location, changes);
    await expect(h.service.createCustomerContract(dto, actor)).rejects.toThrow('cotización no corresponde');
    expect(h.register).not.toHaveBeenCalled();
  });
  it('revalida cobertura en el servidor aunque exista cotización anterior', async () => {
    const h = fixture(); h.coverage.plansForLocation.mockResolvedValue({ coberturaComercial: false, planes: [] });
    await expect(h.service.createCustomerContract(dto, actor)).rejects.toThrow('ya no está disponible');
    expect(h.db.contrato.create).not.toHaveBeenCalled();
  });
  it('rechaza una zona impuesta por el navegador', async () => {
    const h = fixture();
    await expect(h.service.createCustomerContract({ ...dto, idZonaPago: 99 }, actor)).rejects.toThrow('automáticamente');
  });
  it('conserva el veto y la auditoría por deuda', async () => {
    const h = fixture(); h.db.factura.findMany.mockResolvedValue([{ estado: 'Pendiente', monto: 7000, pagos: [], fechaLimitePago: new Date('2026-01-01') }]);
    await expect(h.service.createCustomerContract(dto, actor)).rejects.toMatchObject({ response: { code: 'CONTRACT_CUSTOMER_DEBT' } });
    expect(h.db.contrato.create).not.toHaveBeenCalled();
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'BLOQUEAR_CONTRATACION_POR_DEUDA' }), h.db);
  });
  it('reutiliza la misma contratación al repetir la confirmación', async () => {
    const h = fixture(); h.db.contrato.findFirst.mockResolvedValue(h.created);
    await expect(h.service.createCustomerContract(dto, actor)).resolves.toBe(h.created);
    expect(h.db.contrato.create).not.toHaveBeenCalled();
  });
  it('rechaza cambios de ubicación ocurridos durante la confirmación', async () => {
    const h = fixture(); h.db.cotizacion.findUnique.mockResolvedValueOnce(h.quote).mockResolvedValueOnce({ ...h.quote, prospecto: { ...h.location, direccion: 'Otra 999' } });
    await expect(h.service.createCustomerContract(dto, actor)).rejects.toThrow('cambiaron');
    expect(h.db.contrato.create).not.toHaveBeenCalled();
  });
  it('no permite cotizar un cliente ajeno por compartir el catálogo de planes', async () => {
    const h = fixture(); Object.assign(h.customer, { idEmpresa: 2, contratos: [{ idEmpresa: 2 }] });
    await expect(h.prospects.quoteCustomerPlan({ ...h.location, idCliente: 10, planId: 7 }, actor)).rejects.toThrow('Cliente no encontrado');
    expect(h.db.prospecto.create).not.toHaveBeenCalled();
  });
  it('cotiza dirección nueva para cliente existente sin crear otro cliente ni modificarlo', async () => {
    const h = fixture(); const generate = jest.spyOn(h.prospects, 'generateQuote').mockResolvedValue({ idCotizacion: 30 } as never);
    await h.prospects.quoteCustomerPlan({ ...h.location, idCliente: 10, planId: 7 }, actor);
    expect(h.db.prospecto.create).toHaveBeenCalledWith({ data: expect.objectContaining({ idCliente: 10, idEmpresa: 1,
      clasificacionComercial: 'CLIENTE', direccion: 'Nueva Dirección 123', latitud: -33.4, longitud: -70.6 }) });
    expect(generate).toHaveBeenCalledWith(20, { planId: 7 }, actor);
    expect(h.db.cliente.update).not.toHaveBeenCalled();
  });
});
