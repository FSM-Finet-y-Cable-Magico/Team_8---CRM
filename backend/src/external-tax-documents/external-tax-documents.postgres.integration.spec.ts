import { Prisma, PrismaClient } from '@prisma/client';

const run = process.env.RUN_POSTGRES_INTEGRATION_TESTS === 'true';
const describePostgres = run ? describe : describe.skip;

describePostgres('Etapa 5 - PostgreSQL local', () => {
  const prisma = new PrismaClient();
  let idEmpresa: number;
  let idUsuario: number;

  beforeAll(async () => {
    await prisma.$connect();
    const marker = `${Date.now()}-${process.pid}`;
    const company = await prisma.empresa.create({ data: { nombre: `Empresa test Etapa 5 ${marker}` } });
    const user = await prisma.usuario.create({ data: { idEmpresa: company.idEmpresa, nombreCompleto: 'Usuario test Etapa 5', passwordHash: 'test-only-not-a-real-credential' } });
    idEmpresa = company.idEmpresa;
    idUsuario = user.idUsuario;
  });

  afterAll(async () => {
    await prisma.documentoTributarioExterno.deleteMany({ where: { idEmpresa } });
    await prisma.usuario.delete({ where: { idUsuario } });
    await prisma.empresa.delete({ where: { idEmpresa } });
    await prisma.$disconnect();
  });

  it('la migración creó tabla y constraint de identidad', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'documento_tributario_externo'
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'documento_tributario_externo'
    `;
    expect(tables).toHaveLength(1);
    expect(indexes.map((row) => row.indexname)).toContain('documento_tributario_externo_identidad_key');
  });

  it('constraint duplicado opera dentro de empresa y la transacción revierte', async () => {
    const marker = `PG-DUP-${Date.now()}`;
    const create = {
      idEmpresa, tipoDocumento: 'BOLETA', folioONumero: marker, folioNormalizado: marker,
      emisorProveedor: 'Proveedor test', emisorNormalizado: 'PROVEEDOR TEST', fechaEmision: new Date('2026-09-27T00:00:00.000Z'),
      montoTotal: new Prisma.Decimal('1000.00'), estado: 'REGISTRADO', fuente: 'EXTERNO_MANUAL', idUsuarioRegistro: idUsuario,
    };
    await expect(prisma.$transaction(async (tx) => {
      await tx.documentoTributarioExterno.create({ data: create });
      await tx.documentoTributarioExterno.create({ data: create });
    })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.documentoTributarioExterno.count({ where: { folioNormalizado: marker } })).toBe(0);
  });

  it('FK de empresa rechaza referencia inexistente y revierte', async () => {
    const marker = `PG-FK-${Date.now()}`;
    await expect(prisma.documentoTributarioExterno.create({ data: {
      idEmpresa: 2147483647, tipoDocumento: 'FACTURA', folioONumero: marker, folioNormalizado: marker,
      emisorProveedor: 'Proveedor test', emisorNormalizado: 'PROVEEDOR TEST', fechaEmision: new Date('2026-09-27T00:00:00.000Z'),
      montoTotal: new Prisma.Decimal('10.00'), idUsuarioRegistro: idUsuario,
    } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('preserva Decimal exacto y rollback de una escritura válida', async () => {
    const marker = `PG-DEC-${Date.now()}`;
    await expect(prisma.$transaction(async (tx) => {
      const row = await tx.documentoTributarioExterno.create({ data: {
        idEmpresa, tipoDocumento: 'FACTURA', folioONumero: marker, folioNormalizado: marker,
        emisorProveedor: 'Proveedor test', emisorNormalizado: 'PROVEEDOR TEST', fechaEmision: new Date('2026-09-27T00:00:00.000Z'),
        montoNeto: new Prisma.Decimal('100.01'), montoExento: new Prisma.Decimal('0.00'), iva: new Prisma.Decimal('19.00'),
        montoTotal: new Prisma.Decimal('119.01'), idUsuarioRegistro: idUsuario,
      } });
      expect(row.montoTotal.toFixed(2)).toBe('119.01');
      throw new Error('ROLLBACK_ETAPA_5');
    })).rejects.toThrow('ROLLBACK_ETAPA_5');
    expect(await prisma.documentoTributarioExterno.count({ where: { folioNormalizado: marker } })).toBe(0);
  });
});
