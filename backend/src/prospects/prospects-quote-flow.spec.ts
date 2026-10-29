import { ProspectsService } from './prospects.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CoverageDomainService } from '../coverage/coverage-domain.service';
import { AuthUser } from '../common/auth.types';

const user: AuthUser = { idUsuario: 1, idEmpresa: 1, email: 'qa@example.invalid', nombreCompleto: 'QA', roles: ['Comercial'] };
function setup() {
  const prospect = { idProspecto: 1, idEmpresa: 1, idCliente: null, rut: '99000001-8', nombreCompleto: 'Prospecto QA', telefono: '+56900000001',
    estadoPipeline: 'Cotizacion Enviada', latitud: -33.475, longitud: -70.675, contratos: [], clasificacionComercial: 'PROSPECTO' };
  const tx = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), contrato: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ idContrato: 10, estado: 'Pendiente firma contrato' }), update: jest.fn() },
    prospecto: { findUniqueOrThrow: jest.fn().mockResolvedValue(prospect), update: jest.fn().mockResolvedValue(prospect) } };
  const prisma = { prospecto: { findUnique: jest.fn().mockResolvedValue(prospect), findMany: jest.fn() }, plan: { findUnique: jest.fn().mockResolvedValue({ idPlan: 1, idEmpresa: 1, activo: true }) },
    cotizacion: { findFirst: jest.fn().mockResolvedValue({ idCotizacion: 1 }) }, $transaction: jest.fn(async callback => callback(tx)) };
  const coverage = { check: jest.fn().mockResolvedValue({ estado: 'FACTIBLE' }), plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: 1 }] }) };
  const audit = { record: jest.fn() };
  const service = new ProspectsService(prisma as unknown as PrismaService, audit as unknown as AuditService, {} as MailService, coverage as unknown as CoverageDomainService);
  return { service, prisma, tx, prospect, coverage, audit };
}
describe('cotizacion persistida y confirmacion segura', () => {
  it('bloquea ubicacion contratada bajo el lock del prospecto sin escribir', async () => {
    const c = setup(); c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, estado: 'Firmado' });
    await expect(c.service.updateLocation(1, { ubicacion: { latitud: -33, longitud: -70 }, comuna: 'Otra' }, user)).rejects.toThrow('revision contractual');
    expect(c.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(c.tx.contrato.findFirst.mock.invocationCallOrder[0]);
    expect(c.tx.prospecto.update).not.toHaveBeenCalled(); expect(c.audit.record).not.toHaveBeenCalled();
  });
  it('conserva actualizacion previa al contrato con auditoria en la misma transaccion', async () => {
    const c = setup();
    await c.service.updateLocation(1, { ubicacion: { latitud: -33, longitud: -70 } }, user);
    expect(c.tx.prospecto.update).toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(expect.objectContaining({ accion: 'ACTUALIZAR_UBICACION_PROSPECTO' }), c.tx);
    expect(c.tx.prospecto.update.mock.calls[0][0].data).not.toHaveProperty('estadoPipeline');
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
    c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, estado: 'Pendiente firma contrato' });
    c.tx.contrato.update.mockResolvedValue({ idContrato: 10 });
    await c.service.contractPlan(1, { planId: 1 }, user);
    expect(c.tx.$queryRaw).toHaveBeenCalledWith(expect.any(Array), 1);
    expect(c.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(c.tx.contrato.findFirst.mock.invocationCallOrder[0]);
    expect(c.tx.contrato.create).not.toHaveBeenCalled();expect(c.tx.contrato.update).toHaveBeenCalledTimes(1);
  });
  it('rechaza duplicar un contrato ya firmado', async () => {
    const c = setup();c.tx.contrato.findFirst.mockResolvedValue({ idContrato: 10, estado: 'Firmado' });
    await expect(c.service.contractPlan(1, { planId: 1 }, user)).rejects.toThrow('duplicar');
    expect(c.tx.contrato.create).not.toHaveBeenCalled();expect(c.tx.prospecto.update).not.toHaveBeenCalled();
  });
});
