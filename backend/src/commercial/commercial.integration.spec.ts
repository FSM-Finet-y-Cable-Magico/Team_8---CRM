import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { CommercialControlBookService } from './commercial-control-book.service';
import { CommercialStatusService } from './commercial-status.service';

const integration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;
const rollback = new Error('ROLLBACK_COMMERCIAL_INTEGRATION');

integration('Libro Control comercial en PostgreSQL con rollback', () => {
  const prisma = new PrismaClient();
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('persiste relaciones normalizadas y proyecta factura, pago, convenio, prórroga, aviso, cargo e interesado', async () => {
    expect.assertions(15);
    try {
      await prisma.$transaction(async (tx) => {
        const company = await tx.empresa.create({ data: { nombre: 'Empresa temporal comercial' } });
        const actor = await tx.usuario.create({ data: {
          idEmpresa: company.idEmpresa,
          nombreCompleto: 'Actor temporal comercial',
          passwordHash: 'test-account-no-login',
        } });
        const customer = await tx.cliente.create({ data: {
          idEmpresa: company.idEmpresa,
          nombreCompleto: 'Cliente temporal comercial',
          estado: 'Activo',
        } });
        const plan = await tx.plan.create({ data: {
          idEmpresa: company.idEmpresa,
          nombreComercial: 'Plan temporal comercial',
          tipoPlan: 'Internet',
          tipoCliente: 'Residencial',
          precioMensual: 20000,
        } });
        const contract = await tx.contrato.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idPlan: plan.idPlan,
          fechaInicio: new Date('2026-01-01'),
          diaVencimiento: 10,
          estado: 'Activo',
        } });
        const service = await tx.servicioContratado.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idContrato: contract.idContrato,
          tipoServicio: 'Internet',
          estadoOperativo: 'Activo',
        } });
        const invoice = await tx.factura.create({ data: {
          idContrato: contract.idContrato,
          periodoMes: 9,
          periodoAnio: 2026,
          monto: 10000,
          fechaEmision: new Date('2026-09-01'),
          fechaLimitePago: new Date('2026-09-10'),
          estado: 'Pendiente',
          tipoDocumento: 'BOLETA',
          folioExterno: 'FOLIO-TEMPORAL',
        } });
        await tx.pago.create({ data: {
          idFactura: invoice.idFactura,
          idCliente: customer.idCliente,
          monto: 4000,
          fechaPago: new Date('2026-09-05T12:00:00.000Z'),
          pasarela: 'Transferencia',
        } });
        const event = await tx.eventoGestionComercial.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idServicio: service.idServicio,
          idContrato: contract.idContrato,
          idFactura: invoice.idFactura,
          tipo: 'ULTIMO_AVISO_CORTE',
          canal: 'WHATSAPP',
          fecha: new Date('2026-09-20T12:00:00.000Z'),
          observacion: 'Registro manual temporal, sin envío API',
          idUsuarioResponsable: actor.idUsuario,
        } });
        const agreement = await tx.convenioPago.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idServicio: service.idServicio,
          idContrato: contract.idContrato,
          idFactura: invoice.idFactura,
          montoComprometido: 6000,
          cantidadCuotas: 2,
          condiciones: 'Dos cuotas temporales',
          fechaInicio: new Date('2026-09-25'),
          estado: 'APROBADO',
          idUsuarioResponsable: actor.idUsuario,
          idUsuarioAprobador: actor.idUsuario,
          cuotas: { create: [
            { numero: 1, monto: 3000, fechaVencimiento: new Date('2026-10-10') },
            { numero: 2, monto: 3000, fechaVencimiento: new Date('2026-11-10') },
          ] },
        }, include: { cuotas: true } });
        const extension = await tx.prorrogaPago.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idContrato: contract.idContrato,
          idFactura: invoice.idFactura,
          fechaOriginal: new Date('2026-09-10'),
          nuevaFecha: new Date('2026-10-10'),
          motivo: 'Compromiso temporal',
          estado: 'APROBADA',
          idUsuarioResponsable: actor.idUsuario,
        } });
        const condition = await tx.cambioCondicionPago.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idContrato: contract.idContrato,
          tipoCambio: 'DIA_PAGO',
          valorAnterior: '10',
          valorNuevo: '15',
          justificacion: 'Solicitud temporal',
          idUsuarioResponsable: actor.idUsuario,
        } });
        const charge = await tx.cargoAdicional.create({ data: {
          idEmpresa: company.idEmpresa,
          idCliente: customer.idCliente,
          idContrato: contract.idContrato,
          idServicio: service.idServicio,
          tipo: 'RECONEXION',
          monto: 1500,
          fecha: new Date('2026-09-25'),
          estado: 'PENDIENTE_FACTURACION',
          afectaSaldo: false,
          idUsuarioResponsable: actor.idUsuario,
        } });
        const lead = await tx.prospecto.create({ data: {
          idEmpresa: company.idEmpresa,
          idUsuarioComercial: actor.idUsuario,
          nombreCompleto: 'Interesado temporal',
          estadoPipeline: 'Fuera pipeline',
          clasificacionComercial: 'INTERESADO_NO_CONTRATANTE',
          disponibleRemarketing: true,
        } });

        const book = new CommercialControlBookService(
          tx as never,
          { record: jest.fn() } as never,
          new CommercialStatusService(),
          new ConfigService({ BILLING_CUT_DAYS: 5 }),
        );
        const result = await book.list(
          { idEmpresa: company.idEmpresa, page: 1, pageSize: 10 },
          { idUsuario: actor.idUsuario, idEmpresa: company.idEmpresa, email: null, nombreCompleto: actor.nombreCompleto, roles: ['Administrador'] },
        );

        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
          idCliente: customer.idCliente,
          idServicio: service.idServicio,
          idContrato: contract.idContrato,
          idFactura: invoice.idFactura,
          saldoPendiente: 6000,
          estadoComercial: 'ULTIMO_AVISO_REGISTRADO',
          convenioActivo: true,
          prorrogaActiva: true,
          ultimoAviso: true,
          cargosPendientes: 1500,
        });
        expect(result.summary.totalDebt).toBe(6000);
        expect(agreement.cuotas).toHaveLength(2);
        expect(extension.fechaOriginal.toISOString().slice(0, 10)).toBe('2026-09-10');
        expect(condition.valorAnterior).toBe('10');
        expect(condition.valorNuevo).toBe('15');
        expect(charge.afectaSaldo).toBe(false);
        expect(event.canal).toBe('WHATSAPP');
        expect(lead).toMatchObject({ clasificacionComercial: 'INTERESADO_NO_CONTRATANTE', disponibleRemarketing: true });
        expect(await tx.cliente.count({ where: { idEmpresa: company.idEmpresa } })).toBe(1);
        expect(await tx.eventoGestionComercial.count({ where: { idEmpresa: company.idEmpresa } })).toBe(1);
        expect(await tx.convenioPago.count({ where: { idEmpresa: company.idEmpresa } })).toBe(1);
        expect(await tx.prorrogaPago.count({ where: { idEmpresa: company.idEmpresa } })).toBe(1);
        expect(await tx.cargoAdicional.count({ where: { idEmpresa: company.idEmpresa } })).toBe(1);
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 40000);
});