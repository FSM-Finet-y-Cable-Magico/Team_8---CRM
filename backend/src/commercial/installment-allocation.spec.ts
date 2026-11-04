import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { InstallmentAllocationController } from './installment-allocation.controller';
import { InstallmentAllocationService } from './installment-allocation.service';

const user = (role = 'Administrador', company = 1): AuthUser => ({ idUsuario: 1, idEmpresa: company, nombreCompleto: 'QA', email: null, roles: [role] });
const dto = { idPago: 1, clave: 'qa-operation-1', motivo: 'Confirmacion QA', cuotas: [{ idCuota: 1, monto: '0.10' }] };

describe('Imputaciones: rutas autenticadas y permisos vigentes', () => {
  let app: INestApplication;
  let role = 'Administrador';
  const service = { detail: jest.fn(), apply: jest.fn(), reverse: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [InstallmentAllocationController], providers: [
      { provide: InstallmentAllocationService, useValue: service },
      { provide: JwtService, useValue: { verifyAsync: jest.fn(async (token: string) => { if (token !== 'qa-only') throw new Error(); return user(); }) } },
      { provide: PrismaService, useValue: { usuario: { findUnique: jest.fn(async () => ({ ...user(role), activo: true, usuarioRoles: [{ rol: { nombreRol: role } }] })) } } },
    ] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { jest.clearAllMocks(); role = 'Administrador'; service.apply.mockResolvedValue({ duplicado: false }); service.reverse.mockResolvedValue({ duplicado: true }); service.detail.mockResolvedValue({ cuotas: [] }); });
  it('rechaza llamadas anónimas antes de consultar o escribir', async () => {
    await request(app.getHttpServer()).get('/commercial/agreements/1/allocations').expect(401);
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations').send(dto).expect(401);
    expect(service.apply).not.toHaveBeenCalled(); expect(service.detail).not.toHaveBeenCalled();
  });
  it.each(['Comercial', 'Soporte'])('%s consulta pero no imputa ni revierte', async r => {
    role = r;
    await request(app.getHttpServer()).get('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').expect(200);
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').send(dto).expect(403);
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations/1/reverse').set('Authorization', 'Bearer qa-only').send({ clave: dto.clave, motivo: dto.motivo, monto: '0.10' }).expect(403);
    expect(service.apply).not.toHaveBeenCalled(); expect(service.reverse).not.toHaveBeenCalled();
  });
  it.each(['Terreno', 'Inventario'])('%s no recibe permisos amplios de consulta', async r => {
    role = r; await request(app.getHttpServer()).get('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').expect(403); expect(service.detail).not.toHaveBeenCalled();
  });
  it('Administrador opera con identidad del token, strings monetarios y claves intactas', async () => {
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').send(dto).expect(201);
    expect(service.apply).toHaveBeenCalledWith(1, dto, expect.objectContaining({ idUsuario: 1, roles: ['Administrador'] }));
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations/2/reverse').set('Authorization', 'Bearer qa-only').send({ clave: dto.clave, motivo: dto.motivo, monto: '0.10' }).expect(201);
    expect(service.reverse).toHaveBeenCalledWith(1, 2, expect.objectContaining({ monto: '0.10' }), expect.anything());
  });
  it.each([0.1, '0.001', '-1', 'NaN', '1e3'])('rechaza monto HTTP no exacto %s', async monto => {
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').send({ ...dto, cuotas: [{ idCuota: 1, monto }] }).expect(400); expect(service.apply).not.toHaveBeenCalled();
  });
  it('rechaza campos de empresa/rol/operador proporcionados por navegador', async () => {
    await request(app.getHttpServer()).post('/commercial/agreements/1/allocations').set('Authorization', 'Bearer qa-only').send({ ...dto, idEmpresa: 2, idUsuario: 2 }).expect(400); expect(service.apply).not.toHaveBeenCalled();
  });
});

describe('Imputaciones: invariantes previas a escrituras', () => {
  const dec = (value: string) => new Prisma.Decimal(value);
  function setup() {
    const agreement = { idConvenio: 1, idEmpresa: 2, idCliente: 10, idContrato: 20, idFactura: 30, idServicio: null, estado: 'APROBADO', servicio: null,
      cuotas: [{ idCuota: 1, numero: 1, monto: dec('3500'), estado: 'PENDIENTE', fechaPago: null }],
      factura: { idFactura: 30, estado: 'Pagada', contrato: { idContrato: 20, idEmpresa: 2, idCliente: 10, cliente: { idCliente: 10, idEmpresa: 1, estado: 'Moroso' } } } };
    const tx = { convenioPago: { findUnique: jest.fn(async () => agreement) }, pago: { findMany: jest.fn(async () => [{ idPago: 1, monto: dec('3500'), fechaPago: new Date(), pasarela: 'QA' }]), findUnique: jest.fn() },
      operacionImputacionCuota: { findMany: jest.fn(async () => []), findUnique: jest.fn() }, $queryRaw: jest.fn(), cuotaConvenioPago: { update: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
    const audit = { record: jest.fn() };
    return { agreement, tx, prisma, audit, service: new InstallmentAllocationService(prisma as unknown as PrismaService, audit as unknown as AuditService) };
  }
  it('escritura restringida verifica rol dentro de Serializable antes de leer o bloquear', async () => {
    const f = setup(); await expect(f.service.apply(1, dto, user('Comercial'))).rejects.toMatchObject({ status: 403 });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
    expect(f.tx.convenioPago.findUnique).not.toHaveBeenCalled(); expect(f.tx.$queryRaw).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });
  it('lectura de otra empresa se rechaza antes de consultar pagos/historial', async () => {
    const f = setup(); await expect(f.service.detail(1, user('Soporte', 1))).rejects.toMatchObject({ status: 403 });
    expect(f.tx.pago.findMany).not.toHaveBeenCalled(); expect(f.tx.operacionImputacionCuota.findMany).not.toHaveBeenCalled();
  });
  it('cliente compartido se autoriza por contrato sin alterar su estado ni cuotas históricas', async () => {
    const f = setup(); const result = await f.service.detail(1, user('Soporte', 2));
    expect(result.puedeImputar).toBe(false); expect(result.cuotas[0]).toMatchObject({ estado: 'PENDIENTE', saldo: '3500.00' });
    expect(f.tx.cuotaConvenioPago.update).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });
  it('relaciones inconsistentes se rechazan antes de acceder a los pagos', async () => {
    const f = setup(); f.agreement.factura.contrato.idEmpresa = 1;
    await expect(f.service.detail(1, user())).rejects.toMatchObject({ status: 409 }); expect(f.tx.pago.findMany).not.toHaveBeenCalled();
  });
  it.each(['40001', '40P01'])('reintenta toda la transacción tras P2010 SQLSTATE %s del bloqueo', async code => {
    const tx = jest.fn().mockRejectedValueOnce({ code: 'P2010', meta: { code } }).mockResolvedValue({ duplicado: true });
    const service = new InstallmentAllocationService({ $transaction: tx } as unknown as PrismaService, {} as AuditService);
    await expect(service.apply(1, dto, user())).resolves.toEqual({ duplicado: true }); expect(tx).toHaveBeenCalledTimes(2);
  });
  it('no oculta otros errores SQL y limita los reintentos transitorios', async () => {
    const error = { code: 'P2010', meta: { code: '23503' } }, tx = jest.fn().mockRejectedValue(error);
    const service = new InstallmentAllocationService({ $transaction: tx } as unknown as PrismaService, {} as AuditService);
    await expect(service.apply(1, dto, user())).rejects.toBe(error); expect(tx).toHaveBeenCalledTimes(1);
    tx.mockClear().mockRejectedValue({ code: 'P2010', meta: { code: '40001' } });
    await expect(service.apply(1, dto, user())).rejects.toMatchObject({ status: 409 }); expect(tx).toHaveBeenCalledTimes(3);
  });
});
