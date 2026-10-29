'use strict';
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { verifyDatabase } = require('./p0-05-qa-isolation.cjs');
module.exports = async function fixtures(p, capability) {
  await verifyDatabase(p, capability);
  if (await p.empresa.count() || await p.usuario.count()) throw new Error('QA_FIXTURE_DATABASE_NOT_EMPTY');
  const companies = [], plans = [], zones = [], accounts = [];
  for (const nombre of ['QA FiNet', 'QA Cable Magico']) companies.push(await p.empresa.create({ data: { nombre } }));
  const roles = {};
  for (const nombreRol of ['Administrador', 'Comercial', 'Soporte']) roles[nombreRol] = await p.rol.create({ data: { nombreRol } });
  for (const [alias, role, company] of [['admin', 'Administrador', 0], ['finet', 'Comercial', 0], ['cable', 'Comercial', 1], ['soporte', 'Soporte', 0]]) {
    const password = randomBytes(18).toString('base64url');
    const email = `qa-${alias}@example.invalid`;
    const user = await p.usuario.create({ data: { idEmpresa: companies[company].idEmpresa, nombreCompleto: `QA ${alias}`,
      email, passwordHash: await bcrypt.hash(password, 10), activo: true, esPasswordTemporal: false,
      usuarioRoles: { create: { idRol: roles[role].idRol } } } });
    accounts.push({ alias, email, password, idUsuario: user.idUsuario, role, idEmpresa: user.idEmpresa });
  }
  for (const [index, company] of companies.entries()) {
    const x = -70.7 + index * 0.2, y = -33.5;
    const zone = await p.zonaPago.create({ data: { idEmpresa: company.idEmpresa, nombreZona: `QA zona ${index + 1}`, comuna: 'Santiago',
      tipoZona: 'COBERTURA_GENERAL', activo: true, diaVencimientoSugerido: 10,
      centroLat: y + 0.025, centroLng: x + 0.025,
      poligonoGeojson: { type: 'Polygon', coordinates: [[[x,y],[x+0.05,y],[x+0.05,y+0.05],[x,y+0.05],[x,y]]] } } });
    zones.push(zone);
    plans.push(await p.plan.create({ data: { idEmpresa: company.idEmpresa, nombreComercial: `Internet QA ${index + 1}`,
      tipoPlan: 'Internet', tipoCliente: 'Residencial', velocidadMbps: 300, precioMensual: 19990,
      preciosZona: { create: { idZonaPago: zone.idZonaPago, precioMensual: 19990, activo: true } } } }));
  }
  const shared = await p.cliente.create({ data: { idEmpresa: companies[0].idEmpresa, rut: '99000003-4',
    nombreCompleto: 'Identidad compartida QA', email: 'shared@example.invalid', telefono: '+56900000000', estado: 'Moroso',
    datosTecnicos: { nota: 'GLOBAL QA NO ATRIBUIBLE' } } });
  await p.categoriaFalla.create({data:{nombre:'Soporte sintetico QA',slaHoras:24}});
  const sharedContracts = [];
  for (const [index, company] of companies.entries()) {
    const contract = await p.contrato.create({ data: { idEmpresa: company.idEmpresa, idCliente: shared.idCliente,
      idPlan: plans[index].idPlan, fechaInicio: new Date('2026-10-01'), diaVencimiento: 10, estado: 'Activo',
      direccionInstalacion: `Calle sintetica QA ${index + 1}`, comunaInstalacion: 'Santiago' } });
    const service = await p.servicioContratado.create({ data: { idEmpresa: company.idEmpresa, idCliente: shared.idCliente,
      idContrato: contract.idContrato, tipoServicio: 'Internet', estadoOperativo: 'Activo', fechaActivacion: new Date() } });
    const invoice = await p.factura.create({ data: { idContrato: contract.idContrato, periodoMes: 10, periodoAnio: 2026,
      monto: index ? 7000 : 19990, fechaLimitePago: new Date('2026-10-01'), fechaEmision: new Date('2026-10-01'), estado: 'Pendiente' } });
    sharedContracts.push({ contract: contract.idContrato, service: service.idServicio, invoice: invoice.idFactura, company: company.idEmpresa });
  }
  return { accounts, aliases: { companies: companies.map(c=>c.idEmpresa), plans: plans.map(p=>p.idPlan),
    zones: zones.map(z=>({ id: z.idZonaPago, lat: z.centroLat, lng: z.centroLng })), sharedCustomer: shared.idCliente, sharedContracts } };
};
