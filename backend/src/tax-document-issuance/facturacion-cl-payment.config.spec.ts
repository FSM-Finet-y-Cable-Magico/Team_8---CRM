import { ConfigService } from '@nestjs/config';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClPaymentConfig, parsePaymentTaxProfiles } from './facturacion-cl-payment.config';
const profile={idEmpresa:2,approved:true,issuerRut:'66666666-6',defaultDocumentType:'BOLETA',receipt:{tipoDte:39,encoding:'utf8',serviceIndicator:3}};
describe('Payment tax profiles',()=>{
  it('defaults to no profiles; requires explicit approval and valid tax identity',()=>{
    expect(parsePaymentTaxProfiles()).toEqual([]);
    expect(parsePaymentTaxProfiles(JSON.stringify([profile]))).toEqual([profile]);
    for(const bad of [{...profile,approved:false},{...profile,issuerRut:'66666666-1'},{...profile,password:'FORBIDDEN'},profile, {...profile,receipt:null}]) {
      const value=bad===profile?[profile,profile]:[bad];
      expect(()=>parsePaymentTaxProfiles(JSON.stringify(value))).toThrow('FACTURACION_CL_PROFILES_INVALID');
    }
  });
  it('requires invoice folios and an explicit rate; rejects guessed zero folios',()=>{
    for(const invoice of [undefined,{tipoDte:33,folioFrom:'0',folioTo:'100',vatRate:'19'},{tipoDte:33,folioFrom:'1',folioTo:'100'}]) {
      expect(()=>parsePaymentTaxProfiles(JSON.stringify([{...profile,defaultDocumentType:'FACTURA',invoice}]))).toThrow();
    }
  });
  it('accepts the observed short sandbox access identity only for receipts, never for invoice or customer identity',()=>{
    expect(parsePaymentTaxProfiles(JSON.stringify([{...profile,issuerRut:'1-9'}]))[0].issuerRut).toBe('1-9');
    expect(()=>parsePaymentTaxProfiles(JSON.stringify([{...profile,issuerRut:'1-9',invoice:{tipoDte:34,folioFrom:'1',folioTo:'100'}}]))).toThrow();
  });
  it('isolates credentials by company and checks the issuer RUT without exposing secrets',()=>{
    const values={FACTURACION_CL_COMPANIES:JSON.stringify([{idEmpresa:2,alias:'CM',environment:'sandbox',enabled:true}]),FACTURACION_CL_PROFILES:JSON.stringify([profile]),FACTURACION_CL_CM_SANDBOX_CREDENTIALS:JSON.stringify({usuario:'FAKE',rut:'66666666-6',clave:'FAKE'})};
    const env=new ConfigService(values); const cfg=new FacturacionClPaymentConfig(env,new FacturacionClConfigService(env));
    expect(cfg.credentials(2).usuario).toBe('FAKE');
    expect(()=>cfg.credentials(1)).toThrow('TEST_CREDENTIALS_MISSING');
    env.set('FACTURACION_CL_CM_SANDBOX_CREDENTIALS',JSON.stringify({usuario:'FAKE',rut:'11111111-1',clave:'FAKE'}));
    expect(()=>cfg.credentials(2)).toThrow('TEST_CREDENTIALS_MISSING');
  });
});


describe('Production credentials remain explicit and isolated',()=>{
  const values=()=>({FACTURACION_CL_INTEGRATION_ENABLED:'false',FACTURACION_CL_PRODUCTION_ENABLED:'true',
    FACTURACION_CL_COMPANIES:JSON.stringify([{idEmpresa:2,alias:'CM',environment:'production',enabled:true}]),
    FACTURACION_CL_PROFILES:JSON.stringify([profile]),
    FACTURACION_CL_CM_PRODUCTION_CREDENTIALS:JSON.stringify({usuario:'SYNTHETIC_PROD',rut:'66.666.666-6',clave:'SYNTHETIC_ONLY'})});
  function config(v:Record<string,string>){const e=new ConfigService(v);return new FacturacionClPaymentConfig(e,new FacturacionClConfigService(e));}
  it('selects only the production secret and normalizes the RUT without changing the password',()=>{
    const v=values();v['FACTURACION_CL_CM_SANDBOX_CREDENTIALS' as keyof typeof v]=JSON.stringify({usuario:'WRONG_REALM',rut:'66666666-6',clave:'WRONG'});
    expect(config(v).credentials(2)).toEqual({usuario:'SYNTHETIC_PROD',rut:'66666666-6',clave:'SYNTHETIC_ONLY'});
  });
  it('refuses missing opt-in or a missing production secret instead of borrowing sandbox',()=>{
    const v:Record<string,string>=values();v.FACTURACION_CL_PRODUCTION_ENABLED='false';
    expect(()=>config(v).credentials(2)).toThrow('PRODUCTION_CREDENTIALS_MISSING');
    v.FACTURACION_CL_PRODUCTION_ENABLED='true';delete v.FACTURACION_CL_CM_PRODUCTION_CREDENTIALS;
    v.FACTURACION_CL_CM_SANDBOX_CREDENTIALS=JSON.stringify({usuario:'FAKE',rut:'66666666-6',clave:'FAKE'});
    expect(()=>config(v).credentials(2)).toThrow('PRODUCTION_CREDENTIALS_MISSING');
  });
  it('rejects DEMO credentials, invalid identities and issuer mismatches in production',()=>{
    for(const credentials of [{usuario:'DEMOFE',rut:'66666666-6',clave:'FAKE'},{usuario:'FAKE',rut:'1-9',clave:'FAKE'},
      {usuario:'FAKE',rut:'11111111-1',clave:'FAKE'}]){
      const v=values();v.FACTURACION_CL_CM_PRODUCTION_CREDENTIALS=JSON.stringify(credentials);
      expect(()=>config(v).credentials(2)).toThrow('PRODUCTION_CREDENTIALS_MISSING');
    }
  });
});
