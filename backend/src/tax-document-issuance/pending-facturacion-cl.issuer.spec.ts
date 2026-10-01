import { ConfigService } from '@nestjs/config';
import { FacturacionClConfigService, parseFacturacionClCompanies } from './facturacion-cl-config.service';
import { PendingFacturacionClIssuer } from './pending-facturacion-cl.issuer';

function issuer(values: Record<string, string> = {}) {
  return new PendingFacturacionClIssuer(new FacturacionClConfigService(new ConfigService(values)));
}

describe('PendingFacturacionClIssuer', () => {
  it('permanece deshabilitado por defecto y nunca permite emitir o reintentar', () => {
    expect(issuer().getReadiness(1)).toEqual({
      provider: 'FACTURACION_CL', idEmpresa: 1, companyAlias: null, environment: null,
      state: 'DISABLED', canIssue: false, canRetry: false,
    });
  });

  it('separa configuracion por empresa sin aceptar credenciales en el JSON no secreto', () => {
    const companies = JSON.stringify([
      { idEmpresa: 1, alias: 'FINET', environment: 'sandbox', enabled: true },
      { idEmpresa: 2, alias: 'CABLE_MAGICO', environment: 'production', enabled: false },
    ]);
    const adapter = issuer({ FACTURACION_CL_INTEGRATION_ENABLED: 'true', FACTURACION_CL_COMPANIES: companies });
    expect(adapter.getReadiness(1).state).toBe('PENDIENTE_CONTRATO_FACTURACION_CL');
    expect(adapter.getReadiness(2).state).toBe('COMPANY_DISABLED');
    expect(adapter.getReadiness(3).state).toBe('COMPANY_NOT_CONFIGURED');
    expect(parseFacturacionClCompanies('[{"idEmpresa":1,"alias":"FINET","environment":"sandbox","enabled":true,"clave":"x"}]').valid).toBe(false);
  });

  it('falla cerrado ante JSON, flag o duplicados invalidos', () => {
    expect(issuer({ FACTURACION_CL_COMPANIES: '{' }).getReadiness(1).state).toBe('CONFIGURATION_INVALID');
    expect(issuer({ FACTURACION_CL_INTEGRATION_ENABLED: 'yes' }).getReadiness(1).state).toBe('CONFIGURATION_INVALID');
    const duplicate = JSON.stringify([
      { idEmpresa: 1, alias: 'FINET', environment: 'sandbox', enabled: true },
      { idEmpresa: 1, alias: 'OTRA', environment: 'sandbox', enabled: true },
    ]);
    expect(issuer({ FACTURACION_CL_COMPANIES: duplicate }).getReadiness(1).state).toBe('CONFIGURATION_INVALID');
  });

  it('impide iniciar el modulo con configuracion invalida o habilitacion prematura', () => {
    expect(() => new FacturacionClConfigService(new ConfigService({ FACTURACION_CL_COMPANIES: '{' })).onModuleInit())
      .toThrow('FACTURACION_CL_CONFIGURATION_INVALID');
    expect(() => new FacturacionClConfigService(new ConfigService({ FACTURACION_CL_INTEGRATION_ENABLED: 'true' })).onModuleInit())
      .toThrow('FACTURACION_CL_PENDING_CONTRACT');
    expect(() => new FacturacionClConfigService(new ConfigService({ FACTURACION_CL_INTEGRATION_ENABLED: 'false' })).onModuleInit())
      .not.toThrow();
  });
});
