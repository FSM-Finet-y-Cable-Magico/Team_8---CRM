import { Prisma } from '@prisma/client';

export type G2ReviewProspect = {
  idEmpresa: number | null;
  idCliente: number | null;
  clasificacionComercial: string | null;
  estadoPipeline: string | null;
  origenContacto: string | null;
  fechaConversion: Date | null;
  fechaPerdida: Date | null;
  motivoPerdida: string | null;
  tiempoConversionDias: number | null;
  _count?: { contratos: number; cotizaciones: number; ordenesTrabajo: number; integracionesInstalacionG3: number };
};

export function isG2ProspectReviewCandidate(prospect: G2ReviewProspect) {
  return Number.isSafeInteger(prospect.idEmpresa) && prospect.idEmpresa! > 0
    && prospect.clasificacionComercial === 'PROSPECTO' && prospect.estadoPipeline === 'NUEVO'
    && prospect.idCliente === null && prospect.fechaConversion === null
    && prospect.fechaPerdida === null && prospect.motivoPerdida === null && prospect.tiempoConversionDias === null
    && prospect._count !== undefined && Object.values(prospect._count).every(count => count === 0);
}

export async function readG2OriginAudits(prisma: Pick<Prisma.TransactionClient, 'logAuditoria'>, ids: number[]) {
  if (!ids.length) return [];
  const rows = await prisma.logAuditoria.findMany({ where: {
    entidadAfectada: 'prospecto', idEntidadAfectada: { in: ids },
    OR: [
      { accion: 'CREAR_PROSPECTO_PORTAL', valorNuevo: { path: ['origen'], equals: 'PORTAL' } },
      { accion: 'ACEPTAR_POLITICA_PRIVACIDAD', valorNuevo: { path: ['formulario'], equals: 'CONTRATACION' } },
    ],
  }, select: { idLog: true, idEntidadAfectada: true, accion: true, valorNuevo: true }, orderBy: { idLog: 'asc' }, take: 2001 });
  return rows.length > 2000 ? [] : rows; // Bound the read; do not assume provenance on overflow.
}

export function g2OriginEvidence(prospect: { idProspecto: number; idEmpresa: number | null }, rows: Awaited<ReturnType<typeof readG2OriginAudits>>) {
  const related = rows.filter(row => row.idEntidadAfectada === prospect.idProspecto);
  let creation: string | null = null, consent: string | null = null;
  for (const row of related) {
    const payload = row.valorNuevo;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    // Optional original references, if present, must not contradict the current scope.
    if (['id_empresa', 'idEmpresa'].some(key => key in payload && payload[key] !== prospect.idEmpresa)
      || ['id_prospecto', 'idProspecto'].some(key => key in payload && payload[key] !== prospect.idProspecto)) return null;
    if (row.accion === 'CREAR_PROSPECTO_PORTAL' && payload.origen === 'PORTAL') {
      if (['estado_pipeline', 'estadoPipeline'].some(key => key in payload && payload[key] !== 'NUEVO')) return null;
      creation ??= row.idLog.toString();
    }
    if (row.accion === 'ACEPTAR_POLITICA_PRIVACIDAD' && payload.formulario === 'CONTRATACION') consent ??= row.idLog.toString();
  }
  return creation && consent ? { idLogCreacion: creation, idLogConsentimiento: consent } : null;
}

export const G2_REVIEW_RELATION_COUNTS = {
  select: { contratos: true, cotizaciones: true, ordenesTrabajo: true, integracionesInstalacionG3: true },
} as const;
