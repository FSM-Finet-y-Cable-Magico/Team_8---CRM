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
];

try {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    requiredTables,
  );
  const presentTables = new Set(tableRows.map((row) => row.tablename));
  const missingTables = requiredTables.filter((table) => !presentTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`Faltan tablas requeridas: ${missingTables.join(', ')}`);
  }

  const requiredColumns = [
    ['contrato', 'id_prospecto'], ['orden_trabajo', 'id_prospecto'], ['servicio_contratado', 'id_cliente'],
    ['prospecto', 'comuna'], ['prospecto', 'region'], ['prospecto', 'latitud'], ['prospecto', 'longitud'], ['prospecto', 'id_zona_pago'],
    ['zona_pago', 'tipo_zona'], ['zona_pago', 'id_zona_padre'], ['zona_pago', 'poligono_geojson'], ['zona_pago', 'centro_lat'],
    ['zona_pago', 'centro_lng'], ['zona_pago', 'prioridad'], ['zona_pago', 'fuente_cobertura'], ['zona_pago', 'fecha_inicio'], ['zona_pago', 'fecha_fin'],
    ['plan_zona_precio', 'fecha_inicio'], ['plan_zona_precio', 'fecha_fin'],
  ];
  const columnRows = await prisma.$queryRaw`
    SELECT table_name, column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('contrato', 'orden_trabajo', 'servicio_contratado', 'prospecto', 'zona_pago', 'plan_zona_precio')
    ORDER BY table_name, column_name
  `;

  const presentColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredColumns.filter(([table, column]) => !presentColumns.has(`${table}.${column}`));
  if (missingColumns.length) {
    throw new Error(`Faltan columnas criticas: ${missingColumns.map(parts => parts.join('.')).join(', ')}`);
  }

  const constraintRows = await prisma.$queryRaw`
    SELECT conname, COUNT(*)::integer AS count
    FROM pg_constraint
    WHERE conname IN ('fk_contrato_id_prospecto', 'fk_orden_trabajo_id_prospecto', 'prospecto_id_zona_pago_fkey', 'zona_pago_id_zona_padre_fkey')
    GROUP BY conname
    ORDER BY conname
  `;
  const counts = new Map(constraintRows.map((row) => [row.conname, row.count]));

  for (const name of ['fk_contrato_id_prospecto', 'fk_orden_trabajo_id_prospecto', 'prospecto_id_zona_pago_fkey', 'zona_pago_id_zona_padre_fkey']) {
    if (counts.get(name) !== 1) {
      throw new Error(`Constraint ${name} no existe exactamente una vez`);
    }
  }

  const simplePrismaQuery = await prisma.empresa.count();
  const legacyZoneCount = await prisma.zonaPago.count();
  const legacyPriceRuleCount = await prisma.planZonaPrecio.count();
  await prisma.zonaPago.findFirst({ select: { idZonaPago: true, nombreZona: true, tipoZona: true, poligonoGeojson: true } });
  console.log(JSON.stringify({
    status: 'OK',
    tables: requiredTables.length,
    criticalColumns: requiredColumns.length,
    constraints: Object.fromEntries(counts),
    prismaEmpresaCount: simplePrismaQuery,
    legacyZoneCount,
    legacyPriceRuleCount,
  }));
} finally {
  await prisma.$disconnect();
}
