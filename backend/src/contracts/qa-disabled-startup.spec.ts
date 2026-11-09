import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from './contracts.service';

describe('Arranque AppModule QA sin workers ni proveedores externos', () => {
  let app: INestApplication | undefined;
  afterEach(async () => { await app?.close(); app = undefined; jest.restoreAllMocks(); });

  it('inicializa y apaga sin escrituras, ticks ni envios; solo inspecciona catalogo tributario', async () => {
    // Load the real module graph, but never load the developer's private dotenv.
    const forRoot = ConfigModule.forRoot.bind(ConfigModule);
    jest.spyOn(ConfigModule, 'forRoot').mockImplementation(options => forRoot({ ...options, ignoreEnvFile: true }));
    const { AppModule } = await import('../app.module');
    const config = new ConfigService({
      NODE_ENV: 'test', JWT_SECRET: 'synthetic-qa-startup-not-a-deployment-secret',
      PLAN_CHANGE_PROCESSOR_ENABLED: 'false',
      DATABASE_URL: 'postgresql://qa:synthetic@127.0.0.1:1/qa_unavailable',
      G3_INTEGRATION_ENABLED: 'true', G3_API_URL: 'http://127.0.0.1:1', G3_API_KEY: 'synthetic-local-only',
      G1_INTEGRATION_ENABLED: 'false', G8_INTEGRATION_API_KEYS: '[]',
      WHATSAPP_PROVIDER: 'disabled', WHATSAPP_COMPANIES: '[]',
      MAIL_PROVIDER: 'disabled', BILLING_NOTIFICATION_MODE: 'disabled',
      FACTURACION_CL_INTEGRATION_ENABLED: 'false', FACTURACION_CL_PRODUCTION_ENABLED: 'false',
      FACTURACION_CL_DELIVERY_ENABLED: 'false', FACTURACION_CL_COMPANIES: '[]', FACTURACION_CL_PROFILES: '[]',
      GEOCODING_PROVIDER: 'MANUAL', GEOCODING_API_URL: '',
    });
    const calls: string[] = [];
    const prisma = {
      $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
        const sql = parts.join('?');
        expect(sql.trim()).toMatch(/^SELECT\b/i);
        expect(sql).toContain('information_schema.columns');
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
        calls.push('READ_CATALOG');
        return [{ ready: false, productionReady: false }];
      }),
      // Unexpected application access fails the test, including any database write.
      ...Object.fromEntries(['historialCambioPlan', 'contrato', 'servicioContratado', 'cliente', 'prospecto',
        'taxPaymentJob', 'taxEmissionIntent', 'logNotificacion', 'logAuditoria', 'integracionInstalacionG3',
        'integracionActivacionG1', 'integracionEventoEntrante'].map(name => [name, new Proxy({}, {
          get: (_target, operation) => () => { calls.push(`${name}.${String(operation)}`); throw Error('UNEXPECTED_QA_STARTUP_DB_ACCESS'); },
        })])),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('NO_NETWORK_ALLOWED'));
    const smtpSpy = jest.spyOn(jest.requireActual<typeof import('nodemailer')>('nodemailer'), 'createTransport')
      .mockImplementation(() => { throw new Error('NO_SMTP_ALLOWED'); });
    const timer = jest.spyOn(global, 'setInterval');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue(config)
      .overrideProvider(PrismaService).useValue(prisma).compile();
    const apply = jest.spyOn(module.get(ContractsService), 'applyDuePlanChanges');
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    await app.close();
    app = undefined;
    expect(calls).toEqual(['READ_CATALOG']);
    expect(apply).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(smtpSpy).not.toHaveBeenCalled();
  });
});
