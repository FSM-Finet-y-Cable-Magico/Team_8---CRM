import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { InstallationHistoryController } from './installation-history.controller';
import { InstallationHistoryService } from './installation-history.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GET historial usa autenticacion y roles reales, sin ruta S2S', () => {
  let app: INestApplication;
  const history = { list: jest.fn().mockResolvedValue({ fuente: 'G8_PERSISTIDO', items: [] }) };
  const verify = jest.fn();
  const findUnique = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [InstallationHistoryController], providers: [
      { provide: InstallationHistoryService, useValue: history },
      { provide: JwtService, useValue: { verifyAsync: verify } },
      { provide: PrismaService, useValue: { usuario: { findUnique } } },
    ] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks(); verify.mockResolvedValue({ idUsuario: 1, versionSesion: 0 });
    findUnique.mockResolvedValue({ idUsuario: 1, idEmpresa: 2, activo: true, versionSesion: 0, usuarioRoles: [{ rol: { nombreRol: 'Comercial' } }] });
  });
  afterAll(async () => app.close());
  it('sin token no ejecuta la consulta', async () => {
    await request(app.getHttpServer()).get('/integrations/g3/installation-history').expect(401);
    expect(history.list).not.toHaveBeenCalled();
  });
  it('rol de inventario no obtiene historial', async () => {
    findUnique.mockResolvedValue({ idUsuario: 1, idEmpresa: 2, usuarioRoles: [{ rol: { nombreRol: 'Inventario' } }] });
    await request(app.getHttpServer()).get('/integrations/g3/installation-history').set('Authorization', 'Bearer synthetic').expect(403);
    expect(history.list).not.toHaveBeenCalled();
  });
  it('empresa proviene de identidad persistida y respuesta no se almacena en cache', async () => {
    const response = await request(app.getHttpServer()).get('/integrations/g3/installation-history?scope=1').set('Authorization', 'Bearer synthetic').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(history.list).toHaveBeenCalledWith(expect.objectContaining({ idEmpresa: 2, roles: ['Comercial'] }), '1');
  });
});

describe('GET historial proyecta OT global sin activación ni correlación inventada', () => {
  let app: INestApplication;
  const prisma = {
    usuario: { findUnique: jest.fn().mockResolvedValue({ idUsuario: 1, idEmpresa: 1, activo: true, versionSesion: 0,
      usuarioRoles: [{ rol: { nombreRol: 'Comercial' } }] }) },
    ordenTrabajo: { findMany: jest.fn().mockResolvedValue([{ idOt: 2, idEmpresa: 1, tipoOt: 'INSTALACION', estado: 'COMPLETADA',
      idServicio: null, idCliente: null, servicio: null, fechaCompletada: new Date('2026-10-02T12:00:00Z') }]) },
    integracionInstalacionG3: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ idOt: 2, idEmpresa: 1, cierreEquipos: { instalados: [{ numero_serie: 'ONT-OT-QA' }], retirados: [] } }]),
    $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [InstallationHistoryController], providers: [
      InstallationHistoryService, { provide: PrismaService, useValue: prisma },
      { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ idUsuario: 1, versionSesion: 0 }) } },
    ] }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => app.close());
  it('devuelve fecha técnica, serie de OT y relaciones nulas sin hacer una activación', async () => {
    const response = await request(app.getHttpServer()).get('/integrations/g3/installation-history?scope=2').set('Authorization', 'Bearer synthetic').expect(200);
    expect(response.body.scope).toBe('1');
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ idOt: '2', fuente: 'LEGACY_LOCAL', idServicio: null, idContrato: null,
      fechasTecnicasOriginales: ['2026-10-02T12:00:00.000Z'], solicitudesG3: [],
      antecedentesTecnicos: [{ equiposDeclarados: { instalados: ['ONT-OT-QA'] }, asignacionInventarioConfirmada: false }] });
    expect(prisma.ordenTrabajo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ idEmpresa: 1 }) }));
    expect(prisma).not.toHaveProperty('unidadEquipo');
  });
});
