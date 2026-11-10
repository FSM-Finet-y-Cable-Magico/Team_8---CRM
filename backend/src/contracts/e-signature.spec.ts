import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { signatureSettings } from './e-signature.config';
import { ESignatureService } from './e-signature.service';
import { SignaturePublicGuard } from './e-signature.controller';
const settings = () => ({ NODE_ENV: 'test', CONTRACT_SIGNATURE_ENABLED: 'true',
  CONTRACT_SIGNATURE_PUBLIC_URL: 'http://localhost/', CONTRACT_SIGNATURE_COMPANIES: '[1,2]',
  CONTRACT_SIGNATURE_OTP_SECRET: randomBytes(32).toString('hex') });
describe('Configuración de firma y compatibilidad apagada', () => {
  it('apagada y sin tabla privada permite el legado expresamente autorizado sin SMTP', async () => {
    const db = { contrato: { findUnique: jest.fn().mockResolvedValue({ idContrato: 99, idEmpresa: 1, estado: 'Pendiente firma contrato' }) },
      contratoDigital: { findFirst: jest.fn().mockResolvedValue({ idEmpresa: 1, estadoFirma: 'Generado' }) },
      logAuditoria: { findFirst: jest.fn().mockResolvedValue(null) }, $queryRaw: jest.fn().mockResolvedValue([]), $transaction: jest.fn() };
    db.$transaction.mockImplementation(async fn => fn(db));
    const mail = { isConfigured: jest.fn() };
    const service = new ESignatureService(db as never, new ConfigService({ CONTRACT_SIGNATURE_MANUAL_COMPANIES: '[1]', CONTRACT_SIGNATURE_MANUAL_CONTRACTS: '[99]' }), mail as never, {} as never, {} as never);
    await service.onModuleInit();
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(await service.status(99, { idEmpresa: 1, roles: ['Comercial'] } as never)).toMatchObject({ enabled: false, policy: { mode: 'manual', manualAllowed: true } });
    expect(mail.isConfigured).not.toHaveBeenCalled();
    await expect(service.create(99, {} as never)).rejects.toThrow('Función no disponible');
  });
  it.each(['yes', '1', 'TRUE'])('rechaza flag ambiguo %s', flag => {
    expect(() => signatureSettings(new ConfigService({ CONTRACT_SIGNATURE_ENABLED: flag }))).toThrow('FLAG_INVALID');
  });
  it.each(['https://user:pass@example.invalid/', 'http://example.invalid/', 'https://example.invalid/?key=x',
    'https://example.invalid/otra-ruta'])('rechaza origen público inseguro o ambiguo %s', url => {
    expect(() => signatureSettings(new ConfigService({ ...settings(), CONTRACT_SIGNATURE_PUBLIC_URL: url }))).toThrow('PUBLIC_URL_INVALID');
  });
  it('exige secreto aleatorio independiente y empresas sin duplicar', () => {
    expect(() => signatureSettings(new ConfigService({ ...settings(), CONTRACT_SIGNATURE_OTP_SECRET: '' }))).toThrow('OTP_SECRET_INVALID');
    expect(() => signatureSettings(new ConfigService({ ...settings(), CONTRACT_SIGNATURE_COMPANIES: '[1,1]' }))).toThrow('COMPANIES_INVALID');
  });
  it('producción requiere HTTPS, SMTP y aprobación legal y de respaldo', () => {
    expect(() => signatureSettings(new ConfigService({ ...settings(), NODE_ENV: 'production',
      CONTRACT_SIGNATURE_PUBLIC_URL: 'https://crm.example.invalid/' }))).toThrow('ACTIVATION_NOT_APPROVED');
  });
  it('el presupuesto por IP devuelve 429 y las ventanas se reinician', () => {
    const guard = new SignaturePublicGuard(new ConfigService(settings()));
    const context = { switchToHttp: () => ({ getRequest: () => ({ ip: '127.0.0.1', socket: {} }),
      getResponse: () => ({ setHeader: jest.fn() }) }) };
    for (let n = 0; n < 30; n++) expect(guard.canActivate(context as never)).toBe(true);
    expect(() => guard.canActivate(context as never)).toThrow('Espera un minuto');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
    try { expect(guard.canActivate(context as never)).toBe(true); } finally { jest.restoreAllMocks(); }
  });
  it('la barrera pública permanece cerrada cuando la firma está apagada', () => {
    expect(() => new SignaturePublicGuard(new ConfigService({})).canActivate({} as never)).toThrow('Función no disponible');
  });
});
