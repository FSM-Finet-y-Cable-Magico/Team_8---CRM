import { ProspectsService } from './prospects.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CoverageDomainService } from '../coverage/coverage-domain.service';
import { AuthUser } from '../common/auth.types';
import { Prisma } from '@prisma/client';

const user: AuthUser = { idUsuario: 1, idEmpresa: 1, email: 'qa@example.invalid', nombreCompleto: 'QA', roles: ['Comercial'] };
function setup() {
  const prospect = { idProspecto: 1, idEmpresa: 1, idCliente: null, rut: '99000001-8', nombreCompleto: 'Prospecto QA', telefono: '+56900000001',
    estadoPipeline: 'Cotizacion Enviada', latitud: -33.475, longitud: -70.675, contratos: [], clasificacionComercial: 'PROSPECTO' };
  const tx = { $queryRaw: jest.fn(), $executeRaw: jest.fn(),
    factura: { findMany: jest.fn().mockResolvedValue([]) },
    plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 1, idEmpresa: 1, activo: true }) },
    cotizacion: {findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }),},
    contrato: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ idContrato: 10, estado: 'Pendiente firma contrato' }), update: jest.fn() },
    prospecto: { findUniqueOrThrow: jest.fn().mockResolvedValue(prospect), update: jest.fn().mockResolvedValue(prospect) } };
  const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ available: false }]), prospecto: { findUnique: jest.fn().mockResolvedValue(prospect), findMany: jest.fn() }, plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 1, idEmpresa: 1, activo: true }) },
    zonaPago: { findUnique: jest.fn().mockResolvedValue({ idZonaPago: 21, idEmpresa: 1, activo: true }) },
    cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }) }, $transaction: jest.fn(async callback => callback(tx)) };
  const coverage = { check: jest.fn().mockResolvedValue({ estado: 'FACTIBLE' }), plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 1 }] }) };
  const audit = { record: jest.fn() };
  const service = new ProspectsService(prisma as unknown as PrismaService, audit as unknown as AuditService, {} as MailService, coverage as unknown as CoverageDomainService);
  return { service, prisma, tx, prospect, coverage, audit };
}
describe('cotizacion persistida y confirmacion segura', () => {
  it('un prospecto con RUT historico endeudado no crea contrato ni mueve pipeline', async () => {
    const c = setup();
    c.tx.factura.findMany.mockResolvedValue([{ monto: 7000, pagos: [], estado: 'Pendiente', fechaLimitePago: new Date('2026-01-01') }]);
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ response: { code: 'CONTRACT_CUSTOMER_DEBT' } });
    expect(c.tx.contrato.create).not.toHaveBeenCalled();
    expect(c.tx.contrato.update).not.toHaveBeenCalled();
    expect(c.tx.prospecto.update).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'BLOQUEAR_CONTRATACION_POR_DEUDA' }), c.tx);
    expect(c.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it.each([
    { microzona: null, expectedZoneId: 21 },
    { microzona: { idZonaPago: 22 }, expectedZoneId: 22 },
  ])('resuelve zona contractual validada cuando la UI no envia idZonaPago: $expectedZoneId', async ({ microzona, expectedZoneId }) => {
    const c = setup();
    c.coverage.plansForLocation.mockResolvedValue({ coberturaComercial: true,
      zona: { idZonaPago: 21 }, microzona, planes: [{ idPlan: 1 }] });
    await c.service.contractPlan(1, { planId: 1 }, user);
    expect(c.prisma.zonaPago.findUnique).toHaveBeenCalledWith({ where: { idZonaPago: expectedZoneId } });
    expect(c.tx.contrato.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idZonaPago: expectedZoneId }),
    }));
  });
  it.each([
    { origenPrecio: 'ZONA_PADRE', expectedZoneId: 21 },
    { origenPrecio: 'MICROZONA', expectedZoneId: 22 },
  ])('usa la zona de la regla de precio aplicada: $origenPrecio', async ({ origenPrecio, expectedZoneId }) => {
    const c = setup();
    c.coverage.plansForLocation.mockResolvedValue({ coberturaComercial: true,
      zona: { idZonaPago: 21 }, microzona: { idZonaPago: 22 }, planes: [{ idPlan: 1, origenPrecio }] });
    await c.service.contractPlan(1, { planId: 1 }, user);
    expect(c.tx.contrato.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idZonaPago: expectedZoneId }),
    }));
  });
  it('conserva idZonaPago explicito de los consumidores existentes', async () => {
    const c = setup();
    await c.service.contractPlan(1, { planId: 1, idZonaPago: 21 }, user);
    expect(c.tx.contrato.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idZonaPago: 21 }),
    }));
  });
  it('conserva comuna registrada al confirmar sin repetirla y ciudad explicita', async () => {
    const c = setup(); Object.assign(c.prospect, { comuna: ' Valparaiso ', region: 'Region QA' });
    await c.service.contractPlan(1, { planId: 1, ciudad: ' Ciudad QA ' }, user);
    expect(c.tx.contrato.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      comunaInstalacion: 'Valparaiso', ciudadInstalacion: 'Ciudad QA',
    }) }));
  });
  it('proyecta comuna del prospecto sin modificar el contrato firmado ni inferir ciudad de region', async () => {
    const c = setup();
    const contract = { idContrato: 10, idEmpresa: 1, estado: 'Firmado', direccionInstalacion: 'Calle QA', comunaInstalacion: null, ciudadInstalacion: null };
    c.prisma.prospecto.findMany.mockResolvedValue([{ ...c.prospect, direccion: 'Calle QA', comuna: 'Comuna QA', region: 'Region QA', contratos: [contract] }]);
    const [row] = await c.service.listPendingActivation(user);
    expect(row).toHaveProperty('ubicacionInstalacion', expect.objectContaining({ comuna: 'Comuna QA', ciudad: null, fuenteComuna: 'PROSPECTO' }));
    expect(row.contratos[0].comunaInstalacion).toBeNull();
    expect(c.tx.contrato.update).not.toHaveBeenCalled();
  });
  it('no mezcla ubicacion de otra empresa ni complementa una direccion contractual diferente', async () => {
    const c = setup();
    c.prisma.prospecto.findMany.mockResolvedValue([{ ...c.prospect, direccion: 'Calle QA', comuna: 'Comuna QA', contratos: [
      { idContrato: 9, idEmpresa: 2, estado: 'Firmado', comunaInstalacion: 'Privada', ciudadInstalacion: 'Privada' },
      { idContrato: 10, idEmpresa: 1, estado: 'Firmado', direccionInstalacion: 'Otra direccion', comunaInstalacion: null },
    ] }]);
    const [row] = await c.service.listPendingActivation(user);
    expect(row).toHaveProperty('ubicacionInstalacion', expect.objectContaining({ comuna: null, ciudad: null }));
    expect(row.contratos.map(c => c.idContrato)).toEqual([10]);
  });

  it.each([
    { electronic: [{ idContrato: 10, fecha: new Date('2026-11-09') }], expected: 10, origin: 'ELECTRONICA' },
    { electronic: [{ idContrato: 10, fecha: new Date('2026-11-07') }], expected: 11, origin: 'MANUAL' },
    { electronic: [{ idContrato: 10, fecha: new Date('2026-11-08') }], expected: 11, origin: 'MANUAL' },
    { electronic: [], expected: 11, origin: 'MANUAL' },
  ])('selecciona fecha efectiva y desempate estable: $origin / $expected', async ({ electronic, expected, origin }) => {
    const c=setup();
    c.prisma.$queryRaw.mockResolvedValueOnce([{available:true}]).mockResolvedValueOnce(electronic as never);
    const manualDate=new Date('2026-11-08');
    c.prisma.prospecto.findMany.mockResolvedValue([{...c.prospect,contratos:[
      {idContrato:12,idEmpresa:1,estado:'Firmado',fechaFirmaManual:null},
      {idContrato:10,idEmpresa:1,estado:'Firmado',fechaFirmaManual:null},
      {idContrato:11,idEmpresa:1,estado:'Moroso',fechaFirmaManual:manualDate},
      {idContrato:99,idEmpresa:2,estado:'Firmado',fechaFirmaManual:new Date('2026-12-01')},
    ]}]);
    const [result]=await c.service.listPendingActivation(user);
    expect(result.contratos).toHaveLength(1);
    expect(result.contratos[0]).toMatchObject({idContrato:expected,origenFirma:origin});
    expect(result.contratos[0].fechaFirmaManual).toEqual(expected===11?manualDate:null);
    expect(c.tx.contrato.update).not.toHaveBeenCalled();
  });
  it('históricos sin fecha eligen ID descendente sin inventar una fecha de firma',async()=>{
    const c=setup();
    c.prisma.prospecto.findMany.mockResolvedValue([{...c.prospect,contratos:[10,12,11].map(idContrato=>({
      idContrato,idEmpresa:1,estado:'Firmado',fechaFirmaManual:null,
    }))}]);
    const [result]=await c.service.listPendingActivation(user);
    expect(result.contratos[0]).toMatchObject({idContrato:12,fechaFirmaEfectiva:null,origenFirma:'SIN_FECHA'});
  });
  it.each([
    { latitud: -35 }, { direccion: 'Otra direccion' }, { estadoPipeline: 'Perdido' },
    { estadoPipeline: 'No Factible' }, { idCliente: 77 }, { idEmpresa: 2 }, { idZonaPago: 2 },
  ])('rechaza datos que cambiaron antes del lock: %j', async change => {
    const c = setup();
    c.tx.prospecto.findUniqueOrThrow.mockResolvedValue({ ...c.prospect, ...change } as typeof c.prospect);
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ status: 409 });
    expect(c.tx.contrato.create).not.toHaveBeenCalled(); expect(c.tx.contrato.update).not.toHaveBeenCalled();
    expect(c.tx.prospecto.update).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
  });
  it.each(['plan', 'cotizacion'])('revalida %s al adquirir el lock', async kind => {
    const c = setup();
    if (kind === 'plan') c.tx.plan.findUnique.mockResolvedValue({ idPlan: 1, idEmpresa: 1, activo: false });
    else c.tx.cotizacion.findFirst.mockResolvedValue(null);
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ status: 409 });
    expect(c.tx.contrato.create).not.toHaveBeenCalled(); expect(c.tx.prospecto.update).not.toHaveBeenCalled();
  });
  it('no sobrescribe una firma concurrente y devuelve conflicto controlado', async () => {
    const c = setup(); c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Pendiente firma contrato' });
    c.tx.contrato.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conditional update lost', { code: 'P2025', clientVersion: '5.22.0' }));
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ status: 409 });
    expect(c.tx.prospecto.update).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
  });
  it('bloquea ubicacion contratada bajo el lock del prospecto sin escribir', async () => {
    const c = setup(); c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, estado: 'Firmado' });
    await expect(c.service.updateLocation(1, { ubicacion: { latitud: -33, longitud: -70 }, comuna: 'Otra' }, user)).rejects.toThrow('revision contractual');
    expect(c.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(c.tx.contrato.findFirst.mock.invocationCallOrder[0]);
    expect(c.tx.prospecto.update).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
  });
  it('invalida cotizaciones al editar la ubicacion de un prospecto cotizado', async () => {
    const c = setup();

    c.coverage.check.mockResolvedValue({
      estado: 'FACTIBLE',
      coberturaComercial: true,
    });

    c.tx.prospecto.update.mockResolvedValue({
      ...c.prospect,
      latitud: -33,
      longitud: -70,
      estadoPipeline: 'Factible',
    });

    await c.service.updateLocation(
      1,
      { ubicacion: { latitud: -33, longitud: -70 } },
      user,
    );

    expect(c.tx.cotizacion.updateMany).toHaveBeenCalledWith({
      where: { idProspecto: 1 },
      data: { factibilidadVerificada: false },
    });

    expect(c.tx.prospecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estadoPipeline: 'Factible',
        }),
      }),
    );

    expect(c.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'ACTUALIZAR_UBICACION_PROSPECTO',
        valorNuevo: expect.objectContaining({
          cotizacionesAnterioresInvalidas: true,
          estadoPipeline: 'Factible',
        }),
      }),
      c.tx,
    );

    expect(
      c.tx.cotizacion.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      c.tx.prospecto.update.mock.invocationCallOrder[0],
    );
  });
  it('publica solo referencias de cotizaciones factibles de planes propios activos', async () => {
    const c = setup();
    c.prisma.prospecto.findMany.mockResolvedValue([{ ...c.prospect, cotizaciones: [
      { idCotizacion: 1, idPlan: 1, fechaEnvio: '2026-10-28', plan: { idEmpresa: 1, activo: true } },
      { idCotizacion: 2, idPlan: 2, fechaEnvio: '2026-10-28', plan: { idEmpresa: 2, activo: true } },
      { idCotizacion: 3, idPlan: 3, fechaEnvio: '2026-10-28', plan: { idEmpresa: 1, activo: false } },
    ] }]);
    const rows = await c.service.list(user);
    expect(rows[0].cotizaciones).toEqual([{ idCotizacion: 1, idPlan: 1, fechaEnvio: '2026-10-28' }]);
    expect(c.prisma.prospecto.findMany.mock.calls[0][0].include.cotizaciones.where).toEqual({ factibilidadVerificada: true, fechaEnvio: { not: null } });
  });
  it.each(['sin cotizacion', 'inactivo', 'otra empresa', 'No Factible', 'Perdido', 'cobertura retirada'])(
    'rechaza %s sin escribir contrato', async reason => {
      const c = setup();
      if (reason === 'sin cotizacion') c.prisma.cotizacion.findFirst.mockResolvedValue(null);
      if (reason === 'inactivo') c.prisma.plan.findUnique.mockResolvedValue({ idPlan: 1, idEmpresa: 1, activo: false });
      if (reason === 'otra empresa') c.prisma.plan.findUnique.mockResolvedValue({ idPlan: 1, idEmpresa: 2, activo: true });
      if (['No Factible', 'Perdido'].includes(reason)) c.prospect.estadoPipeline = reason;
      if (reason === 'cobertura retirada') c.coverage.plansForLocation.mockResolvedValue({ coberturaComercial: false, planes: [] });
      await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toThrow();
      expect(c.prisma.$transaction).not.toHaveBeenCalled();expect(c.tx.contrato.create).not.toHaveBeenCalled();
    },
  );
  it('mantiene lock y reutiliza el contrato pendiente sin crear otro', async () => {
    const c = setup();
    c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Pendiente firma contrato' });
    c.tx.contrato.update.mockResolvedValue({ idContrato: 10 });
    await c.service.contractPlan(1, { planId: 1 }, user);
    expect(c.tx.$queryRaw).toHaveBeenCalledWith(expect.any(Array), 1);
    expect(c.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(c.tx.contrato.findFirst.mock.invocationCallOrder[0]);
    expect(c.tx.contrato.create).not.toHaveBeenCalled();expect(c.tx.contrato.update).toHaveBeenCalledTimes(1);
  });
  it('rechaza duplicar un contrato ya firmado', async () => {
    const c = setup();c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Firmado' });
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toThrow('duplicar');
    expect(c.tx.contrato.create).not.toHaveBeenCalled();expect(c.tx.prospecto.update).not.toHaveBeenCalled();
  });
  it('convierte el contrato ocupado por firma en conflicto sin esperar un deadlock', async () => {
    const c = setup();
    c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Pendiente firma contrato' });
    c.tx.$queryRaw.mockResolvedValueOnce([]).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('lock not available', {
      code: 'P2010', clientVersion: '5.22.0', meta: { code: '55P03' },
    }));
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ status: 409 });
    expect(c.tx.$queryRaw.mock.calls[1][0].join('')).toContain('FOR UPDATE NOWAIT');
    expect(c.tx.contrato.update).not.toHaveBeenCalled(); expect(c.tx.prospecto.update).not.toHaveBeenCalled();
    expect(c.audit.record).not.toHaveBeenCalled();
  });
  it('relee el contrato bajo lock y conserva una firma confirmada entre consultas', async () => {
    const c = setup();
    c.tx.contrato.findFirst.mockResolvedValueOnce({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Pendiente firma contrato' })
      .mockResolvedValueOnce({ idContrato: 10, idEmpresa: 1, idProspecto: 1, estado: 'Firmado' });
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toMatchObject({ status: 409 });
    expect(c.tx.contrato.update).not.toHaveBeenCalled(); expect(c.tx.prospecto.update).not.toHaveBeenCalled();
  });
});
