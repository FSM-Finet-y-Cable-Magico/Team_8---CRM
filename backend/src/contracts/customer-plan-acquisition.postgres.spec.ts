import { Prisma, PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { readFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { ContractsService } from './contracts.service';
import { ProspectsService } from '../prospects/prospects.service';
import { buildContractSnapshot } from './contract-snapshot';
import { activeProspectWhere } from '../common/customer-lifecycle';
import { InstallationIntegrationService } from '../g3-integration/installation-integration.service';
import { CustomersService } from '../customers/customers.service';

const integration = process.env.CRM_INTEGRATION_TESTS === '1' ? describe : describe.skip;
integration('Plan adicional en PostgreSQL, sin persistir datos ni enviar correo', () => {
  it('cotiza, genera PDF y enlaza dirección, documentos y contrato sin alterar el servicio previo', async () => {
    const db = new PrismaClient(), files: string[] = [], rollback = new Error('ROLLBACK_CUSTOMER_PLAN_QA');
    try {
      await db.$transaction(async tx => {
        const company = await tx.empresa.create({ data: { nombre: 'QA contratación adicional' } });
        const previousCompany = await tx.empresa.create({ data: { nombre: 'QA empresa anterior del cliente' } });
        const employee = await tx.usuario.create({ data: { nombreCompleto: 'QA comercial', idEmpresa: company.idEmpresa, passwordHash: 'not-a-login-hash' } });
        const actor = { idUsuario: employee.idUsuario, idEmpresa: company.idEmpresa, roles: ['Administrador'], nombreCompleto: employee.nombreCompleto, email: null };
        const customer = await tx.cliente.create({ data: { idEmpresa: previousCompany.idEmpresa, nombreCompleto: 'Cliente contratación QA', rut: '11111111-1', telefono: '+56912345678', email: 'qa@example.invalid', estado: 'Activo', datosTecnicos: { nodoPrincipal: 'Nodo QA', direccion: 'Dirección histórica 123' } } });
        const previousAddress = await tx.direccionServicio.create({ data: { idCliente: customer.idCliente, direccionCompleta: 'Dirección anterior 123', comuna: 'Santiago', esPrincipal: true } });
        const plan = await tx.plan.create({ data: { idEmpresa: company.idEmpresa, nombreComercial: 'Plan adicional QA', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 25000, activo: true } });
        const zone = await tx.zonaPago.create({ data: { idEmpresa: company.idEmpresa, nombreZona: 'Cobertura QA', activo: true } });
        await tx.planZonaPrecio.create({ data: { idPlan: plan.idPlan, idZonaPago: zone.idZonaPago, precioMensual: 19990, activo: true } });
        const previousPlan = await tx.plan.create({ data: { idEmpresa: previousCompany.idEmpresa, nombreComercial: 'Plan anterior QA', tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 17990, activo: true } });
        const previous = await tx.contrato.create({ data: { idCliente: customer.idCliente, idEmpresa: previousCompany.idEmpresa, idPlan: previousPlan.idPlan, fechaInicio: new Date(), diaVencimiento: 1, estado: 'Activo', direccionInstalacion: previousAddress.direccionCompleta } });
        const previousService = await tx.servicioContratado.create({ data: { idCliente: customer.idCliente, idContrato: previous.idContrato, idEmpresa: previousCompany.idEmpresa, idDireccion: previousAddress.idDireccion, tipoServicio: 'Internet', estadoOperativo: 'Activo' } });
        const coverage = { plansForLocation: jest.fn().mockResolvedValue({ coberturaComercial: true, planes: [{ idPlan: plan.idPlan, origenPrecio: 'ZONA_PADRE', precioAplicable: 19990 }], zona: { idZonaPago: zone.idZonaPago }, microzona: null }) };
        const adapter = { ...tx, $queryRaw: tx.$queryRaw.bind(tx), $executeRaw: tx.$executeRaw.bind(tx), $transaction: (work: (client: Prisma.TransactionClient) => unknown) => work(tx) };
        const audit = { record: jest.fn() }, mail = { sendQuote: jest.fn().mockResolvedValue({ status: 'simulated' }) };
        const contracts = new ContractsService(adapter as never, audit as never, {} as never,
          new ConfigService({ CONTRACT_SIGNATURE_ENABLED: 'false' }), coverage as never);
        const delivered = jest.fn(); contracts.setAutomaticSignatureDelivery(delivered);
        const prospects = new ProspectsService(adapter as never, audit as never, mail as never, coverage as never, contracts);
        const quote = await prospects.quoteCustomerPlan({ idCliente: customer.idCliente, planId: plan.idPlan,
          direccion: 'Nueva dirección 999', comuna: 'Santiago', region: 'Metropolitana de Santiago', latitud: -33.45, longitud: -70.65 }, actor);
        expect(mail.sendQuote).toHaveBeenCalledWith(expect.objectContaining({ to: customer.email, pdf: expect.any(Buffer) }));
        const secondQuote = await prospects.quoteCustomerPlan({ idCliente: customer.idCliente, planId: plan.idPlan,
          direccion: 'Nueva dirección 999', comuna: 'Santiago', region: 'Metropolitana de Santiago', latitud: -33.45, longitud: -70.65 }, actor);
        expect((await prospects.customerQuotes(customer.idCliente, company.idEmpresa, actor)).map(row => row.idCotizacion)).toEqual([secondQuote.idCotizacion, quote.idCotizacion]);
        expect(await tx.prospecto.count({ where: activeProspectWhere({ idEmpresa: company.idEmpresa }) })).toBe(0);
        const contract = await contracts.createCustomerContract({ idCliente: customer.idCliente, idPlan: plan.idPlan, idCotizacion: quote.idCotizacion, observacion: 'Segundo domicilio' }, actor);
        const document = await tx.contratoDigital.findFirstOrThrow({ where: { idContrato: contract.idContrato } });
        files.push(resolve(document.urlDocumento));
        expect((await readFile(files[0])).subarray(0, 5).toString()).toBe('%PDF-');
        expect(contract).toMatchObject({ idCliente: customer.idCliente, idProspecto: quote.idProspecto,
          direccionInstalacion: 'Nueva dirección 999', comunaInstalacion: 'Santiago', estado: 'Pendiente firma contrato' });
        expect((await buildContractSnapshot(tx, contract.idContrato, true)).comercial.precio).toBe(19990);
        const [customerView] = await new CustomersService(adapter as never, audit as never).list(actor, 'consolidado', '', customer.idCliente);
        expect(customerView.contratos.find(item => item.idContrato === contract.idContrato)).toMatchObject({ precioMensualAplicable: 19990 });
        const docs = await contracts.getDigitalContracts(contract.idContrato, actor);
        expect(docs.quotes.map(row => row.idCotizacion)).toContain(quote.idCotizacion);
        expect(docs.documents).toHaveLength(1);
        expect((await prospects.customerQuotes(customer.idCliente, company.idEmpresa, actor)).find(row => row.idCotizacion === quote.idCotizacion)?.contrato?.idContrato).toBe(contract.idContrato);
        const repeated = await contracts.createCustomerContract({ idCliente: customer.idCliente, idPlan: plan.idPlan, idCotizacion: quote.idCotizacion }, actor);
        expect(repeated.idContrato).toBe(contract.idContrato);
        expect(await tx.contratoDigital.count({ where: { idContrato: contract.idContrato } })).toBe(1);
        expect(await tx.servicioContratado.count({ where: { idCliente: customer.idCliente } })).toBe(1);
        expect(await tx.servicioContratado.findUnique({ where: { idServicio: previousService.idServicio } })).toEqual(previousService);
        expect(await tx.cliente.findUnique({ where: { idCliente: customer.idCliente } })).toEqual(customer);
        expect(delivered).toHaveBeenCalledWith(contract.idContrato, actor);
        // Confirm the existing G3 resolver accepts the additional contract's own references.
        await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { estado: 'Firmado' } });
        let dispatched: Record<string, unknown> = {};
        const technical = { configured: () => true, createInstallation: jest.fn(async payload => {
          dispatched = payload;
          return { status: 201, durationMs: 1, data: { ...payload, id_ot: 987000003, codigo_ot: 'QA-INST-003', estado: 'ASIGNADA' } };
        }), getWorkOrder: jest.fn(async () => ({ status: 200, durationMs: 1, data: { ...dispatched, id_ot: 987000003,
          codigo_ot: 'QA-INST-003', estado: 'EN_CURSO', tecnico: { nombre: 'Técnico QA G3' } } })) };
        const g3 = new InstallationIntegrationService(adapter as never, audit as never, {} as never, technical as never);
        await expect(g3.installationRequirements({ idContrato: contract.idContrato }, actor)).resolves.toMatchObject({
          idContrato: contract.idContrato, comunaFaltante: false,
        });
        const pending = await prospects.listPendingActivation(actor, String(company.idEmpresa));
        expect(pending.some(row => row.idCliente === customer.idCliente && row.contratos.some(item => item.idContrato === contract.idContrato))).toBe(true);
        const tracking = await g3.requestInstallation({ idContrato: contract.idContrato }, actor);
        expect(technical.createInstallation).toHaveBeenCalledWith(expect.objectContaining({ id_empresa: company.idEmpresa,
          id_prospecto: quote.idProspecto, id_contrato: contract.idContrato, id_plan: plan.idPlan,
          direccion: { direccion_completa: 'Nueva dirección 999', comuna: 'Santiago' } }));
        expect(tracking).toMatchObject({ idOtG3: '987000003', codigoOtG3: 'QA-INST-003', estadoOtG3: 'ASIGNADA' });
        await g3.requestInstallation({ idContrato: contract.idContrato }, actor);
        expect(technical.createInstallation).toHaveBeenCalledTimes(1);
        const savedTracking = await tx.integracionInstalacionG3.findFirstOrThrow({ where: { idContrato: contract.idContrato } });
        expect(await g3.detail(savedTracking.idIntegracion, actor)).toMatchObject({ estadoPresentacion: 'EN_CURSO',
          detalle: { tecnico: { nombre: 'Técnico QA G3' } } });
        expect(await tx.servicioContratado.count({ where: { idContrato: contract.idContrato } })).toBe(0);
        expect(await tx.servicioContratado.findUnique({ where: { idServicio: previousService.idServicio } })).toEqual(previousService);
        const customerService = new CustomersService(adapter as never, audit as never);
        const contactAddress = { direccion: 'Domicilio actual 456', comuna: 'Ñuñoa' };
        const profile = await customerService.updateProfile(customer.idCliente, { direccionActual: contactAddress }, actor);
        expect(profile).toMatchObject({ direccionActual: contactAddress });
        expect(profile).not.toHaveProperty('datosTecnicos');
        const refreshed = await customerService.detail(customer.idCliente, actor);
        expect(refreshed).toMatchObject({ direccionActual: contactAddress });
        expect(refreshed.datosTecnicos).toMatchObject({ nodoPrincipal: 'Nodo QA', direccion: 'Dirección histórica 123' });
        expect(refreshed.contratos.find(item => item.idContrato === contract.idContrato)?.prospecto).toMatchObject({ latitud: -33.45, longitud: -70.65 });
        const omitted = await customerService.updateProfile(customer.idCliente, { ocultarDireccion: { direccion: 'Nueva dirección 999', comuna: 'Santiago' } }, actor);
        expect(omitted).toMatchObject({ direccionActual: contactAddress, direccionesOmitidas: ['nueva direccion 999|santiago'] });
        const auditsBeforeRepeat = audit.record.mock.calls.length;
        await customerService.updateProfile(customer.idCliente, { ocultarDireccion: { direccion: 'Nueva dirección 999', comuna: 'Santiago' } }, actor);
        expect(audit.record.mock.calls.length).toBe(auditsBeforeRepeat);
        await expect(customerService.updateProfile(customer.idCliente, { ocultarDireccion: contactAddress }, actor)).rejects.toThrow('dirección actual');
        expect(await customerService.detail(customer.idCliente, actor)).toMatchObject({ direccionesOmitidas: ['nueva direccion 999|santiago'] });
        expect(await customerService.detail(customer.idCliente, actor, String(company.idEmpresa))).not.toHaveProperty('direccionActual');
        expect(await tx.contrato.findUnique({ where: { idContrato: previous.idContrato } })).toEqual(previous);
        expect(await tx.contrato.findUnique({ where: { idContrato: contract.idContrato } })).toMatchObject({ direccionInstalacion: 'Nueva dirección 999', comunaInstalacion: 'Santiago' });
        expect(await tx.direccionServicio.findUnique({ where: { idDireccion: previousAddress.idDireccion } })).toEqual(previousAddress);
        expect(await tx.servicioContratado.findUnique({ where: { idServicio: previousService.idServicio } })).toEqual(previousService);
        expect((await tx.integracionInstalacionG3.findUniqueOrThrow({ where: { idIntegracion: savedTracking.idIntegracion } })).payloadSnapshot).toEqual(savedTracking.payloadSnapshot);
        const pendingCancellation = await tx.contrato.create({ data: { idCliente: customer.idCliente, idEmpresa: company.idEmpresa,
          idPlan: plan.idPlan, fechaInicio: new Date(), diaVencimiento: 1, estado: 'Pendiente firma contrato', direccionInstalacion: 'Dirección sin firmar 456' } });
        const pendingDocument = await tx.contratoDigital.create({ data: { idContrato: pendingCancellation.idContrato, idEmpresa: company.idEmpresa,
          version: 1, estadoFirma: 'Generado', hashDocumento: 'a'.repeat(64), urlDocumento: 'generated/contracts/qa-no-file.pdf' } });
        expect(await contracts.cancelPendingContract(pendingCancellation.idContrato, actor)).toMatchObject({ estado: 'Anulado' });
        expect(await tx.contratoDigital.findUnique({ where: { idContratoDigital: pendingDocument.idContratoDigital } })).toMatchObject({ estadoFirma: 'Anulado', fechaFirma: null });
        await expect(contracts.cancelPendingContract(contract.idContrato, actor)).rejects.toThrow('no está pendiente');
        expect(await tx.servicioContratado.findUnique({ where: { idServicio: previousService.idServicio } })).toEqual(previousService);
        expect(await tx.contrato.findUnique({ where: { idContrato: previous.idContrato } })).toEqual(previous);
        throw rollback;
      }, { timeout: 40000 });
    } catch (error) { if (error !== rollback) throw error; }
    finally {
      await db.$disconnect();
      for (const file of files) {
        if (!file.startsWith(resolve('generated/contracts') + sep)) throw new Error('Unexpected QA file path');
        await unlink(file);
      }
    }
  }, 60000);
});
