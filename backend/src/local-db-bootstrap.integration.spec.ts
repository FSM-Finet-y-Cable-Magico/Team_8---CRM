import { PrismaClient } from '@prisma/client';

const integration = process.env.CRM_INTEGRATION_TESTS === '1' ? describe : describe.skip;

integration('bootstrap PostgreSQL local', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('expone el esquema critico, las FK una sola vez y permite consultar con Prisma', async () => {
    const tableNames = [
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
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY(${tableNames}::text[])
    `;
    expect(new Set(tables.map((row) => row.tablename))).toEqual(new Set(tableNames));

    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('contrato', 'id_prospecto'),
          ('orden_trabajo', 'id_prospecto'),
          ('servicio_contratado', 'id_cliente')
        )
    `;
    expect(columns).toHaveLength(3);

    const constraints = await prisma.$queryRaw<Array<{ conname: string; count: number }>>`
      SELECT conname, COUNT(*)::integer AS count
      FROM pg_constraint
      WHERE conname IN ('fk_contrato_id_prospecto', 'fk_orden_trabajo_id_prospecto')
      GROUP BY conname
    `;
    expect(constraints).toEqual(expect.arrayContaining([
      { conname: 'fk_contrato_id_prospecto', count: 1 },
      { conname: 'fk_orden_trabajo_id_prospecto', count: 1 },
    ]));

    await expect(prisma.empresa.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
