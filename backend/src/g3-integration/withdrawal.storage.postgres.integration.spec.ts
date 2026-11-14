import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formerCustomerInCompanyWhere } from '../common/returning-customer';
import { postgresWithdrawalStorage as storage } from './withdrawal.storage';
import { PUBLIC_DISPATCH_COLUMN_VALUE } from './withdrawal-workflow.service';

/**
 * Real SQL of the private g8_retiros storage against an EPHEMERAL PostgreSQL with
 * db/g8/migrations/002_service_withdrawal.sql + 003_withdrawal_voluntary_termination.sql + both grants applied, connected as the RUNTIME role.
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
    expect(await storage.capabilities(db as unknown as Prisma.TransactionClient)).toEqual({ ticketLink: true, g3Dispatch: true, g1Reception: true, termination: true });
  });

  it('vínculo, despacho (uuid + jsonb), claim atómico y actualización', async () => {
    await inTx(async tx => {
      await storage.insertLink(tx, { idSolicitudRetiro: 501, idTicket: 9001, idAviso: 7, causa: 'MOROSIDAD', idEmpresa: 1, idCliente: 33, idServicio: 61, idContrato: 20, idUsuarioResponsable: 7 });
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

  // 003 (FINET 13-11-2026): this is the check the in-memory harness cannot prove. Pending execution by whoever applies
  // 002 + 003 in an authorized ephemeral database (not run in this environment: no new databases allowed).
  it('003: la baja aplicada no exige recepción G1, pero sí OT COMPLETADA y cierre BAJA', async () => {
    await inTx(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.updateDispatch(tx, 501, { estadoDespacho: 'ACEPTADA', idOtG3: 930, estadoOt: 'COMPLETADA', cierreClave: 'baja:930' });
      await storage.markApplied(tx, 501); // no recepcion_clave_evento: 002's check would reject this
      expect(await storage.findDispatch(tx, 501)).toMatchObject({ aplicadoEn: expect.any(Date), recepcionClaveEvento: null });
    });
    await expect(db.$transaction(async tx => {
      await storage.insertDispatch(tx, dispatchRow);
      await storage.updateDispatch(tx, 501, { estadoDespacho: 'ACEPTADA', idOtG3: 930, estadoOt: 'PENDIENTE_APROBACION' });
      await storage.markApplied(tx, 501);
    })).rejects.toThrow(/solicitud_g3_aplicado_check/);
  });

  it('003: vínculo por causa (aviso solo en MOROSIDAD) y término voluntario único por servicio y ticket', async () => {
    await inTx(async tx => {
      await storage.insertLink(tx, { idSolicitudRetiro: 502, idTicket: 9002, idAviso: null, causa: 'VOLUNTARIA', idEmpresa: 1, idCliente: 33, idServicio: 62, idContrato: 20, idUsuarioResponsable: 7 });
      const created = await storage.insertTermination(tx, { idServicio: 62, idEmpresa: 1, idCliente: 33, idContrato: 20, idTicket: 9002, idSolicitudRetiro: 502,
        requerimientoEn: new Date('2026-11-13T14:30:00Z'), canal: 'TELEFONO', solicitante: 'TITULAR', evidencia: 'Llamada grabada QA', idUsuarioResponsable: 7 });
      expect(created).toMatchObject({ idServicio: 62, cierreTecnicoEn: null });
      await storage.markTerminationTechnicalClosure(tx, 62);
      expect(await storage.findTerminationByTicket(tx, 9002)).toMatchObject({ idSolicitudRetiro: 502, cierreTecnicoEn: expect.any(Date) });
    });
    for (const link of [{ idAviso: null, causa: 'MOROSIDAD' as const }, { idAviso: 7, causa: 'VOLUNTARIA' as const }]) {
      await expect(db.$transaction(async tx => {
        await storage.insertLink(tx, { idSolicitudRetiro: 503, idTicket: 9003, ...link, idEmpresa: 1, idCliente: 33, idServicio: 62, idContrato: 20, idUsuarioResponsable: 7 });
      })).rejects.toThrow(/solicitud_ticket_causa_check/);
    }
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

  it('consulta de exclientes históricos (solo lectura): por empresa, igual que la condición de la aplicación', async () => {
    await inTx(async tx => {
      if (!(await fullContract(tx))) return;
      const sql = readFileSync(join(__dirname, '..', '..', '..', 'db', 'g8', 'queries', 'exclientes-historicos.readonly.sql'), 'utf8');
      const q1 = sql.slice(sql.indexOf('WITH con_baja'), sql.indexOf('ROLLBACK;')).trim().replace(/;$/, '');
      await tx.$executeRaw`INSERT INTO public.empresa (id_empresa, nombre) VALUES (9101, 'E1 efimera'), (9102, 'E2 efimera')`;
      const customer = (id: number, rut: string) => tx.$executeRaw`INSERT INTO public.cliente (id_cliente, id_empresa, nombre_completo, rut, estado) VALUES (${id}, 9101, 'QA', ${rut}, 'Baja')`;
      const service = (id: number, idCliente: number, idEmpresa: number, estado: string) =>
        tx.$executeRaw`INSERT INTO public.servicio_contratado (id_servicio, id_cliente, id_empresa, tipo_servicio, estado_operativo) VALUES (${id}, ${idCliente}, ${idEmpresa}, 'Internet', ${estado})`;
      const contract = (id: number, idCliente: number, idEmpresa: number, estado: string) =>
        tx.$executeRaw`INSERT INTO public.contrato (id_contrato, id_cliente, id_empresa, fecha_inicio, dia_vencimiento, estado) VALUES (${id}, ${idCliente}, ${idEmpresa}, DATE '2026-01-01', 10, ${estado})`;
      const prospect = (id: number, idCliente: number | null, idEmpresa: number, rut: string) =>
        tx.$executeRaw`INSERT INTO public.prospecto (id_prospecto, id_empresa, id_cliente, rut, nombre_completo) VALUES (${id}, ${idEmpresa}, ${idCliente}, ${rut}, 'QA')`;
      for (const [id, rut] of [[9201, '91000001-1'], [9202, '91000002-2'], [9203, '91000003-3'], [9204, '91000004-4'], [9205, '91000005-5'], [9206, '91000006-6']] as const) await customer(id, rut);
      await service(9301, 9201, 9101, 'Baja'); await prospect(9401, 9201, 9101, '91000001-1');           // excliente E1, visible
      await service(9302, 9202, 9101, 'Baja'); await service(9303, 9202, 9101, 'Activo');               // keeps another service: no
      await contract(9501, 9203, 9101, 'Baja'); await contract(9502, 9203, 9101, 'Activo');             // keeps another contract: no
      await service(9304, 9204, 9101, 'Baja'); await service(9305, 9204, 9102, 'Activo');               // excliente only in E1
      await prospect(9402, null, 9101, '91.000.004-4');                                                  // same RUT, unlinked: review
      await contract(9503, 9205, 9101, 'Anulado');                                                       // no Baja at all: no
      await service(9306, 9206, 9102, 'Baja'); await prospect(9403, 9206, 9102, '91000006-6'); await prospect(9404, 9206, 9102, '91000006-6');
      const rows = (await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(q1))
        .filter(row => [9101, 9102].includes(Number(row.id_empresa)))
        .map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])));
      expect(rows).toEqual([
        { id_empresa: 9101, empresa: 'E1 efimera', exclientes_total: 2, visibles_hoy_en_prospectos: 1, filas_de_prospecto_visibles: 1, sin_prospecto_vinculado: 1, revision_mismo_rut_sin_vinculo: 1 },
        { id_empresa: 9102, empresa: 'E2 efimera', exclientes_total: 1, visibles_hoy_en_prospectos: 1, filas_de_prospecto_visibles: 2, sin_prospecto_vinculado: 0, revision_mismo_rut_sin_vinculo: 0 },
      ]);
      // Same answer as the application's derived condition, company by company.
      for (const [idEmpresa, total] of [[9101, 2], [9102, 1]]) {
        expect(await tx.cliente.count({ where: { AND: [{ idCliente: { gte: 9201, lte: 9206 } }, formerCustomerInCompanyWhere(idEmpresa)] } })).toBe(total);
      }
    });
  });
});
