import { Prisma } from '@prisma/client';

/**
 * Private G8 storage for the withdrawal-for-morosity flow (schema `g8_retiros`).
 * Same policy as the signature storage (`g8_contratos`): schema-qualified SQL on the caller's
 * transaction, no Prisma model, no FK/trigger on shared public tables, and a capability probe.
 * Until the owner approves and applies db/g8/migrations/002_service_withdrawal.sql the flow
 * answers BLOCKED and writes nothing: there is no apparent success.
 * Ported from PR #81 and extended for the real G3/G1 contracts (dispatch snapshot, OT state,
 * BAJA closure evidence and G1 receptions per serial).
 */
export const WITHDRAWAL_STORAGE = Symbol('WITHDRAWAL_STORAGE');
type Db = Prisma.TransactionClient;

/** `termination`: 003_withdrawal_voluntary_termination.sql applied (cause per link, termination record, G1-free applied check). */
export type WithdrawalCapabilities = { ticketLink: boolean; g3Dispatch: boolean; g1Reception: boolean; termination: boolean };
/** The engine needs 002 AND 003: without 003 the applied check of 002 would reject a baja without a G1 reception. */
export const withdrawalStorageReady = (c: WithdrawalCapabilities) => c.ticketLink && c.g3Dispatch && c.termination;

/** One withdrawal engine, two causes (FINET 13-11-2026). */
export const WITHDRAWAL_CAUSES = ['MOROSIDAD', 'VOLUNTARIA'] as const;
export type WithdrawalCause = (typeof WITHDRAWAL_CAUSES)[number];

export type WithdrawalTicketLink = {
  idSolicitudRetiro: number; idTicket: number; idAviso: number | null; causa: WithdrawalCause; idEmpresa: number; idCliente: number;
  idServicio: number; idContrato: number; idUsuarioResponsable: number; createdAt: Date;
};

export const TERMINATION_CHANNELS = ['PRESENCIAL', 'TELEFONO', 'CORREO', 'WHATSAPP', 'PORTAL', 'OTRO'] as const;
export const TERMINATION_REQUESTERS = ['TITULAR', 'REPRESENTANTE'] as const;
/** Voluntary commercial termination of a service (g8_retiros.termino_servicio, 003). */
export type ServiceTermination = {
  idServicio: number; idEmpresa: number; idCliente: number; idContrato: number; idTicket: number; idSolicitudRetiro: number | null;
  requerimientoEn: Date; canal: (typeof TERMINATION_CHANNELS)[number]; solicitante: (typeof TERMINATION_REQUESTERS)[number]; evidencia: string;
  idUsuarioResponsable: number; terminoComercialEn: Date; cierreTecnicoEn: Date | null;
};

export const DISPATCH_STATES = ['PENDIENTE', 'ENVIANDO', 'REINTENTABLE', 'ACEPTADA', 'RECHAZADA', 'INCONSISTENTE',
  'CANCELADA', 'CANCELACION_NO_APLICABLE'] as const;
export type DispatchState = (typeof DISPATCH_STATES)[number];

export type WithdrawalEquipment = { numeroSerie: string; motivo?: string | null; conDano?: boolean | null; diagnostico?: string | null };

export type WithdrawalDispatch = {
  idSolicitudRetiro: number; idEmpresa: number; requestId: string; traceId: string;
  payloadSnapshot: Record<string, unknown>; payloadHash: string;
  estadoDespacho: DispatchState; intentos: number; ultimoIntentoEn: Date | null; ultimoErrorCodigo: string | null; ultimoErrorStatus: number | null;
  idOtG3: number | null; estadoOt: string | null; estadoOtLeidoEn: Date | null; fechaCompletadaG3: Date | null;
  cierreClave: string | null; cierreHash: string | null; cierreRecibidoEn: Date | null;
  equiposRetirados: WithdrawalEquipment[]; equiposFaltantes: WithdrawalEquipment[];
  recepcionClaveEvento: string | null; recepcionSincronizadaEn: Date | null;
  aplicadoEn: Date | null;
};

export type StoredReception = {
  numeroSerie: string; idOtG3: number; resultado: string; estadoG1: string | null; fechaRecepcion: Date | null;
  idServicioExterno: number | null; detalle: string | null; claveEvento: string; estadoRecepcion: string;
};

export interface WithdrawalStorage {
  capabilities(tx: Db): Promise<WithdrawalCapabilities>;
  findLinkByRequest(tx: Db, idSolicitudRetiro: number): Promise<WithdrawalTicketLink | null>;
  findLinkByTicket(tx: Db, idTicket: number): Promise<WithdrawalTicketLink | null>;
  insertLink(tx: Db, link: Omit<WithdrawalTicketLink, 'createdAt'>): Promise<WithdrawalTicketLink>;
  insertDispatch(tx: Db, row: { idSolicitudRetiro: number; idEmpresa: number; requestId: string; traceId: string; payloadSnapshot: object; payloadHash: string }): Promise<WithdrawalDispatch>;
  findDispatch(tx: Db, idSolicitudRetiro: number, lock?: boolean): Promise<WithdrawalDispatch | null>;
  findDispatchByRequestId(tx: Db, requestId: string, lock?: boolean): Promise<WithdrawalDispatch | null>;
  /** Atomically takes the right to send (PENDIENTE/REINTENTABLE or a stale ENVIANDO); null if someone else has it. */
  claimDispatch(tx: Db, idSolicitudRetiro: number, staleBefore: Date): Promise<WithdrawalDispatch | null>;
  updateDispatch(tx: Db, idSolicitudRetiro: number, patch: Partial<Pick<WithdrawalDispatch, 'estadoDespacho' | 'ultimoErrorCodigo' | 'ultimoErrorStatus'
    | 'idOtG3' | 'estadoOt' | 'estadoOtLeidoEn' | 'fechaCompletadaG3' | 'cierreClave' | 'cierreHash' | 'cierreRecibidoEn' | 'equiposRetirados' | 'equiposFaltantes'>>): Promise<void>;
  /** Receptions of the CURRENT G1 version (clave_evento) only. */
  findReceptions(tx: Db, idSolicitudRetiro: number): Promise<StoredReception[]>;
  /**
   * Stores one G1 reception version immutably (insert-only history) and points the request to it.
   * Same clave_evento with different content -> 'CONFLICTO' and nothing is written.
   */
  storeReceptionVersion(tx: Db, idSolicitudRetiro: number, idEmpresa: number, claveEvento: string, rows: StoredReception[]): Promise<'NUEVA' | 'REPETIDA' | 'CONFLICTO'>;
  markApplied(tx: Db, idSolicitudRetiro: number): Promise<void>;
  /**
   * Requests whose follow-up is still meaningful: an OT accepted by G3 (also when G3 refused a late cancellation),
   * not applied, OT not cancelled and the CRM request neither closed nor cancelled. Terminal ones never come back.
   */
  listTrackable(tx: Db, limit: number): Promise<number[]>;
  insertTermination(tx: Db, row: Omit<ServiceTermination, 'terminoComercialEn' | 'cierreTecnicoEn'>): Promise<ServiceTermination>;
  findTerminationByService(tx: Db, idServicio: number): Promise<ServiceTermination | null>;
  findTerminationByRequest(tx: Db, idSolicitudRetiro: number): Promise<ServiceTermination | null>;
  findTerminationByTicket(tx: Db, idTicket: number): Promise<ServiceTermination | null>;
  markTerminationTechnicalClosure(tx: Db, idServicio: number): Promise<void>;
}

const LINK_COLUMNS = Prisma.sql`id_solicitud_retiro AS "idSolicitudRetiro", id_ticket AS "idTicket", id_aviso AS "idAviso", causa,
  id_empresa AS "idEmpresa", id_cliente AS "idCliente", id_servicio AS "idServicio", id_contrato AS "idContrato",
  id_usuario_responsable AS "idUsuarioResponsable", created_at AS "createdAt"`;

const DISPATCH_COLUMNS = Prisma.sql`id_solicitud_retiro AS "idSolicitudRetiro", id_empresa AS "idEmpresa", request_id AS "requestId",
  trace_id::text AS "traceId", payload_snapshot AS "payloadSnapshot", payload_hash AS "payloadHash", estado_despacho AS "estadoDespacho",
  intentos, ultimo_intento_en AS "ultimoIntentoEn", ultimo_error_codigo AS "ultimoErrorCodigo", ultimo_error_status AS "ultimoErrorStatus",
  id_ot_g3 AS "idOtG3", estado_ot AS "estadoOt", estado_ot_leido_en AS "estadoOtLeidoEn", fecha_completada_g3 AS "fechaCompletadaG3",
  cierre_clave AS "cierreClave", cierre_hash AS "cierreHash", cierre_recibido_en AS "cierreRecibidoEn",
  equipos_retirados AS "equiposRetirados", equipos_faltantes AS "equiposFaltantes",
  recepcion_clave_evento AS "recepcionClaveEvento", recepcion_sincronizada_en AS "recepcionSincronizadaEn", aplicado_en AS "aplicadoEn"`;

const TERMINATION_COLUMNS = Prisma.sql`id_servicio AS "idServicio", id_empresa AS "idEmpresa", id_cliente AS "idCliente", id_contrato AS "idContrato",
  id_ticket AS "idTicket", id_solicitud_retiro AS "idSolicitudRetiro", requerimiento_en AS "requerimientoEn", canal, solicitante, evidencia,
  id_usuario_responsable AS "idUsuarioResponsable", termino_comercial_en AS "terminoComercialEn", cierre_tecnico_en AS "cierreTecnicoEn"`;

const RECEPTION_COLUMNS = Prisma.sql`numero_serie AS "numeroSerie", id_ot_g3 AS "idOtG3", resultado, estado_g1 AS "estadoG1",
  fecha_recepcion AS "fechaRecepcion", id_servicio_externo AS "idServicioExterno", detalle, clave_evento AS "claveEvento",
  estado_recepcion AS "estadoRecepcion"`;

const PATCH_COLUMNS: Record<string, string> = {
  estadoDespacho: 'estado_despacho', ultimoErrorCodigo: 'ultimo_error_codigo', ultimoErrorStatus: 'ultimo_error_status', idOtG3: 'id_ot_g3',
  estadoOt: 'estado_ot', estadoOtLeidoEn: 'estado_ot_leido_en', fechaCompletadaG3: 'fecha_completada_g3', cierreClave: 'cierre_clave',
  cierreHash: 'cierre_hash', cierreRecibidoEn: 'cierre_recibido_en', equiposRetirados: 'equipos_retirados', equiposFaltantes: 'equipos_faltantes',
};

export const postgresWithdrawalStorage: WithdrawalStorage = {
  async capabilities(tx) {
    const rows = await tx.$queryRaw<Array<WithdrawalCapabilities>>`
      SELECT to_regclass('g8_retiros.solicitud_ticket') IS NOT NULL AS "ticketLink",
             to_regclass('g8_retiros.solicitud_g3') IS NOT NULL AS "g3Dispatch",
             to_regclass('g8_retiros.recepcion_g1') IS NOT NULL AS "g1Reception",
             to_regclass('g8_retiros.termino_servicio') IS NOT NULL AS "termination"`;
    return { ticketLink: rows[0]?.ticketLink === true, g3Dispatch: rows[0]?.g3Dispatch === true, g1Reception: rows[0]?.g1Reception === true,
      termination: rows[0]?.termination === true };
  },
  async findLinkByRequest(tx, idSolicitudRetiro) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`SELECT ${LINK_COLUMNS} FROM g8_retiros.solicitud_ticket WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
    return rows[0] ?? null;
  },
  async findLinkByTicket(tx, idTicket) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`SELECT ${LINK_COLUMNS} FROM g8_retiros.solicitud_ticket WHERE id_ticket = ${idTicket}`);
    return rows[0] ?? null;
  },
  async insertLink(tx, link) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`
      INSERT INTO g8_retiros.solicitud_ticket (id_solicitud_retiro, id_ticket, id_aviso, causa, id_empresa, id_cliente, id_servicio, id_contrato, id_usuario_responsable)
      VALUES (${link.idSolicitudRetiro}, ${link.idTicket}, ${link.idAviso}, ${link.causa}, ${link.idEmpresa}, ${link.idCliente}, ${link.idServicio}, ${link.idContrato}, ${link.idUsuarioResponsable})
      RETURNING ${LINK_COLUMNS}`);
    if (!rows[0]) throw new Error('WITHDRAWAL_LINK_NOT_STORED');
    return rows[0];
  },
  async insertDispatch(tx, row) {
    const rows = await tx.$queryRaw<WithdrawalDispatch[]>(Prisma.sql`
      INSERT INTO g8_retiros.solicitud_g3 (id_solicitud_retiro, id_empresa, request_id, trace_id, payload_snapshot, payload_hash)
      VALUES (${row.idSolicitudRetiro}, ${row.idEmpresa}, ${row.requestId}, ${row.traceId}::uuid, ${JSON.stringify(row.payloadSnapshot)}::jsonb, ${row.payloadHash})
      RETURNING ${DISPATCH_COLUMNS}`);
    if (!rows[0]) throw new Error('WITHDRAWAL_DISPATCH_NOT_STORED');
    return rows[0];
  },
  async findDispatch(tx, idSolicitudRetiro, lock = false) {
    const rows = await tx.$queryRaw<WithdrawalDispatch[]>(Prisma.sql`
      SELECT ${DISPATCH_COLUMNS} FROM g8_retiros.solicitud_g3 WHERE id_solicitud_retiro = ${idSolicitudRetiro} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    return rows[0] ?? null;
  },
  async findDispatchByRequestId(tx, requestId, lock = false) {
    const rows = await tx.$queryRaw<WithdrawalDispatch[]>(Prisma.sql`
      SELECT ${DISPATCH_COLUMNS} FROM g8_retiros.solicitud_g3 WHERE request_id = ${requestId} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    return rows[0] ?? null;
  },
  async claimDispatch(tx, idSolicitudRetiro, staleBefore) {
    const rows = await tx.$queryRaw<WithdrawalDispatch[]>(Prisma.sql`
      UPDATE g8_retiros.solicitud_g3
      SET estado_despacho = 'ENVIANDO', intentos = intentos + 1, ultimo_intento_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id_solicitud_retiro = ${idSolicitudRetiro}
        AND (estado_despacho IN ('PENDIENTE', 'REINTENTABLE') OR (estado_despacho = 'ENVIANDO' AND ultimo_intento_en < ${staleBefore}))
      RETURNING ${DISPATCH_COLUMNS}`);
    return rows[0] ?? null;
  },
  async updateDispatch(tx, idSolicitudRetiro, patch) {
    const sets = Object.entries(patch).filter(([key]) => PATCH_COLUMNS[key]).map(([key, value]) => {
      const column = Prisma.raw(PATCH_COLUMNS[key]);
      return key === 'equiposRetirados' || key === 'equiposFaltantes'
        ? Prisma.sql`${column} = ${JSON.stringify(value ?? [])}::jsonb`
        : Prisma.sql`${column} = ${value as never}`;
    });
    if (!sets.length) return;
    await tx.$executeRaw(Prisma.sql`UPDATE g8_retiros.solicitud_g3 SET ${Prisma.join(sets)}, updated_at = CURRENT_TIMESTAMP
      WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
  },
  async findReceptions(tx, idSolicitudRetiro) {
    // Subquery (not a JOIN): both tables have id_ot_g3, an unqualified projection would be ambiguous.
    return tx.$queryRaw<StoredReception[]>(Prisma.sql`SELECT ${RECEPTION_COLUMNS} FROM g8_retiros.recepcion_g1
      WHERE id_solicitud_retiro = ${idSolicitudRetiro}
        AND clave_evento = (SELECT recepcion_clave_evento FROM g8_retiros.solicitud_g3 WHERE id_solicitud_retiro = ${idSolicitudRetiro})
      ORDER BY numero_serie`);
  },
  async storeReceptionVersion(tx, idSolicitudRetiro, idEmpresa, claveEvento, rows) {
    const existing = await tx.$queryRaw<StoredReception[]>(Prisma.sql`SELECT ${RECEPTION_COLUMNS} FROM g8_retiros.recepcion_g1
      WHERE id_solicitud_retiro = ${idSolicitudRetiro} AND clave_evento = ${claveEvento} ORDER BY numero_serie`);
    const fingerprint = (items: StoredReception[]) => JSON.stringify([...items]
      .map(item => [item.numeroSerie, item.idOtG3, item.resultado, item.estadoG1, item.fechaRecepcion ? new Date(item.fechaRecepcion).toISOString() : null,
        item.idServicioExterno, item.detalle, item.estadoRecepcion])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    if (existing.length) {
      if (fingerprint(existing) !== fingerprint(rows)) return 'CONFLICTO';
    } else {
      for (const row of rows) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO g8_retiros.recepcion_g1 (id_solicitud_retiro, id_empresa, id_ot_g3, numero_serie, resultado, estado_g1, fecha_recepcion,
            id_servicio_externo, detalle, clave_evento, estado_recepcion)
          VALUES (${idSolicitudRetiro}, ${idEmpresa}, ${row.idOtG3}, ${row.numeroSerie}, ${row.resultado}, ${row.estadoG1}, ${row.fechaRecepcion},
            ${row.idServicioExterno}, ${row.detalle}, ${claveEvento}, ${row.estadoRecepcion})`);
      }
    }
    await tx.$executeRaw(Prisma.sql`UPDATE g8_retiros.solicitud_g3 SET recepcion_clave_evento = ${claveEvento},
      recepcion_sincronizada_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
    return existing.length ? 'REPETIDA' : 'NUEVA';
  },
  async listTrackable(tx, limit) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT g.id_solicitud_retiro AS id FROM g8_retiros.solicitud_g3 g
      WHERE g.aplicado_en IS NULL AND g.id_ot_g3 IS NOT NULL
        AND g.estado_despacho IN ('ACEPTADA', 'CANCELACION_NO_APLICABLE')
        AND (g.estado_ot IS NULL OR g.estado_ot <> 'CANCELADA')
        AND EXISTS (SELECT 1 FROM public.solicitud_retiro_servicio r
                    WHERE r.id_solicitud_retiro = g.id_solicitud_retiro AND r.estado NOT IN ('CERRADA', 'CANCELADA'))
      ORDER BY g.updated_at ASC, g.id_solicitud_retiro ASC
      LIMIT ${limit}`);
    return rows.map(row => Number(row.id));
  },
  async markApplied(tx, idSolicitudRetiro) {
    await tx.$executeRaw(Prisma.sql`UPDATE g8_retiros.solicitud_g3 SET aplicado_en = COALESCE(aplicado_en, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
  },
  async insertTermination(tx, row) {
    const rows = await tx.$queryRaw<ServiceTermination[]>(Prisma.sql`
      INSERT INTO g8_retiros.termino_servicio (id_servicio, id_empresa, id_cliente, id_contrato, id_ticket, id_solicitud_retiro, requerimiento_en,
        canal, solicitante, evidencia, id_usuario_responsable)
      VALUES (${row.idServicio}, ${row.idEmpresa}, ${row.idCliente}, ${row.idContrato}, ${row.idTicket}, ${row.idSolicitudRetiro}, ${row.requerimientoEn},
        ${row.canal}, ${row.solicitante}, ${row.evidencia}, ${row.idUsuarioResponsable})
      RETURNING ${TERMINATION_COLUMNS}`);
    if (!rows[0]) throw new Error('SERVICE_TERMINATION_NOT_STORED');
    return rows[0];
  },
  async findTerminationByService(tx, idServicio) {
    const rows = await tx.$queryRaw<ServiceTermination[]>(Prisma.sql`SELECT ${TERMINATION_COLUMNS} FROM g8_retiros.termino_servicio WHERE id_servicio = ${idServicio}`);
    return rows[0] ?? null;
  },
  async findTerminationByRequest(tx, idSolicitudRetiro) {
    const rows = await tx.$queryRaw<ServiceTermination[]>(Prisma.sql`SELECT ${TERMINATION_COLUMNS} FROM g8_retiros.termino_servicio WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
    return rows[0] ?? null;
  },
  async findTerminationByTicket(tx, idTicket) {
    const rows = await tx.$queryRaw<ServiceTermination[]>(Prisma.sql`SELECT ${TERMINATION_COLUMNS} FROM g8_retiros.termino_servicio WHERE id_ticket = ${idTicket}`);
    return rows[0] ?? null;
  },
  async markTerminationTechnicalClosure(tx, idServicio) {
    await tx.$executeRaw(Prisma.sql`UPDATE g8_retiros.termino_servicio SET cierre_tecnico_en = COALESCE(cierre_tecnico_en, CURRENT_TIMESTAMP)
      WHERE id_servicio = ${idServicio}`);
  },
};
