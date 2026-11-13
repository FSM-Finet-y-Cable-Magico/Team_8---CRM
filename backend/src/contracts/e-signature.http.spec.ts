import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { ContractSignatureController, PublicSignatureController, SignaturePublicGuard } from './e-signature.controller';
import { ESignatureService } from './e-signature.service';
import { DEMO_SIGNATURE_CONSENT_VERSION, SIGNATURE_CONSENT_VERSION } from './e-signature.config';

describe('Barrera y DTO públicos de firma', () => {
  let app: INestApplication;
  const service = { view: jest.fn().mockResolvedValue({ estado: 'PENDIENTE' }),
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-QA')), requestCode: jest.fn().mockResolvedValue({ enviado: true }),
    sign: jest.fn().mockResolvedValue({ estado: 'FIRMADA' }) };
  const token = randomBytes(32).toString('base64url');
  async function start(enabled = true) {
    const module = await Test.createTestingModule({ controllers: [PublicSignatureController],
      providers: [SignaturePublicGuard, { provide: ESignatureService, useValue: service },
        { provide: ConfigService, useValue: new ConfigService({ NODE_ENV: 'test',
          CONTRACT_SIGNATURE_ENABLED: String(enabled), CONTRACT_SIGNATURE_PUBLIC_URL: 'http://localhost/',
          CONTRACT_SIGNATURE_COMPANIES: '[1]', CONTRACT_SIGNATURE_OTP_SECRET: randomBytes(32).toString('hex') }) }] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  }
  afterEach(async () => { await app?.close(); jest.clearAllMocks(); });
  it.each(['view','pdf','code','sign'])('apagada /%s devuelve 404 sin ejecutar servicio', async path => {
    await start(false); await request(app.getHttpServer()).post('/contract-signatures/' + path).send({ token }).expect(404);
    expect(service.view).not.toHaveBeenCalled(); expect(service.sign).not.toHaveBeenCalled();
  });
  it('valida token y campos desconocidos antes de consultar datos', async () => {
    await start();
    await request(app.getHttpServer()).post('/contract-signatures/view').send({ token: 'invalid' }).expect(400);
    await request(app.getHttpServer()).post('/contract-signatures/view').send({ token, idEmpresa: 2 }).expect(400);
    expect(service.view).not.toHaveBeenCalled();
  });
  it('el PDF no se almacena en caché y no introduce el token en la URL', async () => {
    await start();
    await request(app.getHttpServer()).post('/contract-signatures/pdf').send({ token })
      .expect(201).expect('Cache-Control', 'no-store').expect('Referrer-Policy', 'no-referrer').expect('Content-Type', /application\/pdf/);
    expect(service.pdf).toHaveBeenCalledWith(token);
  });
  it('un error del driver no publica la fila ni el token y devuelve un mensaje de revisión', async () => {
    await start(); service.view.mockRejectedValueOnce(new Error('PRIVATE_DRIVER_ROW'));
    const result = await request(app.getHttpServer()).post('/contract-signatures/view').send({ token }).expect(503);
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE_DRIVER_ROW');
    expect(JSON.stringify(result.body)).not.toContain(token);
  });
  it('rechaza consentimiento falso, código mal formado y versión no revisada', async () => {
    await start();
    const body = { token, code: '123456', hashOriginal: 'f'.repeat(64), consent: true, consentVersion: SIGNATURE_CONSENT_VERSION };
    for (const extra of [{ consent: false }, { code: 'x' }, { consentVersion: 'otro' }]) {
      await request(app.getHttpServer()).post('/contract-signatures/sign').send({ ...body, ...extra }).expect(400);
    }
    expect(service.sign).not.toHaveBeenCalled();
  });
  it('el DTO conserva la validación del código normal y delega el consentimiento demo al servicio', async () => {
    await start();
    const body = { token, hashOriginal: 'a'.repeat(64), consent: true };
    await request(app.getHttpServer()).post('/contract-signatures/sign')
      .send({ ...body, consentVersion: SIGNATURE_CONSENT_VERSION }).expect(400);
    expect(service.sign).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/contract-signatures/sign')
      .send({ ...body, consentVersion: DEMO_SIGNATURE_CONSENT_VERSION }).expect(201);
    expect(service.sign.mock.calls[0].slice(0, 5))
      .toEqual([token, undefined, body.hashOriginal, true, DEMO_SIGNATURE_CONSENT_VERSION]);
  });
});

describe('Rutas internas con JWT y roles reales', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') });
  const service = { status: jest.fn().mockResolvedValue({ enabled: false, solicitud: null }),
    create: jest.fn().mockResolvedValue({ enabled: true }), cancel: jest.fn(), signedPdf: jest.fn() };
  const user = { idUsuario: 1, idEmpresa: 1, versionSesion: 0, activo: true,
    email: null, nombreCompleto: 'Operador ficticio', usuarioRoles: [{ rol: { nombreRol: 'Comercial' } }] };
  const db = { usuario: { findUnique: jest.fn().mockResolvedValue(user) } };
  beforeEach(async () => {
    const module = await Test.createTestingModule({ controllers: [ContractSignatureController],
      providers: [{ provide: JwtService, useValue: jwt }, { provide: PrismaService, useValue: db },
        { provide: ESignatureService, useValue: service }, JwtAuthGuard, RolesGuard] }).compile();
    app = module.createNestApplication(); await app.init(); db.usuario.findUnique.mockResolvedValue(user);
  });
  afterEach(async () => { await app.close(); jest.clearAllMocks(); });
  it('sin JWT o con token inválido no consulta solicitudes', async () => {
    await request(app.getHttpServer()).get('/contracts/8/signature').expect(401);
    await request(app.getHttpServer()).post('/contracts/8/signature').set('Authorization', 'Bearer invalid').expect(401);
    expect(service.status).not.toHaveBeenCalled(); expect(service.create).not.toHaveBeenCalled();
  });
  it('el rol se relee del servidor y no se acepta el rol inventado en el JWT', async () => {
    const token = await jwt.signAsync({ idUsuario: 1, roles: ['Administrador'] });
    db.usuario.findUnique.mockResolvedValue({ ...user, usuarioRoles: [{ rol: { nombreRol: 'Soporte' } }] });
    await request(app.getHttpServer()).post('/contracts/8/signature').set('Authorization', 'Bearer ' + token).expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('el operador Comercial accede usando la identidad y empresa verificadas', async () => {
    const token = await jwt.signAsync({ idUsuario: 1 });
    await request(app.getHttpServer()).post('/contracts/8/signature').set('Authorization', 'Bearer ' + token).expect(201);
    expect(service.create).toHaveBeenCalledWith(8, expect.objectContaining({ idUsuario: 1, idEmpresa: 1, roles: ['Comercial'] }));
  });
});
