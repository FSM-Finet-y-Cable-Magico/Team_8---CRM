import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

function validRut(value) {
  const compact = String(value ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(compact)) return false;
  const body = compact.slice(0, -1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expectedValue = 11 - (sum % 11);
  const expected = expectedValue === 11 ? '0' : expectedValue === 10 ? 'K' : String(expectedValue);
  return compact.at(-1) === expected;
}

function validPhone(value) {
  const compact = String(value ?? '').replace(/[\s().-]/g, '');
  const normalized = compact.startsWith('+') ? compact : compact.startsWith('56') ? `+${compact}` : compact.length === 9 ? `+56${compact}` : compact;
  return /^\+569\d{8}$/.test(normalized);
}

export async function findG3SmokeCandidates(prisma, idEmpresa = 1) {
  if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1) throw new Error('I3_G3_COMPANY_ID_INVALID');
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15000ms'");
    const rows = await tx.$queryRawUnsafe(`
      SELECT
        c.id_contrato,
        c.id_prospecto,
        c.id_plan,
        c.id_cliente,
        c.estado AS estado_contrato,
        p.id_empresa AS prospecto_empresa,
        p.id_cliente AS prospecto_cliente,
        p.rut,
        p.nombre_completo,
        p.telefono,
        COALESCE(NULLIF(btrim(c.direccion_instalacion), ''), NULLIF(btrim(p.direccion), '')) AS direccion,
        COALESCE(NULLIF(btrim(c.comuna_instalacion), ''), NULLIF(btrim(p.comuna), '')) AS comuna,
        pl.id_empresa AS plan_empresa,
        pl.activo AS plan_activo,
        EXISTS (
          SELECT 1 FROM cotizacion q
          WHERE q.id_prospecto = c.id_prospecto
            AND q.id_plan = c.id_plan
            AND q.factibilidad_verificada IS TRUE
        ) AS factibilidad,
        EXISTS (SELECT 1 FROM servicio_contratado s WHERE s.id_contrato = c.id_contrato) AS tiene_servicio,
        EXISTS (
          SELECT 1 FROM integracion_instalacion_g3 i
          WHERE i.id_contrato = c.id_contrato
            AND i.estado_integracion IN ('PENDIENTE_ENVIO', 'ENVIADA', 'EN_SEGUIMIENTO', 'COMPLETADA', 'FALLIDA_REINTENTABLE')
        ) AS tiene_tracking_activo
      FROM contrato c
      LEFT JOIN prospecto p ON p.id_prospecto = c.id_prospecto
      LEFT JOIN plan pl ON pl.id_plan = c.id_plan
      WHERE c.id_empresa = $1
      ORDER BY c.id_contrato DESC
    `, idEmpresa);

    const reasonCounts = {};
    const candidates = [];
    for (const row of rows) {
      const reasons = [];
      if (!['Firmado', 'Activo'].includes(row.estado_contrato)) reasons.push('CONTRATO_NO_FIRMADO');
      if (!row.id_prospecto || row.prospecto_empresa !== idEmpresa) reasons.push('PROSPECTO_AUSENTE_O_EMPRESA_DISTINTA');
      if (!row.id_plan || row.plan_empresa !== idEmpresa || row.plan_activo !== true) reasons.push('PLAN_AUSENTE_INACTIVO_O_EMPRESA_DISTINTA');
      if (!row.factibilidad) reasons.push('FACTIBILIDAD_NO_VERIFICADA');
      if (!validRut(row.rut)) reasons.push('RUT_INVALIDO_O_AUSENTE');
      if (!String(row.nombre_completo ?? '').trim()) reasons.push('NOMBRE_AUSENTE');
      if (!validPhone(row.telefono)) reasons.push('TELEFONO_INVALIDO_O_AUSENTE');
      if (!String(row.direccion ?? '').trim()) reasons.push('DIRECCION_AUSENTE');
      if (!String(row.comuna ?? '').trim()) reasons.push('COMUNA_AUSENTE');
      if (row.id_cliente || row.prospecto_cliente) reasons.push('CLIENTE_YA_ASOCIADO');
      if (row.tiene_servicio) reasons.push('SERVICIO_YA_EXISTE');
      if (row.tiene_tracking_activo) reasons.push('TRACKING_G3_ACTIVO');
      if (reasons.length === 0) {
        candidates.push({
          id_empresa: idEmpresa,
          id_prospecto: row.id_prospecto,
          id_contrato: row.id_contrato,
          id_plan: row.id_plan,
        });
      } else {
        for (const reason of new Set(reasons)) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      }
    }
    return {
      capturedAt: new Date().toISOString(),
      access: 'READ_ONLY',
      idEmpresa,
      contractsExamined: rows.length,
      candidateCount: candidates.length,
      candidates,
      reasonCounts,
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
    const idEmpresa = Number(process.env.I3_G3_COMPANY_ID ?? 1);
    console.log(JSON.stringify({ status: 'PASS', ...(await findG3SmokeCandidates(prisma, idEmpresa)) }));
    return 0;
  } catch {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'G3_CANDIDATE_READ_FAILED', detail: 'Error original omitido para proteger credenciales y datos comerciales.' }));
    return 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
