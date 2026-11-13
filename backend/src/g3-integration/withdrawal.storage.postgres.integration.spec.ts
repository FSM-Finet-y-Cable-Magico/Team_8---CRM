import { Prisma, PrismaClient } from '@prisma/client';
import { postgresWithdrawalStorage as storage } from './withdrawal.storage';
import { PUBLIC_DISPATCH_COLUMN_VALUE } from './withdrawal-workflow.service';

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

  it('recepción real de G1: NO_RECIBIDO sin estado_g1 se guarda; RECIBIDO sin estado_g1 o clave no numérica se rechazan', async () => {
    await inTx(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.updateDispatch(tx, 501, { estadoDespacho: 'ACEPTADA', idOtG3: 930 });
      expect(await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-13', [
        reception({ claveEvento: 'g1-recepcion-1-930-13', resultado: 'RECIBIDO_CON_DANO', estadoRecepcion: 'PARCIAL' }),
        reception({ claveEvento: 'g1-recepcion-1-930-13', numeroSerie: 'RTR-999', resultado: 'NO_RECIBIDO', estadoG1: null, fechaRecepcion: null,
          idServicioExterno: null, detalle: 'Equipo no recuperado: Cliente no lo entregó', estadoRecepcion: 'PARCIAL' }),
      ])).toBe('NUEVA');
      expect(await storage.findReceptions(tx, 501)).toEqual(expect.arrayContaining([expect.objectContaining({ numeroSerie: 'RTR-999', estadoG1: null })]));
    });
    await expect(db.$transaction(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-2', [reception({ claveEvento: 'g1-recepcion-1-930-2', estadoG1: null })]);
    })).rejects.toThrow(/recepcion_g1_estado_g1_check/);
    await expect(db.$transaction(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.storeReceptionVersion(tx, 501, 1, 'g1-recepcion-1-930-x', [reception({ claveEvento: 'g1-recepcion-1-930-x' })]);
    })).rejects.toThrow(/recepcion_g1_clave_check/);
  });

  /** True when the ephemeral DB carries the full global contract (db/global/init-global.sql), not a minimal fixture table. */
  async function fullContract(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass('public.usuario') IS NOT NULL AS ok`;
    return Boolean(rows[0]?.ok);
  }
  /** Parent rows a real public.solicitud_retiro_servicio needs (FKs of the global contract); rolled back with the test. */
  async function parents(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`INSERT INTO public.empresa (id_empresa, nombre) VALUES (9001, 'Empresa efimera') ON CONFLICT DO NOTHING`;
    await tx.$executeRaw`INSERT INTO public.usuario (id_usuario, nombre_completo, password_hash) VALUES (9001, 'Usuario efimero', 'x') ON CONFLICT DO NOTHING`;
    await tx.$executeRaw`INSERT INTO public.cliente (id_cliente, id_empresa, nombre_completo, estado) VALUES (9001, 9001, 'Cliente efimero', 'Suspendido') ON CONFLICT DO NOTHING`;
    await tx.$executeRaw`INSERT INTO public.servicio_contratado (id_servicio, id_cliente, id_empresa, tipo_servicio, estado_operativo) VALUES (9001, 9001, 9001, 'Internet', 'Suspendido') ON CONFLICT DO NOTHING`;
  }

  it('la fila pública que crea el inicio cumple el contrato global; el valor de despacho anterior se rechaza (regresión)', async () => {
    await inTx(async tx => {
      if (!(await fullContract(tx))) return; // minimal fixture DB: the static contract test covers it
      await parents(tx);
      const created = await tx.servicioRetiroSolicitud.create({ data: {
        idSolicitudRetiro: 9001, idEmpresa: 9001, idCliente: 9001, idServicio: 9001, motivo: 'MOROSIDAD', fechaSolicitada: new Date('2026-11-13'),
        estado: 'REGISTRADA', estadoDespachoTecnico: PUBLIC_DISPATCH_COLUMN_VALUE, idUsuarioResponsable: 9001, observaciones: 'Prueba efimera',
      } });
      expect(created.estadoDespachoTecnico).toBe('BLOQUEADO_CONTRATO_G3');
      for (const estado of ['EN_GESTION', 'CERRADA', 'CANCELADA']) {
        await tx.servicioRetiroSolicitud.update({ where: { idSolicitudRetiro: 9001 }, data: { estado } });
      }
      await tx.$executeRaw`SAVEPOINT despacho_anterior`;
      await expect(tx.$executeRaw`UPDATE public.solicitud_retiro_servicio SET estado_despacho_tecnico = 'PENDIENTE_ENVIO_G3' WHERE id_solicitud_retiro = 9001`)
        .rejects.toThrow(/solicitud_retiro_servicio_despacho_check/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT despacho_anterior`;
    });
  });

  it('listTrackable: solo OT aceptadas, no aplicadas, OT no cancelada y solicitud CRM activa', async () => {
    await inTx(async tx => {
      const has = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass('public.solicitud_retiro_servicio') IS NOT NULL AS ok`;
      if (!has[0]?.ok) return; // ephemeral DB without the public fixture table: covered by the in-memory harness
      const full = await fullContract(tx);
      if (full) await parents(tx);
      const make = async (id: number, estado: string, patch: Record<string, unknown>) => {
        if (full) {
          await tx.$executeRaw`INSERT INTO public.solicitud_retiro_servicio (id_solicitud_retiro, id_empresa, id_cliente, id_servicio, motivo, fecha_solicitada, id_usuario_responsable, estado)
            VALUES (${id}, 9001, 9001, 9001, 'MOROSIDAD', DATE '2026-11-13', 9001, ${estado})`;
        } else {
          await tx.$executeRaw`INSERT INTO public.solicitud_retiro_servicio (id_solicitud_retiro, estado) VALUES (${id}, ${estado})`;
        }
        await storage.insertDispatch(tx, { ...dispatchRow, idSolicitudRetiro: id, requestId: `g8-retiro-1-${id}` });
        await storage.updateDispatch(tx, id, patch as never);
      };
      await make(601, 'EN_GESTION', { estadoDespacho: 'ACEPTADA', idOtG3: 941 });
      await make(602, 'EN_GESTION', { estadoDespacho: 'CANCELACION_NO_APLICABLE', idOtG3: 942 });
      await make(603, 'CANCELADA', { estadoDespacho: 'ACEPTADA', idOtG3: 943 });
      await make(604, 'EN_GESTION', { estadoDespacho: 'ACEPTADA', idOtG3: 944, estadoOt: 'CANCELADA' });
      await make(605, 'EN_GESTION', { estadoDespacho: 'PENDIENTE' });
      await make(606, 'CERRADA', { estadoDespacho: 'ACEPTADA', idOtG3: 946 });
      expect((await storage.listTrackable(tx, 50)).sort()).toEqual([601, 602]);
      expect(await storage.listTrackable(tx, 1)).toHaveLength(1);
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
