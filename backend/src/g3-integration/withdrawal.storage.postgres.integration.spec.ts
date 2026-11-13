import { Prisma, PrismaClient } from '@prisma/client';
import { postgresWithdrawalStorage as storage } from './withdrawal.storage';

/**
 * Real SQL of the private g8_retiros storage against an EPHEMERAL PostgreSQL with
 * db/g8/migrations/002_service_withdrawal.sql + grants applied, connected as the RUNTIME role.
 * Skipped unless G8_WITHDRAWAL_PG_TEST_URL is set; it refuses anything that is not loopback and a
 * database named g8moro_* (never the shared finet_global_validacion). Every test rolls back.
 */
const raw = process.env.G8_WITHDRAWAL_PG_TEST_URL;
const allowed = (() => {
  if (!raw) return false;
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || !/^\/g8moro_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('ISOLATED_EPHEMERAL_DB_REQUIRED');
  }
  return true;
})();

class Rollback extends Error {}
(allowed ? describe : describe.skip)('g8_retiros: SQL real contra PostgreSQL efímera (rol de aplicación)', () => {
  let db: PrismaClient;
  beforeAll(() => { db = new PrismaClient({ log: [], datasources: { db: { url: raw! } } }); });
  afterAll(async () => { await db?.$disconnect(); });

  async function inTx(work: (tx: Prisma.TransactionClient) => Promise<void>) {
    await expect(db.$transaction(async tx => { await work(tx); throw new Rollback(); })).rejects.toBeInstanceOf(Rollback);
  }
  const snapshot = { request_id: 'g8-retiro-1-501', trace_id: '7d1f2c3a-9b8e-4c6d-a1b2-3c4d5e6f7a8b', comuna_retiro: 'Ñuñoa' };
  const dispatchRow = { idSolicitudRetiro: 501, idEmpresa: 1, requestId: 'g8-retiro-1-501', traceId: snapshot.trace_id, payloadSnapshot: snapshot, payloadHash: 'a'.repeat(64) };
  const reception = (over: Record<string, unknown> = {}) => ({ numeroSerie: 'QA-ONT-1', idOtG3: 930, resultado: 'RECIBIDO', estadoG1: 'En revisión',
    fechaRecepcion: new Date('2026-11-13T15:00:00Z'), idServicioExterno: 61, detalle: null, claveEvento: 'g1-recepcion-1-930-1', estadoRecepcion: 'COMPLETA', ...over });

  it('detecta el esquema aplicado', async () => {
    expect(await storage.capabilities(db as unknown as Prisma.TransactionClient)).toEqual({ ticketLink: true, g3Dispatch: true, g1Reception: true });
  });

  it('vínculo, despacho (uuid + jsonb), claim atómico y actualización', async () => {
    await inTx(async tx => {
      await storage.insertLink(tx, { idSolicitudRetiro: 501, idTicket: 9001, idAviso: 7, idEmpresa: 1, idCliente: 33, idServicio: 61, idContrato: 20, idUsuarioResponsable: 7 });
      expect(await storage.findLinkByTicket(tx, 9001)).toMatchObject({ idSolicitudRetiro: 501 });
      const created = await storage.insertDispatch(tx, dispatchRow);
      expect(created).toMatchObject({ estadoDespacho: 'PENDIENTE', intentos: 0, traceId: snapshot.trace_id, payloadSnapshot: snapshot });
      const claimed = await storage.claimDispatch(tx, 501, new Date(Date.now() - 300_000));
      expect(claimed).toMatchObject({ estadoDespacho: 'ENVIANDO', intentos: 1 });
      expect(await storage.claimDispatch(tx, 501, new Date(Date.now() - 300_000))).toBeNull();
      await storage.updateDispatch(tx, 501, { estadoDespacho: 'ACEPTADA', idOtG3: 930, estadoOt: 'PENDIENTE', estadoOtLeidoEn: new Date(),
        equiposRetirados: [{ numeroSerie: 'QA-ONT-1' }], equiposFaltantes: [] });
      expect(await storage.findDispatchByRequestId(tx, 'g8-retiro-1-501', true)).toMatchObject({ idOtG3: 930, estadoOt: 'PENDIENTE', equiposRetirados: [{ numeroSerie: 'QA-ONT-1' }] });
    });
  });

  it('recepciones: versión nueva, repetida, conflicto y vigente', async () => {
    await inTx(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.updateDispatch(tx, 501, { estadoDespacho: 'ACEPTADA', idOtG3: 930 });
      expect(await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-1', [reception({ estadoRecepcion: 'PARCIAL' })])).toBe('NUEVA');
      expect(await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-1', [reception({ estadoRecepcion: 'PARCIAL' })])).toBe('REPETIDA');
      expect(await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-1', [reception({ estadoRecepcion: 'COMPLETA' })])).toBe('CONFLICTO');
      expect(await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-2', [reception({ claveEvento: 'g1-recepcion-1-930-2' })])).toBe('NUEVA');
      const current = await storage.findReceptions(tx, 501);
      expect(current).toHaveLength(1);
      expect(current[0]).toMatchObject({ claveEvento: 'g1-recepcion-1-930-2', estadoRecepcion: 'COMPLETA', idServicioExterno: 61 });
    });
  });

  it('las restricciones protegen la evidencia', async () => {
    await expect(db.$transaction(tx => storage.insertDispatch(tx, { ...dispatchRow, requestId: 'g8-retiro-2-501' }))).rejects.toThrow(/solicitud_g3_request_check/);
    await expect(db.$transaction(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.markApplied(tx, 501);
    })).rejects.toThrow(/solicitud_g3_aplicado_check/);
    await expect(db.$transaction(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.updateDispatch(tx, 501, { idOtG3: 930, cierreClave: 'baja:931' });
    })).rejects.toThrow(/solicitud_g3_cierre_check/);
  });

  it('el rol de aplicación no puede borrar evidencia ni tocar tablas públicas', async () => {
    await expect(db.$executeRawUnsafe('DELETE FROM g8_retiros.recepcion_g1')).rejects.toThrow(/permission denied/);
    await expect(db.$executeRawUnsafe('DELETE FROM g8_retiros.solicitud_g3')).rejects.toThrow(/permission denied/);
    await expect(db.$executeRawUnsafe('UPDATE g8_retiros.recepcion_g1 SET detalle = NULL')).rejects.toThrow(/permission denied/);
  });
});
