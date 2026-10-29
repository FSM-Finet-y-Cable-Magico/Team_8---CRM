import { ConfigService } from '@nestjs/config';
import { FacturacionClConfigService } from './facturacion-cl-config.service';
import { FacturacionClPaymentConfig } from './facturacion-cl-payment.config';
import { FacturacionClIssuer } from './facturacion-cl.issuer';
import { PrismaClient } from '@prisma/client';
import { PrismaTaxIntentStore } from './prisma-tax-intent.store';
import { NewTaxIntent, TaxIntentRecord } from './tax-emission-intent.service';

const data: NewTaxIntent = { idEmpresa: 1, idFactura: 10, idPago: 20, ambiente: 'sandbox', businessKey: 'FAKE_IDENTITY', policyVersion: 'FAKE_RULE',
  tipoDte: 33, formato: 2, fingerprint: 'a'.repeat(64), folioEsperado: '126' };
const record: TaxIntentRecord = { ...data, idIntencion: 'FAKE_UUID', estado: 'PENDIENTE', intentos: 0, claimId: null, folio: null, ultimoError: null };
function setup() {
  const mock = {
    factura: { findUnique: jest.fn().mockResolvedValue({ contrato: { idEmpresa: 1, cliente: { idEmpresa: 1, idCliente: 30 } } }) },
    pago: { findUnique: jest.fn().mockResolvedValue({ idFactura: 10, idCliente: 30 }) },
    taxEmissionIntent: {
      upsert: jest.fn().mockResolvedValue(record), findUnique: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue(record),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async callback => callback(mock));
  return { store: new PrismaTaxIntentStore(mock as unknown as PrismaClient), mock };
}

describe('PrismaTaxIntentStore (mock queries, no database migration applied)', () => {
  it('checks financial ownership in a local Serializable transaction before preserving an intent', async () => {
    const { store, mock } = setup();
    await expect(store.prepare(data)).resolves.toEqual(record);
    expect(mock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(mock.taxEmissionIntent.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
  it.each([null, { contrato: { idEmpresa: 2, cliente: { idEmpresa: 1 } } }, { contrato: { idEmpresa: 1, cliente: { idEmpresa: 2 } } }])('rejects an invoice without matching company ownership', async invoice => {
    const { store, mock } = setup();
    mock.factura.findUnique.mockResolvedValue(invoice);
    await expect(store.prepare(data)).rejects.toThrow('TAX_INTENT_COMPANY_MISMATCH');
    expect(mock.taxEmissionIntent.upsert).not.toHaveBeenCalled();
  });
  it('rejects a payment attached to another invoice or customer', async () => {
    for (const payment of [null, { idFactura: 11, idCliente: 30 }, { idFactura: 10, idCliente: 31 }]) {
      const { store, mock } = setup();
      mock.pago.findUnique.mockResolvedValue(payment);
      await expect(store.prepare(data)).rejects.toThrow('TAX_INTENT_PAYMENT_MISMATCH');
      expect(mock.taxEmissionIntent.upsert).not.toHaveBeenCalled();
    }
  });
  it('retrieves an immutable existing row after a uniqueness race', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.upsert.mockRejectedValue({ code: 'P2002' });
    await expect(store.prepare(data)).resolves.toEqual(record);
    expect(mock.taxEmissionIntent.findUnique).toHaveBeenCalledWith({ where: { idEmpresa_ambiente_businessKey: { idEmpresa: 1, ambiente: 'sandbox', businessKey: 'FAKE_IDENTITY' } } });
  });
  it('does not swallow database errors or turn them into an external retry', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.upsert.mockRejectedValue({ code: 'P2034' });
    await expect(store.prepare(data)).rejects.toEqual({ code: 'P2034' });
    expect(mock.taxEmissionIntent.findUnique).not.toHaveBeenCalled();
  });
  it('claims work atomically for the company and refuses a lost claim', async () => {
    const { store, mock } = setup();
    expect(await store.claim(record, 'FAKE_CLAIM')).toBe(true);
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({ where: { idEmpresa:1,ambiente:'sandbox',fechaEnvio:null,OR:[{estado:'PENDIENTE',intentos:0},{estado:'FALLIDO',ultimoError:'CONFIRMED_NOT_SENT'}] },data:{estado:'EN_PROCESO',intentos:{increment:1}} });
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.claim(record, 'FAKE_OTHER_CLAIM')).toBe(false);
  });
  it('requires the same claim owner when persisting completion', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'GENERADO', folio: '126' })).rejects.toThrow('TAX_INTENT_COMPLETION_CONFLICT');
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0].where).toMatchObject({ idEmpresa: 1, estado: 'EN_PROCESO', claimId: 'FAKE_CLAIM' });
  });
  it('marks dispatch once using durable company, owner, fingerprint and null timestamp predicates', async () => {
    const { store, mock } = setup();
    expect(await store.beginDispatch(record, 'FAKE_CLAIM')).toBe(true);
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({
      where: { idEmpresa: 1, idIntencion: record.idIntencion, fingerprint: data.fingerprint, ambiente: 'sandbox',
        estado: 'EN_PROCESO', intentos: {gte:1}, claimId: 'FAKE_CLAIM', fechaEnvio: null },
      data: { fechaEnvio: expect.any(Date) },
    });
    mock.taxEmissionIntent.updateMany.mockResolvedValue({ count: 0 });
    expect(await store.beginDispatch(record, 'FAKE_CLAIM')).toBe(false);
  });
  it('rejects resetting an intent or storing arbitrary remote error text', async () => {
    const { store, mock } = setup();
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'PENDIENTE' as never })).rejects.toThrow('TAX_INTENT_COMPLETION_INPUT_INVALID');
    await expect(store.finish(record, 'FAKE_CLAIM', { estado: 'FALLIDO', ultimoError: 'FAKE_SECRET' })).rejects.toThrow('TAX_INTENT_COMPLETION_INPUT_INVALID');
    expect(mock.taxEmissionIntent.updateMany).not.toHaveBeenCalled();
  });
  it('quarantines stale work without releasing it for another dispatch', async () => {
    const { store, mock } = setup();
    await store.quarantineStale(1, new Date('2026-01-01T00:00:00Z'));
    expect(mock.taxEmissionIntent.updateMany.mock.calls[0][0]).toMatchObject({ where: { idEmpresa: 1, ambiente: 'sandbox', estado: 'EN_PROCESO' }, data: { estado: 'RESULTADO_INDETERMINADO', ultimoError: 'RECONCILIATION_REQUIRED' } });
  });
  it('keeps reads scoped to a company and fails closed on missing records', async () => {
    const { store, mock } = setup();
    mock.taxEmissionIntent.findFirst.mockResolvedValue(null);
    await expect(store.find(2, record.idIntencion)).rejects.toThrow('TAX_INTENT_NOT_FOUND');
    expect(mock.taxEmissionIntent.findFirst).toHaveBeenCalledWith({ where: { idEmpresa: 2, idIntencion: record.idIntencion } });
  });
});


describe('Production query predicates (no real database)',()=>{
  it('keeps production claims, processing markers and completion scoped to their environment',async()=>{
    const {store,mock}=setup();const prod={...record,ambiente:'production'};
    await store.claim(prod,'FAKE_CLAIM');await store.beginDispatch(prod,'FAKE_CLAIM');await store.finish(prod,'FAKE_CLAIM',{estado:'GENERADO',folio:'126'});
    for(const [args] of mock.taxEmissionIntent.updateMany.mock.calls)expect(args.where).toMatchObject({idEmpresa:1,ambiente:'production'});
  });
  it('quarantines production without touching sandbox or releasing it for retry',async()=>{
    const {store,mock}=setup();
    await store.quarantineStale(1,new Date('2026-01-01'),'production');
    expect(mock.taxEmissionIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ambiente:'production'}),data:expect.objectContaining({estado:'RESULTADO_INDETERMINADO'})}));
  });
});


const productionPg = process.env.RUN_TAX_PRODUCTION_QA === 'true' ? describe : describe.skip;
productionPg('Isolated PostgreSQL production preparation (synthetic data and fake transport)',()=>{
  it('applies the new environment rules without changing old rows and deduplicates the full pipeline for both companies',async()=>{
    const url=new URL(process.env.TAX_PRODUCTION_QA_DATABASE_URL??'');
    expect(url.protocol).toBe('postgresql:');expect(url.hostname).toBe('finet-prod-ready-db');
    expect(url.pathname).toBe('/finet_tax_preproduction');expect(url.password).toBe('');
    const prisma=new PrismaClient({datasources:{db:{url:url.href}}});
    // Only this guarded, disposable test database is writable; preserve its baseline sandbox row.
    const fixturePayments=[101,102,103,104,105,106,201];
    await prisma.taxEmissionIntent.deleteMany({where:{idEmpresa:{in:[1,2]},idPago:{in:fixturePayments}}});
    await prisma.taxPaymentJob.deleteMany({where:{idEmpresa:{in:[1,2]},idPago:{in:fixturePayments}}});
    const profiles=[1,2].map(idEmpresa=>({idEmpresa,approved:true,issuerRut:idEmpresa===1?'66666666-6':'11111111-1',
      defaultDocumentType:'BOLETA',receipt:{tipoDte:39,encoding:'utf8',serviceIndicator:3}}));
    const env=new ConfigService({FACTURACION_CL_INTEGRATION_ENABLED:'true',FACTURACION_CL_PRODUCTION_ENABLED:'true',
      FACTURACION_CL_DELIVERY_ENABLED:'true',FACTURACION_CL_COMPANIES:JSON.stringify([1,2].map(idEmpresa=>({idEmpresa,alias:'QA'+idEmpresa,environment:'production',enabled:true}))),
      FACTURACION_CL_PROFILES:JSON.stringify(profiles),
      FACTURACION_CL_QA1_PRODUCTION_CREDENTIALS:JSON.stringify({usuario:'SYNTHETIC_CORP_1',rut:'66666666-6',clave:'SYNTHETIC_ONLY'}),
      FACTURACION_CL_QA2_PRODUCTION_CREDENTIALS:JSON.stringify({usuario:'SYNTHETIC_CORP_2',rut:'11111111-1',clave:'SYNTHETIC_ONLY'})});
    const config=new FacturacionClPaymentConfig(env,new FacturacionClConfigService(env));
    const mail={isConfigured:jest.fn(()=>true),sendTaxDocument:jest.fn(async(_message:unknown)=>({status:'simulated'}))};
    const processing:string[]=[];
    const transport=jest.spyOn(globalThis,'fetch').mockImplementation(async(input,options)=>{
      const u=new URL(input.toString());
      expect(u.protocol).toBe('https:');expect(options?.redirect).toBe('error');
      if(u.origin==='https://rest.facturacion.cl'&&u.pathname==='/login'){
        const c=JSON.parse(String(options?.body));
        expect(['SYNTHETIC_CORP_1','SYNTHETIC_CORP_2']).toContain(c.usuario);
        return new Response(JSON.stringify({token:'SYNTHETIC_TOKEN_'+c.usuario.slice(-1)}));
      }
      if(u.origin==='https://rest.facturacion.cl'&&u.pathname==='/wsds/procesar'){
        const document=Buffer.from(u.searchParams.get('file')!,'base64').toString();
        const token=(options?.headers as Record<string,string>).Authorization;
        processing.push(token);
        if(document.includes('Pago CRM 102 '))throw new Error('SYNTHETIC_TIMEOUT_AFTER_PROCESSING');
        return new Response(JSON.stringify({WSPLANO:{Resultado:'True',Detalle:{Documento:{Resultado:'True',TipoDte:'39',Folio:String(810000000+processing.length)}}}}));
      }
      if(u.origin==='https://rest.facturacion.cl'&&u.pathname==='/wsds/obtenerlink'){
        const link='https://www.facturacion.cl/sistema/descargar.php?fixture=QA_'+u.searchParams.get('folio');
        return new Response(JSON.stringify({WSPLANO:{Mensaje:Buffer.from(link).toString('base64')}}));
      }
      if(u.origin==='https://www.facturacion.cl'&&u.pathname==='/sistema/descargar.php'){
        expect(options?.headers).toBeUndefined();
        return new Response('%PDF-1.7\nSYNTHETIC_QA_ONLY\n',{headers:{'content-type':'application/pdf'}});
      }
      throw new Error('UNEXPECTED_SYNTHETIC_ENDPOINT');
    });
    const issuer=new FacturacionClIssuer(prisma as never,config,mail as never,{record:jest.fn()} as never);
    try{
      await issuer.onModuleInit();issuer.onModuleDestroy();
      expect(issuer.getReadiness(1).state).toBe('READY_PRODUCTION');expect(issuer.getReadiness(2).state).toBe('READY_PRODUCTION');
      expect(await prisma.taxPaymentJob.findUnique({where:{idPago:301}})).toMatchObject({ambiente:'sandbox',estado:'DATOS_REQUERIDOS',nombreCliente:'QA_BASELINE'});
      const context=(idEmpresa:number,idPago:number)=>({idEmpresa,idPago,idFactura:idEmpresa===1?10:20,idCliente:idEmpresa===1?30:40,monto:'100',
        periodoMes:10,periodoAnio:2026,fechaLimitePago:new Date('2026-10-30'),tipoDocumento:null,folioExterno:null,
        receiver:{rut:'66666666-6',name:'SYNTHETIC_ONLY',giro:'',address:'QA',comuna:'QA',city:'QA',email:'qa@example.invalid'}});
      for(const [id,idPago] of [[1,101],[1,102],[2,201]])await prisma.$transaction(tx=>issuer.enqueuePayment(tx,context(id,idPago)));
      expect(await prisma.taxPaymentJob.count({where:{ambiente:'production'}})).toBe(3);
      await Promise.allSettled([issuer.processPayment(101),issuer.processPayment(101)]);
      await issuer.processPayment(101);await issuer.processPayment(201);
      expect(processing).toEqual(['SYNTHETIC_TOKEN_1','SYNTHETIC_TOKEN_2']);
      expect(mail.sendTaxDocument).toHaveBeenCalledTimes(2);
      expect(mail.sendTaxDocument.mock.calls.map(([message])=>(message as {idEmpresa:number}).idEmpresa).sort()).toEqual([1,2]);
      const records=await prisma.taxEmissionIntent.findMany({orderBy:{idEmpresa:'asc'}});
      expect(records).toHaveLength(2);expect(records.every(r=>r.ambiente==='production'&&r.estado==='GENERADO'&&r.emailEstado==='SIMULADO')).toBe(true);
      expect((await issuer.processPayment(102))?.state).toBe('RESULTADO_INDETERMINADO');
      await issuer.processPayment(102);expect(processing).toHaveLength(3);expect(mail.sendTaxDocument).toHaveBeenCalledTimes(2);
      const sandboxEnv=new ConfigService({FACTURACION_CL_INTEGRATION_ENABLED:'true',FACTURACION_CL_COMPANIES:JSON.stringify([{idEmpresa:1,alias:'QA1',environment:'sandbox',enabled:true}]),
        FACTURACION_CL_PROFILES:JSON.stringify([profiles[0]]),FACTURACION_CL_QA1_SANDBOX_CREDENTIALS:JSON.stringify({usuario:'SYNTHETIC_CORP_1',rut:'66666666-6',clave:'SYNTHETIC_ONLY'})});
      const switched=new FacturacionClIssuer(prisma as never,new FacturacionClPaymentConfig(sandboxEnv,new FacturacionClConfigService(sandboxEnv)),mail as never,{record:jest.fn()} as never);
      await switched.onModuleInit();switched.onModuleDestroy();
      expect(await switched.processPayment(101)).toEqual({state:'DATOS_REQUERIDOS',code:'ENVIRONMENT_CHANGED'});
      expect(processing).toHaveLength(3);
      const history=await switched.paymentState(101,{idUsuario:99,idEmpresa:1,roles:['Administrador'],email:null,nombreCompleto:'QA'});
      expect(history.intention?.ambiente).toBe('production');
      const reserved=(idPago:number,ambiente:string)=>({idEmpresa:1,idFactura:10,idCliente:30,idPago,ambiente,monto:'100',
        policyVersion:'PER_PAYMENT_V1',profileHash:'a'.repeat(64),documento:Buffer.from('FICTIONAL_ONLY'),tipoDte:33,formato:2,folioEsperado:'555',nombreCliente:'QA'});
      await prisma.taxPaymentJob.create({data:reserved(103,'sandbox')});await prisma.taxPaymentJob.create({data:reserved(104,'production')});
      await expect(prisma.taxPaymentJob.create({data:reserved(105,'production')})).rejects.toMatchObject({code:'P2002'});
      await expect(prisma.taxPaymentJob.create({data:{...reserved(103,'production'),folioEsperado:'556'}})).rejects.toMatchObject({code:'P2002'});
      await expect(prisma.taxPaymentJob.create({data:reserved(106,'unknown')})).rejects.toThrow();
    }finally{issuer.onModuleDestroy();transport.mockRestore();await prisma.$disconnect();}
  },60000);
});
