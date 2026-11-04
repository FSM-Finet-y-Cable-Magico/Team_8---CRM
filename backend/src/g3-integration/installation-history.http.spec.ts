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
