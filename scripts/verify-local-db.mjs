import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const requiredTables = [
  'prospecto',
  'cliente',
  'contrato',
  'servicio_contratado',
  'direccion_servicio',
  'orden_trabajo',
  'ticket',
  'factura',
  'pago',
  'zona_pago',
  'plan_zona_precio',
  'contrato_digital',
  'solicitud_cliente',
  'observacion_operativa',
  'historial_cambio_plan',
  'evento_gestion_comercial',
  'convenio_pago',
  'cuota_convenio_pago',
  'prorroga_pago',
  'cambio_condicion_pago',
  'cargo_adicional',
];

const requiredColumns = [
  ['contrato', 'id_prospecto'], ['orden_trabajo', 'id_prospecto'], ['servicio_contratado', 'id_cliente'],
  ['prospecto', 'comuna'], ['prospecto', 'region'], ['prospecto', 'latitud'], ['prospecto', 'longitud'], ['prospecto', 'id_zona_pago'],
  ['zona_pago', 'tipo_zona'], ['zona_pago', 'id_zona_padre'], ['zona_pago', 'poligono_geojson'], ['zona_pago', 'centro_lat'],
  ['zona_pago', 'centro_lng'], ['zona_pago', 'prioridad'], ['zona_pago', 'fuente_cobertura'], ['zona_pago', 'fecha_inicio'], ['zona_pago', 'fecha_fin'],
  ['plan_zona_precio', 'fecha_inicio'], ['plan_zona_precio', 'fecha_fin'],
  ['prospecto', 'clasificacion_comercial'], ['prospecto', 'disponible_remarketing'],
  ['factura', 'tipo_documento'], ['factura', 'folio_externo'],
  ['evento_gestion_comercial', 'id_empresa'], ['evento_gestion_comercial', 'id_cliente'], ['evento_gestion_comercial', 'tipo'], ['evento_gestion_comercial', 'canal'],
  ['convenio_pago', 'monto_comprometido'], ['convenio_pago', 'cantidad_cuotas'], ['convenio_pago', 'estado'],
  ['cuota_convenio_pago', 'id_convenio'], ['cuota_convenio_pago', 'numero'], ['cuota_convenio_pago', 'fecha_vencimiento'],
  ['prorroga_pago', 'fecha_original'], ['prorroga_pago', 'nueva_fecha'], ['prorroga_pago', 'estado'],
  ['cambio_condicion_pago', 'tipo_cambio'], ['cambio_condicion_pago', 'valor_anterior'], ['cambio_condicion_pago', 'valor_nuevo'],
  ['cargo_adicional', 'tipo'], ['cargo_adicional', 'monto'], ['cargo_adicional', 'estado'], ['cargo_adicional', 'afecta_saldo'],
];

const requiredConstraints = [
  'fk_contrato_id_prospecto',
  'fk_orden_trabajo_id_prospecto',
  'prospecto_id_zona_pago_fkey',
  'zona_pago_id_zona_padre_fkey',
  'evento_gestion_comercial_id_empresa_fkey',
  'evento_gestion_comercial_id_cliente_fkey',
  'evento_gestion_comercial_id_factura_fkey',
  'convenio_pago_id_empresa_fkey',
  'convenio_pago_id_cliente_fkey',
  'convenio_pago_id_factura_fkey',
  'cuota_convenio_pago_id_convenio_fkey',
  'prorroga_pago_id_empresa_fkey',
  'prorroga_pago_id_cliente_fkey',
  'prorroga_pago_id_factura_fkey',
  'cambio_condicion_pago_id_empresa_fkey',
  'cambio_condicion_pago_id_cliente_fkey',
  'cargo_adicional_id_empresa_fkey',
  'cargo_adicional_id_cliente_fkey',
];

const requiredIndexes = [
  'cuota_convenio_pago_id_convenio_numero_key',
  'evento_gestion_comercial_id_empresa_tipo_fecha_idx',
  'evento_gestion_comercial_id_cliente_fecha_idx',
  'evento_gestion_comercial_id_factura_idx',
  'convenio_pago_id_empresa_estado_fecha_inicio_idx',
  'convenio_pago_id_cliente_estado_idx',
  'convenio_pago_id_factura_idx',
  'cuota_convenio_pago_fecha_vencimiento_estado_idx',
  'prorroga_pago_id_empresa_estado_nueva_fecha_idx',
  'prorroga_pago_id_factura_fecha_registro_idx',
  'cambio_condicion_pago_id_empresa_tipo_cambio_fecha_registro_idx',
  'cambio_condicion_pago_id_cliente_fecha_registro_idx',
  'cargo_adicional_id_empresa_estado_fecha_idx',
  'cargo_adicional_id_cliente_fecha_registro_idx',
  'prospecto_id_empresa_clasificacion_comercial_idx',
  'factura_folio_externo_idx',
];

try {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    requiredTables,
  );
  const presentTables = new Set(tableRows.map((row) => row.tablename));
  const missingTables = requiredTables.filter((table) => !presentTables.has(table));
  if (missingTables.length) throw new Error(`Faltan tablas requeridas: ${missingTables.join(', ')}`);

  const columnRows = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, is_nullable, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, column_name`,
    requiredTables,
  );
  const presentColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredColumns.filter(([table, column]) => !presentColumns.has(`${table}.${column}`));
  if (missingColumns.length) throw new Error(`Faltan columnas críticas: ${missingColumns.map((parts) => parts.join('.')).join(', ')}`);

  const constraintRows = await prisma.$queryRawUnsafe(
    `SELECT conname, COUNT(*)::integer AS count
     FROM pg_constraint
     WHERE conname = ANY($1::text[])
     GROUP BY conname
     ORDER BY conname`,
    requiredConstraints,
  );
  const constraintCounts = new Map(constraintRows.map((row) => [row.conname, row.count]));
  for (const name of requiredConstraints) {
    if (constraintCounts.get(name) !== 1) throw new Error(`Constraint ${name} no existe exactamente una vez`);
  }

  const indexRows = await prisma.$queryRawUnsafe(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    requiredIndexes,
  );
  const presentIndexes = new Set(indexRows.map((row) => row.indexname));
  const missingIndexes = requiredIndexes.filter((index) => !presentIndexes.has(index));
  if (missingIndexes.length) throw new Error(`Faltan índices requeridos: ${missingIndexes.join(', ')}`);

  const counts = {
    empresas: await prisma.empresa.count(),
    clientes: await prisma.cliente.count(),
    facturas: await prisma.factura.count(),
    zonasPago: await prisma.zonaPago.count(),
    reglasPrecioZona: await prisma.planZonaPrecio.count(),
    eventosComerciales: await prisma.eventoGestionComercial.count(),
    convenios: await prisma.convenioPago.count(),
    prorrogas: await prisma.prorrogaPago.count(),
    cambiosCondicion: await prisma.cambioCondicionPago.count(),
    cargos: await prisma.cargoAdicional.count(),
  };
  await prisma.zonaPago.findFirst({ select: { idZonaPago: true, nombreZona: true, tipoZona: true, poligonoGeojson: true } });
  await prisma.factura.findFirst({ select: { idFactura: true, tipoDocumento: true, folioExterno: true } });
  await prisma.prospecto.findFirst({ select: { idProspecto: true, clasificacionComercial: true, disponibleRemarketing: true } });

  console.log(JSON.stringify({
    status: 'OK',
    tables: requiredTables.length,
    criticalColumns: requiredColumns.length,
    constraints: requiredConstraints.length,
    indexes: requiredIndexes.length,
    counts,
  }));
} finally {
  await prisma.$disconnect();
}