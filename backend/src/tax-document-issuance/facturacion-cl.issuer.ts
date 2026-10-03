import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, TaxPaymentJob } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { todayDateOnly } from '../common/date-rules';
import { hasRole, isAdministrator } from '../common/roles';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateRut } from '../rut/rut.util';
import { BuiltTaxDocument, buildInvoiceDocument, buildReceiptDocument, matchesIssuedFolio } from './facturacion-cl-document-builder';
import { FacturacionClArtifactsClient } from './facturacion-cl-artifacts.client';
import { FacturacionClPaymentConfig, PAYMENT_TAX_POLICY, PaymentTaxProfile } from './facturacion-cl-payment.config';
import { FacturacionClSandboxDispatcher } from './facturacion-cl-sandbox-dispatcher';
import { PrismaTaxIntentStore } from './prisma-tax-intent.store';
import { TaxEmissionIntentService, TaxIntentInput } from './tax-emission-intent.service';
import { PaymentTaxContext, TaxDocumentIssuer, TaxDocumentIssuerReadiness, TaxDocumentIssuerState } from './tax-document-issuer.types';

@Injectable()
export class FacturacionClIssuer implements TaxDocumentIssuer, OnModuleInit, OnModuleDestroy {
  private databaseReady = false;
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  readonly store: PrismaTaxIntentStore;
  readonly intents: TaxEmissionIntentService;
  readonly artifacts: FacturacionClArtifactsClient;

  constructor(private readonly prisma: PrismaService, private readonly config: FacturacionClPaymentConfig,
    private readonly mail: MailService, private readonly audit: AuditService) {
    this.store = new PrismaTaxIntentStore(prisma);
    const snapshot = config.base.snapshot();
    const options = { enabled: snapshot.enabled, companies: snapshot.companies.filter(c => c.environment === 'sandbox')
      .map(c => ({ idEmpresa:c.idEmpresa, enabled:c.enabled, environment:'sandbox' as const })), credentials:async (id:number) => config.credentials(id) };
    const contracts = config.profiles.map(p => ({ idEmpresa:p.idEmpresa, approved:true, environment:'sandbox' as const,
      policyVersion:PAYMENT_TAX_POLICY, allowedDteTypes:[p.receipt.tipoDte, ...(p.invoice ? [p.invoice.tipoDte] : [])] }));
    this.intents = new TaxEmissionIntentService(this.store, new FacturacionClSandboxDispatcher(options,this.store,contracts,snapshot.enabled));
    this.artifacts = new FacturacionClArtifactsClient(options);
  }

  async onModuleInit() {
    const rows = await this.prisma.$queryRaw<Array<{ ready:boolean }>>`SELECT
      NOT EXISTS (SELECT 1 FROM (VALUES
        ('tax_payment_job','id_trabajo'),('tax_payment_job','id_empresa'),('tax_payment_job','id_factura'),('tax_payment_job','id_pago'),
        ('tax_payment_job','id_cliente'),('tax_payment_job','monto'),('tax_payment_job','ambiente'),('tax_payment_job','policy_version'),
        ('tax_payment_job','profile_hash'),('tax_payment_job','documento'),('tax_payment_job','tipo_dte'),('tax_payment_job','formato'),
        ('tax_payment_job','folio_esperado'),('tax_payment_job','email'),('tax_payment_job','nombre_cliente'),('tax_payment_job','estado'),
        ('tax_payment_job','ultimo_error'),('tax_payment_job','fecha_creacion'),
        ('tax_emission_intent','id_intencion'),('tax_emission_intent','id_empresa'),('tax_emission_intent','id_factura'),('tax_emission_intent','id_pago'),
        ('tax_emission_intent','business_key'),('tax_emission_intent','policy_version'),('tax_emission_intent','ambiente'),('tax_emission_intent','proveedor'),
        ('tax_emission_intent','tipo_dte'),('tax_emission_intent','formato'),('tax_emission_intent','fingerprint'),('tax_emission_intent','folio_esperado'),
        ('tax_emission_intent','estado'),('tax_emission_intent','intentos'),('tax_emission_intent','claim_id'),('tax_emission_intent','folio'),
        ('tax_emission_intent','ultimo_error'),('tax_emission_intent','fecha_creacion'),('tax_emission_intent','fecha_inicio'),
        ('tax_emission_intent','fecha_envio'),('tax_emission_intent','fecha_actualizacion'),('tax_emission_intent','artefacto_url'),
        ('tax_emission_intent','artefacto_estado'),('tax_emission_intent','email_estado'),('tax_emission_intent','fecha_email_inicio')
      ) AS required(table_name,column_name) LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=required.table_name AND c.column_name=required.column_name
      WHERE c.column_name IS NULL) AS ready`;
    this.databaseReady = rows[0]?.ready === true;
    if (!this.config.base.snapshot().enabled) return;
    if (!this.databaseReady) throw new Error('FACTURACION_CL_MIGRATION_REQUIRED');
    this.timer = setInterval(() => { void this.drain().catch(() => undefined); }, 15000);
    this.timer.unref();
    // No provider call during startup: recovery runs only from persisted pending work.
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  getReadiness(idEmpresa:number): TaxDocumentIssuerReadiness {
    const snapshot = this.config.base.snapshot(), company = snapshot.companies.find(c => c.idEmpresa === idEmpresa);
    let state:TaxDocumentIssuerState = 'READY_SANDBOX';
    if (!snapshot.valid) state='CONFIGURATION_INVALID';
    else if (!snapshot.enabled) state='DISABLED';
    else if (!company) state='COMPANY_NOT_CONFIGURED';
    else if (!company.enabled) state='COMPANY_DISABLED';
    else if (company.environment !== 'sandbox') state='PRODUCTION_NOT_CERTIFIED';
    else if (!this.config.profile(idEmpresa)) state='PENDIENTE_CONTRATO_FACTURACION_CL';
    else if (!this.databaseReady) state='MIGRATION_REQUIRED';
    else { try { this.config.credentials(idEmpresa); } catch { state='CREDENTIALS_MISSING'; } }
    return { provider:'FACTURACION_CL', idEmpresa, companyAlias:company?.alias ?? null,
      environment:company?.environment ?? null, state, canIssue:state==='READY_SANDBOX', canRetry:false };
  }

  /** Called inside the payment transaction: local writes only, no auth/HTTP/SMTP. */
  async enqueuePayment(tx:Prisma.TransactionClient, input:PaymentTaxContext) {
    const snapshot = this.config.base.snapshot();
    if (!snapshot.enabled || !snapshot.companies.some(c => c.idEmpresa === input.idEmpresa && c.enabled && c.environment === 'sandbox')) return;
    const profile = this.config.profile(input.idEmpresa);
    let document:BuiltTaxDocument | undefined; let code:string | null = null;
    try {
      if (!profile) throw new Error('FISCAL_PROFILE_MISSING');
      if (input.folioExterno || await tx.documentoTributarioExterno.count({ where:{ idEmpresa:input.idEmpresa,idFactura:input.idFactura,estado:'REGISTRADO' } })) {
        throw new Error('EXISTING_TAX_DOCUMENT_REVIEW_REQUIRED');
      }
      document = await this.buildPaymentDocument(tx,input,profile);
    } catch (error) {
      const candidate = (error as Error)?.message;
      const known = ['FISCAL_PROFILE_MISSING','EXISTING_TAX_DOCUMENT_REVIEW_REQUIRED','FISCAL_FOLIOS_REQUIRED','FISCAL_ROUNDING_REQUIRED','FISCAL_IDENTITY_INVALID','DOCUMENT_TYPE_UNSUPPORTED','FISCAL_DATA_INVALID','DTE_INPUT_INVALID_OR_UNSUPPORTED'];
      if (!known.includes(candidate)) throw error; // DB failure cannot be disguised as invalid fiscal data.
      code = candidate === 'DTE_INPUT_INVALID_OR_UNSUPPORTED' ? 'FISCAL_DATA_INVALID' : candidate;
    }
    await tx.taxPaymentJob.create({ data:{ idEmpresa:input.idEmpresa,idFactura:input.idFactura,idPago:input.idPago,idCliente:input.idCliente,
      monto:input.monto, policyVersion:PAYMENT_TAX_POLICY, profileHash:profile ? this.config.profileHash(profile) : '0'.repeat(64),
      documento:document?.bytes, tipoDte:document?.tipoDte, formato:document?.formato, folioEsperado:document?.folio,
      email:input.receiver.email, nombreCliente:input.receiver.name, estado:document ? 'PENDIENTE' : 'DATOS_REQUERIDOS', ultimoError:code } });
  }

  private async buildPaymentDocument(tx:Prisma.TransactionClient, input:PaymentTaxContext, profile:PaymentTaxProfile) {
    const receiverRut = validateRut(input.receiver.rut);
    if (!receiverRut.valid) throw new Error('FISCAL_IDENTITY_INVALID');
    const receiver = { ...input.receiver, rut:receiverRut.normalized! };
    const paid = new Prisma.Decimal(input.monto);
    if (!paid.isInteger() || paid.lte(0)) throw new Error('FISCAL_ROUNDING_REQUIRED');
    const total = paid.toFixed(0), issueDate=todayDateOnly();
    const family = input.tipoDocumento?.trim().toUpperCase() || profile.defaultDocumentType;
    const description = `Pago CRM ${input.idPago} - documento de cobro ${input.idFactura}`;
    if (family === 'BOLETA') {
      if (!Number.isInteger(input.periodoMes) || input.periodoMes < 1 || input.periodoMes > 12 || !Number.isInteger(input.periodoAnio) || input.periodoAnio < 2000 || input.periodoAnio > 9999) throw new Error('FISCAL_DATA_INVALID');
      const periodFrom = `${input.periodoAnio}-${String(input.periodoMes).padStart(2,'0')}-01`;
      const periodTo = new Date(Date.UTC(input.periodoAnio,input.periodoMes,0)).toISOString().slice(0,10);
      return buildReceiptDocument({ ...profile.receipt, folio:'0', folioMode:'provider_auto', issueDate, receiver,
        items:[{ description,quantity:'1',unitPrice:total,amount:total }], total,
        ...(profile.receipt.serviceIndicator !== 3 ? { periodFrom,periodTo,dueDate:input.fechaLimitePago.toISOString().slice(0,10) } : {}) });
    }
    if (family !== 'FACTURA') throw new Error('DOCUMENT_TYPE_UNSUPPORTED');
    if (!profile.invoice) throw new Error('FISCAL_FOLIOS_REQUIRED');
    const invoice = profile.invoice;
    // Only an explicitly authorized, exclusively reserved local folio range is used.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${input.idEmpresa},${invoice.tipoDte})`;
    const used = await tx.$queryRaw<Array<{ maximum:bigint | null }>>`SELECT MAX(folio_esperado::BIGINT) AS maximum
      FROM tax_payment_job WHERE id_empresa=${input.idEmpresa} AND tipo_dte=${invoice.tipoDte} AND folio_esperado <> '0'`;
    const start=BigInt(invoice.folioFrom), next=used[0]?.maximum === null || !used[0] ? start : (BigInt(used[0].maximum!) + 1n > start ? BigInt(used[0].maximum!) + 1n : start);
    if (next > BigInt(invoice.folioTo)) throw new Error('FISCAL_FOLIOS_REQUIRED');
    const divisor = new Prisma.Decimal(100).plus(invoice.vatRate || 0);
    const net = invoice.tipoDte === 33 ? paid.mul(100).div(divisor) : new Prisma.Decimal(0);
    if (!net.isInteger()) throw new Error('FISCAL_ROUNDING_REQUIRED');
    const itemAmount=invoice.tipoDte === 33 ? net.toFixed(0) : total;
    return buildInvoiceDocument({ tipoDte:invoice.tipoDte,folio:String(next),issueDate,receiver,issuerRut:profile.issuerRut,paymentForm:1,
      net:net.toFixed(0),exempt:invoice.tipoDte === 34 ? total : '0',vat:invoice.tipoDte === 33 ? paid.minus(net).toFixed(0) : '0',
      ...(invoice.vatRate ? { vatRate:invoice.vatRate } : {}),total,items:[{description,quantity:'1',unitPrice:itemAmount,amount:itemAmount}] });
  }

  private intentInput(job:TaxPaymentJob): TaxIntentInput {
    if (!job.documento || !job.tipoDte || !job.formato || !job.folioEsperado) throw new Error('TAX_JOB_DOCUMENT_MISSING');
    return { idEmpresa:job.idEmpresa,idFactura:job.idFactura,idPago:job.idPago,businessKey:`PAYMENT:${job.idPago}`,
      policyVersion:job.policyVersion,ambiente:'sandbox',document:{ bytes:Buffer.from(job.documento),
        tipoDte:job.tipoDte as BuiltTaxDocument['tipoDte'],formato:job.formato as 1|2,folio:job.folioEsperado,
        ...(job.folioEsperado==='0' ? { folioMode:'provider_auto' as const } : {}) } };
  }

  /** Runs after commit; never changes Pago/Factura or retries a processing request. */
  async processPayment(idPago:number, explicitRetry=false) {
    if (!this.config.base.snapshot().enabled || !this.databaseReady) return { state:'DISABLED' };
    const job=await this.prisma.taxPaymentJob.findUnique({ where:{idPago} });
    if (!job) return { state:'NOT_QUEUED' };
    if (job.estado==='DATOS_REQUERIDOS') return { state:job.estado,code:job.ultimoError };
    const profile=this.config.profile(job.idEmpresa);
    if (!profile || this.config.profileHash(profile)!==job.profileHash) {
      await this.prisma.taxPaymentJob.update({where:{idPago},data:{estado:'DATOS_REQUERIDOS',ultimoError:'CONFIGURATION_CHANGED'}});
      return { state:'DATOS_REQUERIDOS',code:'CONFIGURATION_CHANGED' };
    }
    if (!this.getReadiness(job.idEmpresa).canIssue) return {state:this.getReadiness(job.idEmpresa).state};
    const existing=await this.prisma.taxEmissionIntent.findUnique({ where:{idEmpresa_ambiente_businessKey:{ idEmpresa:job.idEmpresa,ambiente:'sandbox',businessKey:`PAYMENT:${idPago}` }} });
    if (existing?.estado==='FALLIDO' && !explicitRetry) return { state:existing.estado,code:existing.ultimoError };
    const record=await this.intents.execute(this.intentInput(job));
    if (['GENERADO','FALLIDO','RESULTADO_INDETERMINADO'].includes(record.estado)) {
      await this.prisma.taxPaymentJob.update({where:{idPago},data:{estado:'PROCESADO'}});
    }
    if (record.estado==='GENERADO') await this.finishArtifactsAndDelivery(job,record.idIntencion);
    return {state:record.estado,idIntencion:record.idIntencion,folio:record.folio};
  }

  private async finishArtifactsAndDelivery(job:TaxPaymentJob, idIntencion:string) {
    const record=await this.prisma.taxEmissionIntent.findFirst({ where:{idIntencion,idEmpresa:job.idEmpresa,estado:'GENERADO'} });
    if (!record?.folio) return;
    let link=record.artefactoUrl;
    if (!link || record.artefactoEstado==='FALLIDO') {
      try { link=await this.artifacts.getLink(job.idEmpresa,record.tipoDte,record.folio);
        await this.prisma.taxEmissionIntent.update({where:{idIntencion},data:{artefactoUrl:link,artefactoEstado:'PENDIENTE'}});
      } catch { await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,artefactoUrl:null},data:{artefactoEstado:'FALLIDO'}}); return; }
    }
    if (record.artefactoEstado==='DISPONIBLE' && ['ENVIADO','RESULTADO_INDETERMINADO','EN_PROCESO','SIN_DESTINATARIO'].includes(record.emailEstado)) return;
    let pdf:Buffer;
    try { pdf=await this.artifacts.downloadPdf(link);
      await this.prisma.taxEmissionIntent.update({where:{idIntencion},data:{artefactoEstado:'DISPONIBLE'}});
    } catch { await this.prisma.taxEmissionIntent.update({where:{idIntencion},data:{artefactoEstado:'FALLIDO'}}); return; }
    if (!this.config.deliveryEnabled() || !this.mail.isConfigured()) {
      await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,emailEstado:{in:['PENDIENTE','NO_CONFIGURADO']}},data:{emailEstado:'NO_CONFIGURADO'}}); return;
    }
    if (!job.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.email)) {
      await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,emailEstado:{in:['PENDIENTE','NO_CONFIGURADO']}},data:{emailEstado:'SIN_DESTINATARIO'}}); return;
    }
    if (!['PENDIENTE','NO_CONFIGURADO'].includes(record.emailEstado)) return;
    // Claim immediately before SMTP. A timeout after DATA must not resend on replay.
    const claimed=await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,idEmpresa:job.idEmpresa,emailEstado:{in:['PENDIENTE','NO_CONFIGURADO']}},data:{emailEstado:'EN_PROCESO',fechaEmailInicio:new Date()}});
    if (!claimed.count) return;
    try {
      const result=await this.mail.sendTaxDocument({to:job.email,customerName:job.nombreCliente,tipoDte:record.tipoDte,folio:record.folio,idPago:job.idPago,pdf,filename:`dte-${record.tipoDte}-${record.folio}.pdf`});
      await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,emailEstado:'EN_PROCESO'},data:{emailEstado:result.status==='sent' ? 'ENVIADO' : 'NO_CONFIGURADO'}});
    } catch { await this.prisma.taxEmissionIntent.updateMany({where:{idIntencion,emailEstado:'EN_PROCESO'},data:{emailEstado:'RESULTADO_INDETERMINADO'}}); }
  }

  private async drain() {
    if (this.draining) return; this.draining=true;
    try {
      for (const company of this.config.base.snapshot().companies.filter(c=>c.enabled && c.environment==='sandbox')) {
        await this.store.quarantineStale(company.idEmpresa,new Date(Date.now()-5*60*1000));
        await this.prisma.taxEmissionIntent.updateMany({where:{idEmpresa:company.idEmpresa,emailEstado:'EN_PROCESO',fechaEmailInicio:{lt:new Date(Date.now()-5*60*1000)}},data:{emailEstado:'RESULTADO_INDETERMINADO'}});
      }
      const companyIds=this.config.base.snapshot().companies.filter(c=>c.enabled && c.environment==='sandbox').map(c=>c.idEmpresa);
      const jobs=await this.prisma.taxPaymentJob.findMany({where:{estado:'PENDIENTE',idEmpresa:{in:companyIds}},orderBy:{fechaCreacion:'asc'},take:10});
      for (const job of jobs) { try { await this.processPayment(job.idPago); } catch { /* Persisted work remains; no raw errors/PII logged. */ } }
    } finally { this.draining=false; }
  }

  async assertPaymentAccess(idPago:number,user:AuthUser) {
    if (!isAdministrator(user.roles) && !hasRole(user.roles,'Comercial') && !hasRole(user.roles,'Soporte')) throw new ForbiddenException('Sin permiso de cobranza');
    const payment=await this.prisma.pago.findUnique({where:{idPago},select:{idCliente:true,factura:{select:{contrato:{select:{idCliente:true,idEmpresa:true,cliente:{select:{idEmpresa:true}}}}}}}});
    const contract=payment?.factura?.contrato;
    if (!contract?.idEmpresa || contract.cliente?.idEmpresa!==contract.idEmpresa || contract.idCliente!==payment?.idCliente ||
        (!isAdministrator(user.roles) && user.idEmpresa!==contract.idEmpresa)) throw new NotFoundException('Pago no encontrado en este alcance');
    return contract.idEmpresa;
  }
  async paymentState(idPago:number,user:AuthUser) {
    const idEmpresa=await this.assertPaymentAccess(idPago,user), readiness=this.getReadiness(idEmpresa);
    if (!this.databaseReady) return {readiness,intention:null,job:null};
    const job=await this.prisma.taxPaymentJob.findFirst({where:{idPago,idEmpresa},select:{estado:true,ultimoError:true}});
    const intention=await this.prisma.taxEmissionIntent.findUnique({where:{idEmpresa_ambiente_businessKey:{idEmpresa,ambiente:'sandbox',businessKey:`PAYMENT:${idPago}`}},
      select:{idIntencion:true,estado:true,tipoDte:true,ambiente:true,folio:true,fingerprint:true,intentos:true,ultimoError:true,artefactoUrl:true,artefactoEstado:true,emailEstado:true}});
    return {readiness,job,intention};
  }
  async retryPayment(idPago:number,user:AuthUser) {
    await this.assertPaymentAccess(idPago,user);
    const status=await this.paymentState(idPago,user);
    if (status.intention?.estado!=='FALLIDO' || status.intention.ultimoError!=='CONFIRMED_NOT_SENT') throw new BadRequestException('Solo se reintenta un fallo confirmado anterior al envio');
    return this.processPayment(idPago,true);
  }
  async recoverArtifacts(idPago:number,user:AuthUser) {
    const idEmpresa=await this.assertPaymentAccess(idPago,user);
    const job=await this.prisma.taxPaymentJob.findFirst({where:{idPago,idEmpresa}});
    const record=await this.prisma.taxEmissionIntent.findUnique({where:{idEmpresa_ambiente_businessKey:{idEmpresa,ambiente:'sandbox',businessKey:`PAYMENT:${idPago}`}}});
    if (!job || record?.estado!=='GENERADO') throw new BadRequestException('El documento no esta confirmado como generado');
    await this.finishArtifactsAndDelivery(job,record.idIntencion);
    return this.paymentState(idPago,user);
  }
  /** Manual reconciliation: operator verifies the document; the API only reads its artifact. */
  async reconcilePayment(idPago:number, input:{folio:string;fingerprint:string;confirmSameDocument:boolean;observation:string}, user:AuthUser) {
    const idEmpresa=await this.assertPaymentAccess(idPago,user);
    if (!isAdministrator(user.roles)) throw new ForbiddenException('La conciliacion requiere Administrador');
    if (input.confirmSameDocument!==true || !input.observation?.trim() || input.observation.length>1000) throw new BadRequestException('Revisa el documento remoto e informa la comprobacion');
    const record=await this.prisma.taxEmissionIntent.findUnique({where:{idEmpresa_ambiente_businessKey:{idEmpresa,ambiente:'sandbox',businessKey:`PAYMENT:${idPago}`}}});
    if (record?.estado!=='RESULTADO_INDETERMINADO' || record.fingerprint!==input.fingerprint || !matchesIssuedFolio(record.folioEsperado,input.folio,record.tipoDte)) throw new BadRequestException('La identidad o el estado no permiten conciliar');
    const link=await this.artifacts.getLink(idEmpresa,record.tipoDte,input.folio);
    await this.artifacts.downloadPdf(link); // Reject HTML/error representations even with a valid host.
    await this.prisma.$transaction(async tx=>{
      const changed=await tx.taxEmissionIntent.updateMany({where:{idIntencion:record.idIntencion,idEmpresa,estado:'RESULTADO_INDETERMINADO',fingerprint:input.fingerprint},data:{estado:'GENERADO',folio:input.folio,ultimoError:null,artefactoUrl:link,artefactoEstado:'DISPONIBLE'}});
      if (changed.count!==1) throw new BadRequestException('La conciliacion cambio; vuelve a consultar');
      await this.audit.record({idUsuario:user.idUsuario,accion:'CONCILIAR_DTE_MANUAL',entidadAfectada:'tax_emission_intent',valorNuevo:{idEmpresa,idPago,folio:input.folio,tipoDte:record.tipoDte,observation:input.observation.trim()}},tx);
    });
    return this.recoverArtifacts(idPago,user);
  }
}
