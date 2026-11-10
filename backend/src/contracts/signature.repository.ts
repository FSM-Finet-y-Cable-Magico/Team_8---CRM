import { Prisma } from '@prisma/client';
export type SignatureRow = {
  idSolicitud: string; idEmpresa: number; idContrato: number; idContratoDigital: number; version: number; idUsuarioCreador: number;
  tokenHash: string; estado: string; destinatario: string; datosSnapshot: Prisma.JsonValue; hashOriginal: string; pdfOriginal: Buffer;
  fechaCreacion: Date; fechaExpiracion: Date; otpHash: string | null; otpExpiracion: Date | null; otpSolicitado: Date | null;
  otpEnvios: number; otpIntentos: number; pdfVisto: Date | null; correoEstado: string; firmaFecha: Date | null;
  firmaIp: string | null; firmaUserAgent: string | null; consentimientoVersion: string | null; pdfFirmado: Buffer | null;
  hashFirmado: string | null; firmaCorreoEstado: string; motivoAnulacion: string | null;
};
const columns = {
  idSolicitud:'id_solicitud', idEmpresa:'id_empresa', idContrato:'id_contrato', idContratoDigital:'id_contrato_digital',
  version:'version', idUsuarioCreador:'id_usuario_creador', tokenHash:'token_hash', estado:'estado', destinatario:'destinatario',
  datosSnapshot:'datos_snapshot', hashOriginal:'hash_original', pdfOriginal:'pdf_original', fechaCreacion:'fecha_creacion',
  fechaExpiracion:'fecha_expiracion', otpHash:'otp_hash', otpExpiracion:'otp_expiracion', otpSolicitado:'otp_solicitado',
  otpEnvios:'otp_envios', otpIntentos:'otp_intentos', pdfVisto:'pdf_visto', correoEstado:'correo_estado', firmaFecha:'firma_fecha',
  firmaIp:'firma_ip', firmaUserAgent:'firma_user_agent', consentimientoVersion:'consentimiento_version',
  pdfFirmado:'pdf_firmado', hashFirmado:'hash_firmado', firmaCorreoEstado:'firma_correo_estado', motivoAnulacion:'motivo_anulacion',
} as const;
type Key = keyof typeof columns;
type Where = Partial<Pick<SignatureRow, 'idSolicitud'|'idContrato'|'idContratoDigital'|'idEmpresa'|'tokenHash'|'estado'|'otpHash'|'firmaCorreoEstado'>>;
type Data = Partial<{ [K in Exclude<Key,'datosSnapshot'>]: SignatureRow[K] | { increment: number } }> & { datosSnapshot?: Prisma.InputJsonValue | Prisma.JsonValue };
const col = (key: string) => {
  if (!(key in columns)) throw new Error('SIGNATURE_COLUMN_INVALID');
  return Prisma.raw('"' + columns[key as Key] + '"');
};
const projection = Prisma.join(Object.entries(columns).map(([key, name]) => Prisma.sql`${Prisma.raw('"' + name + '"')} AS ${Prisma.raw('"' + key + '"')}`));
function predicates(where: Where) {
  const entries = Object.entries(where);
  if (!entries.length) throw new Error('SIGNATURE_SCOPE_REQUIRED');
  return Prisma.join(entries.map(([key, value]) => value === null ? Prisma.sql`${col(key)} IS NULL`
    : Prisma.sql`${col(key)} = ${sqlValue(key, value)}`), ' AND ');
}
function sqlValue(key: string, entry: unknown) {
  if (key === 'idSolicitud') return Prisma.sql`${entry}::uuid`;
  return key === 'datosSnapshot' ? Prisma.sql`${JSON.stringify(entry)}::jsonb` : Prisma.sql`${entry}`;
}
export async function signatureStorageAvailable(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ available: boolean }>>`
    SELECT to_regclass('g8_contratos.solicitud_firma') IS NOT NULL AS available`;
  return rows[0]?.available === true;
}
// This adapter uses qualified SQL and the caller's existing transaction.
// No datasource/search_path changes, Prisma model, public FK, or public trigger.
export function signatureRepository(tx: Prisma.TransactionClient) {
  const normalize = (row: SignatureRow) => ({ ...row, pdfOriginal: Buffer.from(row.pdfOriginal),
    pdfFirmado: row.pdfFirmado ? Buffer.from(row.pdfFirmado) : null });
  async function findMany(args: { where: Where; orderBy?: unknown; select?: unknown; take?: number }) {
    const order = args.orderBy as Record<string, unknown> | undefined;
    const sort = order?.documento ? Prisma.sql`version DESC`
      : order?.firmaFecha ? Prisma.sql`firma_fecha DESC NULLS LAST` : Prisma.sql`fecha_creacion DESC`;
    const rows = await tx.$queryRaw<SignatureRow[]>(Prisma.sql`SELECT ${projection} FROM g8_contratos.solicitud_firma
      WHERE ${predicates(args.where)} ORDER BY ${sort}, id_solicitud DESC ${args.take ? Prisma.sql`LIMIT ${args.take}` : Prisma.empty}`);
    return rows.map(normalize);
  }
  async function updateMany(args: { where: Where; data: Data }) {
    const fields = Object.entries(args.data);
    if (!fields.length) throw new Error('SIGNATURE_UPDATE_EMPTY');
    const sets = fields.map(([key, v]) => typeof v === 'object' && v !== null && 'increment' in v
      ? Prisma.sql`${col(key)} = ${col(key)} + ${v.increment}` : Prisma.sql`${col(key)} = ${sqlValue(key, v)}`);
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`UPDATE g8_contratos.solicitud_firma
      SET ${Prisma.join(sets)} WHERE ${predicates(args.where)} RETURNING id_solicitud AS id`);
    return { count: rows.length };
  }
  return {
    findMany,
    async findFirst(args: { where?: Where; orderBy?: unknown; select?: unknown } = {}) {
      const rows = await findMany({ ...args, where: args.where ?? { estado: 'FIRMADA' }, take: 1 }); return rows[0] ?? null;
    },
    async findUnique(args: { where: Where; select?: unknown }) { return (await findMany({ ...args, take: 1 }))[0] ?? null; },
    async findUniqueOrThrow(args: { where: Where }) {
      const row = (await findMany({ ...args, take: 1 }))[0]; if (!row) throw new Error('SIGNATURE_NOT_FOUND'); return row;
    },
    async create(args: { data: Data }) {
      const fields = Object.entries(args.data).filter(([, v]) => v !== undefined);
      const rows = await tx.$queryRaw<SignatureRow[]>(Prisma.sql`INSERT INTO g8_contratos.solicitud_firma
        (${Prisma.join(fields.map(([key]) => col(key)))}) VALUES (${Prisma.join(fields.map(([key, v]) => sqlValue(key, v)))})
        RETURNING ${projection}`);
      return normalize(rows[0]);
    },
    updateMany,
    async update(args: { where: Where; data: Data }) {
      const result = await updateMany(args); if (result.count !== 1) throw new Error('SIGNATURE_NOT_FOUND');
      return (await findMany({ where: args.where }))[0];
    },
  };
}
export async function effectiveSignatureDates(tx: Prisma.TransactionClient, ids: number[]) {
  if (!ids.length || !await signatureStorageAvailable(tx)) return new Map<number, Date>();
  const rows = await tx.$queryRaw<Array<{ idContrato: number; fecha: Date }>>(Prisma.sql`
    SELECT s.id_contrato AS "idContrato", max(s.firma_fecha) AS fecha FROM g8_contratos.solicitud_firma s
    JOIN public.contrato c ON c.id_contrato=s.id_contrato AND c.id_empresa=s.id_empresa
    JOIN public.contrato_digital d ON d.id_contrato_digital=s.id_contrato_digital AND d.id_contrato=s.id_contrato AND d.id_empresa=s.id_empresa AND d.version=s.version
    WHERE s.estado = 'FIRMADA' AND s.id_contrato IN (${Prisma.join(ids)}) GROUP BY s.id_contrato`);
  return new Map(rows.map(row => [row.idContrato, row.fecha]));
}
