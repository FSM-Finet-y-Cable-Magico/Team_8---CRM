import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

const migrationName = '20261001120000_i3_g2_intergroup_contract';

export async function readMigrationPreflight(prisma) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15000ms'");
    const [objects, paymentCounts, categoryCounts, duplicateCategories, migrationRows] = await Promise.all([
      tx.$queryRawUnsafe(`
        SELECT
          to_regclass('public.integracion_resultado_wifi_g2') IS NOT NULL AS wifi_result_table,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='prospecto' AND column_name='id_plan_interes') AS prospect_plan_column,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pago' AND column_name='codigo_autorizacion') AS payment_authorization_column,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pago' AND column_name='comprobante_estado') AS receipt_state_column
      `),
      tx.$queryRawUnsafe(`
        SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE comprobante_pdf_url IS NOT NULL AND btrim(comprobante_pdf_url) <> '')::integer AS with_receipt_url
        FROM pago
      `),
      tx.$queryRawUnsafe(`
        SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE nombre = 'CAMBIO_CREDENCIALES_WIFI')::integer AS wifi_category_rows
        FROM categoria_falla
      `),
      tx.$queryRawUnsafe(`
        SELECT count(*)::integer AS duplicate_name_groups
        FROM (SELECT nombre FROM categoria_falla GROUP BY nombre HAVING count(*) > 1) duplicates
      `),
      tx.$queryRawUnsafe(`
        SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count
        FROM _prisma_migrations WHERE migration_name = $1
      `, migrationName),
    ]);
    return {
      capturedAt: new Date().toISOString(),
      access: 'READ_ONLY',
      migrationName,
      objects: objects[0],
      historicalData: {
        paymentRows: paymentCounts[0].total,
        paymentRowsWithReceiptUrl: paymentCounts[0].with_receipt_url,
        categoryRows: categoryCounts[0].total,
        wifiCategoryRows: categoryCounts[0].wifi_category_rows,
        duplicateCategoryNameGroups: duplicateCategories[0].duplicate_name_groups,
      },
      migrationRows,
      piiPrinted: false,
    };
  }, { timeout: 120000, maxWait: 10000 });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'DATABASE_URL_NOT_CONFIGURED' }));
    return 2;
  }
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: [] });
  try {
    console.log(JSON.stringify({ status: 'PASS', ...(await readMigrationPreflight(prisma)) }));
    return 0;
  } catch {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'MIGRATION_PREFLIGHT_READ_FAILED', detail: 'Error original omitido para proteger credenciales y datos comerciales.' }));
    return 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
