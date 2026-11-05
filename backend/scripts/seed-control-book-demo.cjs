'use strict';

const { PrismaClient } = require('@prisma/client');

const MARKER = 'DEMO_LIBRO_CONTROL_V1';
const prisma = new PrismaClient();

function dateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

const today = dateOnly(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()));

function offset(days) {
  return new Date(today.getTime() + days * 86400000);
}

function month(offsetMonths) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offsetMonths, 1));
}

function demoRut(number) {
  let sum = 0;
  let factor = 2;
  for (const digit of String(number).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const check = 11 - sum % 11;
  return `${number}-${check === 11 ? '0' : check === 10 ? 'K' : check}`;
}

const scenarios = [
  { key: 'pending', name: 'Ana - Saldo pendiente' },
  { key: 'partial', name: 'Bruno - Pago parcial' },
  { key: 'monthly', name: 'Carla - Deuda mensual' },
  { key: 'agreement', name: 'Diego - Convenio aprobado' },
  { key: 'extension', name: 'Elena - Prorroga vigente' },
  { key: 'notice', name: 'Fabio - Ultimo aviso' },
  { key: 'suspended', name: 'Gabriela - Servicio suspendido' },
  { key: 'paid', name: 'Hugo - Al dia' },
  { key: 'no-invoice', name: 'Ines - Sin factura' },
  { key: 'no-plan', name: 'Julia - Sin plan' },
  { key: 'withdrawal', name: 'Karina - Aviso de retiro' },
  { key: 'pending-agreement', name: 'Luis - Convenio pendiente' },
];

async function seedCompany(tx, company) {
  const [plan, users] = await Promise.all([
    tx.plan.findFirst({ where: { idEmpresa: company.idEmpresa, activo: true }, orderBy: [{ precioMensual: 'desc' }, { idPlan: 'asc' }] }),
    tx.usuario.findMany({ where: { idEmpresa: company.idEmpresa, activo: true }, include: { usuarioRoles: { include: { rol: true } } }, orderBy: { idUsuario: 'asc' } }),
  ]);
  const responsible = users.find(user => user.usuarioRoles.some(role => role.rol.nombreRol === 'Administrador'));
  if (!plan || !responsible || Number(plan.precioMensual) <= 10000) {
    throw new Error(`Empresa ${company.idEmpresa}: falta un plan activo o administrador para preparar los casos.`);
  }
  const zonePrice = await tx.planZonaPrecio.findFirst({
    where: { idPlan: plan.idPlan, activo: true, zonaPago: { idEmpresa: company.idEmpresa, activo: true, tipoZona: 'MICROZONA_COMERCIAL' },
      AND: [{ OR: [{ fechaInicio: null }, { fechaInicio: { lte: today } }] }, { OR: [{ fechaFin: null }, { fechaFin: { gte: today } }] }] },
    orderBy: { idPlanZonaPrecio: 'asc' },
  });
  const price = Number(zonePrice?.precioMensual ?? plan.precioMensual);
  if (price <= 10000) throw new Error('El precio del plan debe permitir el caso de pago parcial.');
  const results = [];
  for (const [index, scenario] of scenarios.entries()) {
    const rut = demoRut(99000000 + company.idEmpresa * 100 + index + 1);
    const existing = await tx.cliente.findUnique({ where: { rut } });
    if (existing) {
      if (existing.idEmpresa !== company.idEmpresa || existing.origenContacto !== MARKER) {
        throw new Error(`El RUT reservado ${rut} ya pertenece a un registro ajeno a esta demostracion.`);
      }
      results.push({ idCliente: existing.idCliente, caso: scenario.key, creado: false });
      continue;
    }
    // These are explicitly historical local fixtures, predating the installation activation flow.
    const startedAt = new Date(Math.min(month(-3).getTime(), Date.parse('2026-09-01T00:00:00.000Z')));
    const customer = await tx.cliente.create({ data: {
      idEmpresa: company.idEmpresa, rut, nombreCompleto: `DEMO ${scenario.name}`,
      email: `libro-control-${company.idEmpresa}-${scenario.key}@example.invalid`, telefono: null,
      estado: 'Activo', origenContacto: MARKER, importadoMasivo: true,
      datosTecnicos: { demo: MARKER, caso: scenario.key }, fechaCreacion: startedAt,
    } });
    results.push({ idCliente: customer.idCliente, caso: scenario.key, creado: true });
    if (scenario.key === 'no-plan') continue;

    const overdue = !['pending', 'extension', 'paid', 'no-invoice'].includes(scenario.key);
    const contract = await tx.contrato.create({ data: {
      idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idPlan: plan.idPlan,
      idZonaPago: zonePrice?.idZonaPago ?? null, fechaInicio: startedAt, diaVencimiento: 10,
      estado: scenario.key === 'suspended' ? 'Suspendido' : overdue ? 'Moroso' : 'Activo',
      fechaSuspension: scenario.key === 'suspended' ? offset(-30) : null,
      numeroContratoExterno: `DEMO-LC-${company.idEmpresa}-${scenario.key}`,
      observacionContrato: 'Demostracion local del Libro de control. Contrato historico de prueba.',
      direccionInstalacion: `Calle Demostracion ${index + 1}`, comunaInstalacion: 'Valparaiso', ciudadInstalacion: 'Valparaiso',
    } });
    const service = await tx.servicioContratado.create({ data: {
      idEmpresa: company.idEmpresa, idCliente: customer.idCliente, idContrato: contract.idContrato,
      idZonaPago: contract.idZonaPago, tipoServicio: 'Internet',
      estadoOperativo: scenario.key === 'suspended' ? 'Suspendido' : 'Activo',
      fechaCreacion: startedAt, fechaActivacion: startedAt,
      observaciones: 'Servicio historico ficticio para validacion local, sin integracion externa.',
      datosTecnicos: { demo: MARKER, caso: scenario.key, importacionHistorica: true },
    } });
    if (scenario.key === 'no-invoice') continue;

    const count = ['monthly', 'paid'].includes(scenario.key) ? 3 : scenario.key === 'suspended' ? 2 : 1;
    const invoices = [];
    for (let n = 0; n < count; n++) {
      let period = month(count > 1 ? -count + n : 0);
      const due = count > 1 ? new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 10))
        : scenario.key === 'pending' ? offset(10) : offset(scenario.key === 'notice' ? -60 : -20);
      if (count === 1) period = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1));
      const invoice = await tx.factura.create({ data: {
        idContrato: contract.idContrato, periodoMes: period.getUTCMonth() + 1, periodoAnio: period.getUTCFullYear(),
        monto: price, fechaEmision: period, fechaLimitePago: due,
        estado: scenario.key === 'paid' ? 'Pagada' : ['pending', 'extension'].includes(scenario.key) ? 'Pendiente' : 'Vencida',
        tipoDocumento: 'BOLETA', folioExterno: `DEMO-LC-${company.idEmpresa}-${scenario.key}-${n + 1}`,
      } });
      invoices.push(invoice);
      if (['partial', 'paid'].includes(scenario.key)) {
        await tx.pago.create({ data: {
          idFactura: invoice.idFactura, idCliente: customer.idCliente,
          monto: scenario.key === 'partial' ? 10000 : price,
          fechaPago: scenario.key === 'partial' ? offset(-3) : due,
          pasarela: 'Transferencia', codigoTransaccion: `DEMO-LC-${company.idEmpresa}-${scenario.key}-${n + 1}`,
          comprobanteEstado: 'PENDIENTE',
        } });
      }
    }
    const relation = { idEmpresa: company.idEmpresa, idCliente: customer.idCliente,
      idContrato: contract.idContrato, idServicio: service.idServicio, idFactura: invoices[0].idFactura,
      idUsuarioResponsable: responsible.idUsuario };
    await tx.eventoGestionComercial.create({ data: {
      ...relation, tipo: 'CONTACTO_CLIENTE', canal: 'PRESENCIAL', fecha: offset(-4),
      observacion: 'Registro ficticio de contacto. Revisar los movimientos en Historial de cliente.',
    } });
    if (['notice', 'suspended', 'withdrawal'].includes(scenario.key)) {
      await tx.eventoGestionComercial.create({ data: {
        ...relation, tipo: scenario.key === 'withdrawal' ? 'AVISO_PREVIO_RETIRO' : 'ULTIMO_AVISO_CORTE',
        canal: 'PRESENCIAL', fecha: offset(scenario.key === 'suspended' ? -35 : -2),
        observacion: 'Aviso ficticio registrado para demostrar el seguimiento comercial; no se envio ninguna notificacion.',
      } });
    }
    if (['agreement', 'pending-agreement'].includes(scenario.key)) {
      const firstAmount = Math.floor(price / 3);
      await tx.convenioPago.create({ data: {
        ...relation, montoComprometido: price, cantidadCuotas: 3, condiciones: 'Convenio de demostracion en tres cuotas. No registra pagos automaticamente.',
        fechaInicio: today, estado: scenario.key === 'agreement' ? 'APROBADO' : 'PENDIENTE', fechaRegistro: offset(-2),
        idUsuarioAprobador: scenario.key === 'agreement' ? responsible.idUsuario : null,
        fechaAprobacion: scenario.key === 'agreement' ? offset(-1) : null,
        cuotas: { create: [0, 1, 2].map(n => ({ numero: n + 1, monto: n === 2 ? price - firstAmount * 2 : firstAmount,
          fechaVencimiento: offset(7 + n * 30), estado: 'PENDIENTE' })) },
      } });
    }
    if (scenario.key === 'extension') {
      const { idServicio, ...extensionRelation } = relation;
      await tx.prorrogaPago.create({ data: { ...extensionRelation, fechaOriginal: invoices[0].fechaLimitePago,
        nuevaFecha: offset(7), motivo: 'Prorroga de demostracion para validar el vencimiento efectivo.', estado: 'APROBADA', fechaRegistro: offset(-2) } });
    }
    if (scenario.key === 'paid') {
      const { idServicio, idFactura, ...conditionRelation } = relation;
      await tx.contrato.update({ where: { idContrato: contract.idContrato }, data: { diaVencimiento: 15 } });
      await tx.cambioCondicionPago.create({ data: { ...conditionRelation, tipoCambio: 'DIA_PAGO', valorAnterior: '10', valorNuevo: '15',
        justificacion: 'Cambio de dia de pago de demostracion para futuras facturas.', fechaRegistro: offset(-1) } });
      const { idFactura: ignoredInvoice, ...chargeRelation } = relation;
      await tx.cargoAdicional.create({ data: { ...chargeRelation, tipo: 'REPOSICION', monto: 5000, fecha: today,
        estado: 'PENDIENTE_FACTURACION', afectaSaldo: false, observacion: 'Cargo ficticio pendiente de facturacion; no incrementa la deuda actual.' } });
    }
  }
  return { idEmpresa: company.idEmpresa, empresa: company.nombre, precioMensual: price, clientes: results };
}

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!process.argv.includes('--apply-local') || !['db', 'localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/fsm_db') {
    throw new Error('Solo se permite con --apply-local en la base fsm_db de Docker local. No ejecutar contra produccion.');
  }
  const companies = await prisma.empresa.findMany({ where: { nombre: { in: ['FiNet Limitada', 'Cable Mágico Litoral'] } }, orderBy: { idEmpresa: 'asc' } });
  if (companies.length !== 2) throw new Error('No se encontraron las dos empresas esperadas de la base local.');
  const results = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7102026)`;
    const seeded = [];
    for (const company of companies) seeded.push(await seedCompany(tx, company));
    return seeded;
  }, { timeout: 60000 });
  console.log(JSON.stringify({ marker: MARKER, fechaReferencia: today.toISOString().slice(0, 10), empresas: results }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
