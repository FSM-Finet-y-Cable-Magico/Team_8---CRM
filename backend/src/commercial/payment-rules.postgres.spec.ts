import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { G2IntegrationService } from '../g2-integration/g2-integration.service';
import { CommercialControlBookService } from './commercial-control-book.service';
import { CommercialStatusService } from './commercial-status.service';

const integration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;
const rollback = new Error('ROLLBACK_PAYMENT_RULES');

integration('Reglas comerciales en PostgreSQL local, con rollback', () => {
  const prisma = new PrismaClient();
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('Esta prueba requiere una base local');
    await prisma.$connect();
  });
  afterAll(() => prisma.$disconnect());

  it('comparte cupos entre empresas y persiste el reajuste de un solo plan para web', async () => {
    let customerId = 0;
    try {
      await prisma.$transaction(async tx => {
        const companies = await Promise.all([1, 2].map(n => tx.empresa.create({data:{nombre:`QA pago temporal ${n}`}})));
        const actor = await tx.usuario.create({data:{idEmpresa:companies[0].idEmpresa,nombreCompleto:'QA pago temporal',passwordHash:'no-login'}});
        const customer = await tx.cliente.create({data:{idEmpresa:companies[0].idEmpresa,nombreCompleto:'QA pago temporal',estado:'Activo'}});
        customerId = customer.idCliente;
        const user = {idUsuario:actor.idUsuario,idEmpresa:companies[0].idEmpresa,nombreCompleto:actor.nombreCompleto,email:null,roles:['Administrador']};
        const contracts = [];
        const invoices = [];
        for (const company of companies) {
          const plan = await tx.plan.create({data:{idEmpresa:company.idEmpresa,nombreComercial:'Plan QA pago',tipoPlan:'Internet',tipoCliente:'Residencial',precioMensual:30000}});
          const contract = await tx.contrato.create({data:{idCliente:customerId,idEmpresa:company.idEmpresa,idPlan:plan.idPlan,fechaInicio:new Date('2026-01-01'),diaVencimiento:1,estado:'Activo'}});
          contracts.push(contract);
          invoices.push(await tx.factura.create({data:{idContrato:contract.idContrato,periodoMes:9,periodoAnio:2026,monto:30000,fechaEmision:new Date('2026-09-01'),fechaLimitePago:new Date('2026-09-01'),estado:'Pendiente'}}));
        }
        // Reuse one outer transaction so all synthetic data is rolled back, including audit records.
        const db = new Proxy(tx, {get(target, key) { return key === '$transaction' ? (work: (client: typeof tx) => unknown) => work(tx) : Reflect.get(target,key); }});
        const service = new CommercialControlBookService(db as never,new AuditService(db as never),new CommercialStatusService(),new ConfigService());
        for (let n=0;n<3;n++) {
          const invoice=invoices[n%2];
          await service.createAgreement({idCliente:customerId,idFactura:invoice.idFactura,montoComprometido:10000,cantidadCuotas:1,condiciones:'QA temporal',fechaInicio:'2026-11-15',cuotas:[{numero:1,monto:10000,fechaVencimiento:'2030-01-01'}]},user);
          await service.createExtension({idFactura:invoice.idFactura,nuevaFecha:`2030-01-0${n+1}`,motivo:'QA temporal'},user);
        }
        const usage=await service.annualAllowance(customerId,companies[1].idEmpresa,user);
        expect(usage).toMatchObject({agreements:{used:3,remaining:0},extensions:{used:3,remaining:0}});
        await expect(service.createExtension({idFactura:invoices[1].idFactura,nuevaFecha:'2030-02-01',motivo:'QA temporal'},user)).rejects.toThrow('3 prórrogas');
        const contract=contracts[0];
        const preview=await service.paymentDayPreview(contract.idContrato,15,user);
        const change=await service.changePaymentCondition({idCliente:customerId,idContrato:contract.idContrato,tipoCambio:'DIA_PAGO',valorNuevo:'15',justificacion:'QA temporal',previewFingerprint:preview.fingerprint},user);
        if (!('reajuste' in change)) throw new Error('Respuesta de día de pago inválida');
        expect(change.reajuste).toMatchObject({baseDias:30,montoReajuste:preview.montoReajuste});
        expect((await tx.contrato.findUniqueOrThrow({where:{idContrato:contracts[1].idContrato}})).diaVencimiento).toBe(1);
        expect((await tx.factura.findUniqueOrThrow({where:{idFactura:invoices[0].idFactura}})).fechaLimitePago.toISOString().slice(0,10)).toBe('2026-09-01');
        const web=await new G2IntegrationService(db as never,{} as never,{} as never,{} as never).paymentConditions(customerId,companies[0].idEmpresa);
        expect(web.contratos[0]).toMatchObject({id_contrato:contract.idContrato,dia_pago:15,cargos_pendientes:[{monto:preview.montoReajuste}]});
        const nextPreview=await service.paymentDayPreview(contract.idContrato,20,user);
        await expect(service.changePaymentCondition({idCliente:customerId,idContrato:contract.idContrato,tipoCambio:'DIA_PAGO',valorNuevo:'20',justificacion:'QA temporal',previewFingerprint:nextPreview.fingerprint},user)).rejects.toThrow('pendiente de facturación');
        expect(await tx.cargoAdicional.count({where:{idCliente:customerId}})).toBe(1);
        expect(await tx.logAuditoria.count({where:{idUsuario:actor.idUsuario}})).toBe(7);
        throw rollback;
      }, {timeout:30000});
    } catch(error) { if(error!==rollback) throw error; }
    expect(await prisma.cliente.count({where:{idCliente:customerId}})).toBe(0);
  },40000);
});
