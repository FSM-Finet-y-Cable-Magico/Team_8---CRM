import { Prisma } from '@prisma/client';

/**
 * Almacenamiento privado de G8 para la baja por morosidad (esquema `g8_retiros`).
 *
 * Misma política que el almacenamiento de firmas (`g8_contratos`): SQL calificado sobre la
 * transacción del llamador, sin modelo Prisma, sin FK ni triggers sobre tablas públicas y con una
 * sonda de capacidad. Mientras el esquema no esté aprobado y aplicado por su propietario, las
 * operaciones que lo requieren responden bloqueadas y no escriben nada: no hay éxito aparente.
 * Propuesta de migración: db/g8/migrations/002_service_withdrawal.sql (NO se ejecuta desde aquí).
 */
export const WITHDRAWAL_STORAGE = Symbol('WITHDRAWAL_STORAGE');

export type WithdrawalCapabilities = {
  /** solicitud ↔ aviso ↔ ticket como relación estructurada. */
  ticketLink: boolean;
  /** Correlación y evidencia del retiro técnico recibido de G3. */
  g3Closure: boolean;
};

export type WithdrawalTicketLink = {
  idSolicitudRetiro: number; idTicket: number; idAviso: number;
  idEmpresa: number; idCliente: number; idServicio: number; idContrato: number;
  idUsuarioResponsable: number; createdAt: Date;
};

export type WithdrawalEquipment = { numeroSerie: string; diagnostico?: string | null };

/** Evidencia técnica ya recibida y validada por G8. Nunca se fabrica localmente. */
export type WithdrawalG3Receipt = {
  idSolicitudRetiro: number; idEmpresa: number; claveSolicitud: string; idOtG3: number | null;
  estadoDespacho: string; estadoOt: string | null; cierreAprobado: boolean; fechaCierre: Date | null;
  equiposRetirados: WithdrawalEquipment[]; equiposFaltantes: WithdrawalEquipment[];
  aplicadoEn: Date | null;
};

export interface WithdrawalStorage {
  capabilities(tx: Prisma.TransactionClient): Promise<WithdrawalCapabilities>;
  findLinkByRequest(tx: Prisma.TransactionClient, idSolicitudRetiro: number): Promise<WithdrawalTicketLink | null>;
  findLinkByTicket(tx: Prisma.TransactionClient, idTicket: number): Promise<WithdrawalTicketLink | null>;
  insertLink(tx: Prisma.TransactionClient, link: Omit<WithdrawalTicketLink, 'createdAt'>): Promise<WithdrawalTicketLink>;
  findReceipt(tx: Prisma.TransactionClient, idSolicitudRetiro: number): Promise<WithdrawalG3Receipt | null>;
  markReceiptApplied(tx: Prisma.TransactionClient, idSolicitudRetiro: number): Promise<void>;
}

const LINK_COLUMNS = Prisma.sql`id_solicitud_retiro AS "idSolicitudRetiro", id_ticket AS "idTicket", id_aviso AS "idAviso",
  id_empresa AS "idEmpresa", id_cliente AS "idCliente", id_servicio AS "idServicio", id_contrato AS "idContrato",
  id_usuario_responsable AS "idUsuarioResponsable", created_at AS "createdAt"`;

const RECEIPT_COLUMNS = Prisma.sql`id_solicitud_retiro AS "idSolicitudRetiro", id_empresa AS "idEmpresa", clave_solicitud AS "claveSolicitud",
  id_ot_g3 AS "idOtG3", estado_despacho AS "estadoDespacho", estado_ot AS "estadoOt", cierre_aprobado AS "cierreAprobado",
  fecha_cierre AS "fechaCierre", equipos_retirados AS "equiposRetirados", equipos_faltantes AS "equiposFaltantes", aplicado_en AS "aplicadoEn"`;

export const postgresWithdrawalStorage: WithdrawalStorage = {
  async capabilities(tx) {
    const rows = await tx.$queryRaw<Array<{ ticketLink: boolean; g3Closure: boolean }>>`
      SELECT to_regclass('g8_retiros.solicitud_ticket') IS NOT NULL AS "ticketLink",
             to_regclass('g8_retiros.solicitud_g3') IS NOT NULL AS "g3Closure"`;
    return { ticketLink: rows[0]?.ticketLink === true, g3Closure: rows[0]?.g3Closure === true };
  },
  async findLinkByRequest(tx, idSolicitudRetiro) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`
      SELECT ${LINK_COLUMNS} FROM g8_retiros.solicitud_ticket WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
    return rows[0] ?? null;
  },
  async findLinkByTicket(tx, idTicket) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`
      SELECT ${LINK_COLUMNS} FROM g8_retiros.solicitud_ticket WHERE id_ticket = ${idTicket}`);
    return rows[0] ?? null;
  },
  async insertLink(tx, link) {
    const rows = await tx.$queryRaw<WithdrawalTicketLink[]>(Prisma.sql`
      INSERT INTO g8_retiros.solicitud_ticket (id_solicitud_retiro, id_ticket, id_aviso, id_empresa, id_cliente, id_servicio, id_contrato, id_usuario_responsable)
      VALUES (${link.idSolicitudRetiro}, ${link.idTicket}, ${link.idAviso}, ${link.idEmpresa}, ${link.idCliente}, ${link.idServicio}, ${link.idContrato}, ${link.idUsuarioResponsable})
      RETURNING ${LINK_COLUMNS}`);
    if (!rows[0]) throw new Error('WITHDRAWAL_LINK_NOT_STORED');
    return rows[0];
  },
  async findReceipt(tx, idSolicitudRetiro) {
    const rows = await tx.$queryRaw<WithdrawalG3Receipt[]>(Prisma.sql`
      SELECT ${RECEIPT_COLUMNS} FROM g8_retiros.solicitud_g3 WHERE id_solicitud_retiro = ${idSolicitudRetiro} FOR UPDATE`);
    return rows[0] ?? null;
  },
  async markReceiptApplied(tx, idSolicitudRetiro) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE g8_retiros.solicitud_g3 SET aplicado_en = COALESCE(aplicado_en, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id_solicitud_retiro = ${idSolicitudRetiro}`);
  },
};
