import { PrismaClient, Prisma } from '@prisma/client';
import { readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { ContractsService } from './contracts/contracts.service';
import { RequestsService } from './requests/requests.service';
import { ObservationsService } from './observations/observations.service';
import { UsersService } from './users/users.service';
import { todayDateOnly } from './common/date-rules';

// Prueba optativa sobre PostgreSQL local. Todos los registros se revierten, incluso cuando falla una aserción.
const integration = process.env.CRM_INTEGRATION_TESTS === '1' ? describe : describe.skip;
integration('CRM en PostgreSQL con rollback', () => {
  it('persiste solicitudes, observaciones, zonas, cambios de plan, versiones PDF y revocación de acceso', async () => {
    const prisma = new PrismaClient();
    const files: string[] = [];
    const rollback = new Error('ROLLBACK_TEST');
    try {
      await prisma.$transaction(async tx => {
        const company = await tx.empresa.create({ data: { nombre: 'CRM prueba transaccional' } });
        const actor = await tx.usuario.create({ data: { nombreCompleto: 'Actor prueba transaccional', passwordHash: 'test-account-no-login', idEmpresa: company.idEmpresa } });
        const user = { idUsuario: actor.idUsuario, idEmpresa: company.idEmpresa, email: null, nombreCompleto: actor.nombreCompleto, roles: ['Administrador'] };
        const customer = await tx.cliente.create({ data: { nombreCompleto: 'Cliente temporal verificación', estado: 'Activo', idEmpresa: company.idEmpresa } });
        const base = { idEmpresa: company.idEmpresa, tipoPlan: 'Internet', tipoCliente: 'Residencial', precioMensual: 20000 };
        const oldPlan = await tx.plan.create({ data: { ...base, nombreComercial: 'Plan prueba A' } });
        const newPlan = await tx.plan.create({ data: { ...base, nombreComercial: 'Plan prueba B', precioMensual: 30000 } });
        const zone = await tx.zonaPago.create({ data: { idEmpresa: company.idEmpresa, nombreZona: 'Zona prueba', diaVencimientoSugerido: 15 } });
        await tx.planZonaPrecio.create({ data: { idPlan: newPlan.idPlan, idZonaPago: zone.idZonaPago, precioMensual: 27000, activo: true } });
        const adapter = { ...tx, $transaction: (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx) };
        const audit = { record: jest.fn() };
        const contracts = new ContractsService(adapter as never, audit as never, {} as never);
        const created = await contracts.createCustomerContract({ idCliente: customer.idCliente, idPlan: oldPlan.idPlan, idZonaPago: zone.idZonaPago }, user);
        expect(created.diaVencimiento).toBe(15);
        await tx.contrato.update({ where: { idContrato: created.idContrato }, data: { estado: 'Activo' } });
        const service = await tx.servicioContratado.create({ data: { idCliente: customer.idCliente, idEmpresa: company.idEmpresa, idContrato: created.idContrato, tipoServicio: 'Internet', estadoOperativo: 'Activo' } });
        const requests = new RequestsService(adapter as never, audit as never);
        const request = await requests.create({ idCliente: customer.idCliente, idServicio: service.idServicio, tipoSolicitud: 'Consulta comercial', descripcion: 'Prueba de persistencia' }, user);
        await requests.updateStatus(request.idSolicitud, { estado: 'En Gestion', observaciones: 'En revisión' }, user);
        await requests.updateFeasibility(request.idSolicitud, { factible: false, motivoNoFactible: 'Prueba de cierre' }, user);
        expect((await requests.listByCustomer(customer.idCliente, user))[0].estado).toBe('No Factible');
        const observations = new ObservationsService(adapter as never, audit as never);
        await observations.create({ tipoEntidad: 'Solicitud', idEntidad: request.idSolicitud, observacion: 'Registro contextual' }, user);
        expect((await observations.list('Solicitud', request.idSolicitud, user))[0].usuario?.idUsuario).toBe(actor.idUsuario);
        const futureDate = new Date(Date.now() + 86400000 * 3);
        const pending = await contracts.changePlan(created.idContrato, { newPlanId: newPlan.idPlan, fechaEfectiva: todayDateOnly(futureDate) }, user);
        expect(pending.cambioPlan.estadoCambio).toBe('Pendiente');
        expect(Number(pending.cambioPlan.precioNuevo)).toBe(27000);
        expect((await tx.contrato.findUniqueOrThrow({ where: { idContrato: created.idContrato } })).idPlan).toBe(oldPlan.idPlan);
        await contracts.cancelPlanChange(created.idContrato, pending.cambioPlan.idCambioPlan, user);
        await contracts.changePlan(created.idContrato, { newPlanId: newPlan.idPlan, fechaEfectiva: todayDateOnly(futureDate) }, user);
        await contracts.applyDuePlanChanges(futureDate);
        await contracts.applyDuePlanChanges(futureDate);
        expect((await tx.contrato.findUniqueOrThrow({ where: { idContrato: created.idContrato } })).idPlan).toBe(newPlan.idPlan);
        expect(await tx.historialCambioPlan.count({ where: { idContrato: created.idContrato, estadoCambio: 'Aplicado' } })).toBe(1);
        for (const version of [1, 2]) {
          const doc = await contracts.generateDigitalContract(created.idContrato, user);
          files.push(resolve(doc.urlDocumento));
          expect(doc.version).toBe(version); expect((await readFile(files[files.length - 1])).subarray(0, 4).toString()).toBe('%PDF');
        }
        const response = { setHeader: jest.fn() };
        const stream = await contracts.downloadDigitalContract(created.idContrato, user, response as never, 1);
        const chunks = []; for await (const chunk of stream.getStream()) chunks.push(chunk);
        expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('%PDF');
        expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('-v1.pdf'));
        const users = new UsersService(adapter as never, audit as never);
        await users.resetPassword(actor.idUsuario, 'Prueba-temporal-12345', user);
        expect((await tx.usuario.findUniqueOrThrow({ where: { idUsuario: actor.idUsuario } })).versionSesion).toBe(1);
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) { if (error !== rollback) throw error; }
    finally { await prisma.$disconnect(); await Promise.all(files.map(file => unlink(file))); }
  }, 40000);
});
