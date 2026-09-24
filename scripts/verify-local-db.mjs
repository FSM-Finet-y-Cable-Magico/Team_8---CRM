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

  const columnRows = await prisma.$queryRaw`
    SELECT table_name, column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('contrato', 'id_prospecto'),
        ('orden_trabajo', 'id_prospecto'),
        ('servicio_contratado', 'id_cliente')
      )
    ORDER BY table_name, column_name
  `;

  if (columnRows.length !== 3) {
    throw new Error('No estan disponibles todas las columnas criticas del lifecycle');
  }

  const constraintRows = await prisma.$queryRaw`
    SELECT conname, COUNT(*)::integer AS count
    FROM pg_constraint
    WHERE conname IN ('fk_contrato_id_prospecto', 'fk_orden_trabajo_id_prospecto')
    GROUP BY conname
    ORDER BY conname
  `;
  const counts = new Map(constraintRows.map((row) => [row.conname, row.count]));

  for (const name of ['fk_contrato_id_prospecto', 'fk_orden_trabajo_id_prospecto']) {
    if (counts.get(name) !== 1) {
      throw new Error(`Constraint ${name} no existe exactamente una vez`);
    }
  }

  const simplePrismaQuery = await prisma.empresa.count();
  console.log(JSON.stringify({
    status: 'OK',
    tables: requiredTables.length,
    criticalColumns: columnRows,
    constraints: Object.fromEntries(counts),
    prismaEmpresaCount: simplePrismaQuery,
  }));
} finally {
  await prisma.$disconnect();
}
