import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CONTRACT_HASH = 'bdbff3f99e81446d75312dede4571ab6154bea309ce8f90dceaa44e98105cce1';
export const contractPath = new URL('../db/global/init-global.sql', import.meta.url);
export function splitSql(text) {
  const parts = []; let start = 0, depth = 0, quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") { if (quote && text[i + 1] === "'") { i++; continue; } quote = !quote; }
    if (quote) continue;
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim()); return parts.filter(Boolean);
}
export function normalizeType(type) {
  return type.toLowerCase().replace(/character varying/g, 'varchar').replace(/timestamp(\(\d+\))? without time zone/g, 'timestamp$1')
    .replace(/timestamp(\(\d+\))? with time zone/g, 'timestamptz$1').replace(/\btimestamp\(6\)/g, 'timestamp').replace(/\btimestamptz\(6\)/g, 'timestamptz')
    .replace(/\bbigserial\b/g, 'bigint').replace(/\bserial\b/g, 'integer').replace(/\bint4\b/g, 'integer').replace(/\bint8\b/g, 'bigint')
    .replace(/\bcharacter\b/g, 'char').replace(/\bdecimal\b/g, 'numeric').replace(/\s+/g, ' ').replace(/,\s+/g, ',').trim();
}
export function normalizeExpression(value) {
  if (value == null) return null;
  // Only remove presentation differences outside literals. Unknown forms remain DIFFERENT.
  // Preserve parentheses and casts: unsafe algebraic simplification could mask real drift.
  // Whitespace/case outside literals and the explicit public qualifier are cosmetic.
  const normalized = value.split(/('(?:''|[^'])*')/).map((part, i) => i % 2 ? part : part.toLowerCase()
    .replace(/\bpublic\./g, '').replace(/\s/g, '')).join('');
  return normalized === 'current_timestamp' ? 'now()' : normalized;
}

function stripOuterParentheses(value) {
  let result = value.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0; let quote = false; let wraps = true;
    for (let i = 0; i < result.length; i++) {
      const ch = result[i];
      if (ch === "'") { if (quote && result[i + 1] === "'") { i++; continue; } quote = !quote; }
      if (quote) continue;
      if (ch === '(') depth++;
      if (ch === ')' && --depth === 0 && i < result.length - 1) { wraps = false; break; }
    }
    if (!wraps || depth !== 0) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function splitBoolean(value, operator) {
  const parts = []; let depth = 0; let quote = false; let start = 0;
  const lower = value.toLowerCase();
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "'") { if (quote && value[i + 1] === "'") { i++; continue; } quote = !quote; continue; }
    if (quote) continue;
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth !== 0 || lower.slice(i, i + operator.length) !== operator) continue;
    const before = lower[i - 1], after = lower[i + operator.length];
    if ((before && /[a-z0-9_]/.test(before)) || (after && /[a-z0-9_]/.test(after))) continue;
    parts.push(value.slice(start, i)); start = i + operator.length; i += operator.length - 1;
  }
  if (!parts.length) return null;
  parts.push(value.slice(start)); return parts;
}

function checkAst(value) {
  const expression = stripOuterParentheses(value.trim());
  const or = splitBoolean(expression, 'or');
  if (or) return ['or', ...or.map(checkAst)];
  const and = splitBoolean(expression, 'and');
  if (and) return ['and', ...and.map(checkAst)];
  let predicate = normalizeExpression(expression);
  // Only unwrap atoms that PostgreSQL parenthesizes before a cast. Keeping all
  // other parentheses preserves arithmetic, function and operator precedence.
  const atom = String.raw`(?:[a-z_][a-z0-9_]*|[-+]?\d+(?:\.\d+)?|'(?:''|[^'])*')`;
  const cast = String.raw`(?:::[a-z][a-z0-9]*(?:\[\])?)+`;
  const atomicCast = new RegExp(`\\((${atom}${cast}?)\\)(?=::)`, 'gi');
  predicate = predicate.replace(atomicCast, '$1');
  predicate = predicate.replace(new RegExp(`\\((${atom})\\)(?=::)`, 'gi'), '$1');
  // PostgreSQL renders varchar arrays either with an array-level ::text[] cast or
  // per-element ::text casts. VARCHAR and TEXT are equivalent here because the
  // compared column type is verified separately by compareCatalog.
  predicate = predicate.replace(/::charactervarying/g, '').replace(/::text\[\]/g, '').replace(/::text/g, '');
  // After removing the equivalent array cast, an extra wrapper can remain as the
  // sole ANY argument. This rule is deliberately restricted to ARRAY literals.
  predicate = predicate.replace(/any\(\((array\[[^\]]*\])\)\)/g, 'any($1)');
  return ['predicate', predicate];
}

export function normalizeCheckExpression(value) {
  if (value == null) return null;
  const match = /^check\s*\(([\s\S]*)\)$/i.exec(value.trim());
  if (!match) return null;
  return JSON.stringify(checkAst(match[1]));
}
export function ownerOf(table) {
  if (table === 'solicitud_instalacion_integracion') return 'G3';
  if (/^(integracion_activacion|integracion_cierre|asignacion_equipo_servicio|unidad_equipo|tipo_equipo|bodega|stock_consumible|movimiento_inventario|historial_estado_equipo|orden_ingreso|detalle_orden_ingreso|proveedor|prestamo|donacion|salida_|baja_equipo|solicitud_baja|transferencia|inventario|secuencia_srv)/.test(table) && table !== 'integracion_activacion_g1') return 'G1';
  if (/^(olt|ont|registro_ont|caja_nap|puerto_nap|monitoreo_|alerta_monitoreo|orden_trabajo|historial_ot|uso_material_ot|poste|sector)/.test(table)) return 'G3/Ops';
  if (/^(sesion_portal|intento_fallido|solicitud_contrasena_wifi|preferencia_|notificacion_|consentimiento_)/.test(table)) return 'G2';
  if (['empresa','usuario','usuario_rol','rol','log_auditoria'].includes(table)) return 'COMPARTIDO';
  return 'G8 (coordinar columnas compartidas)';
}
export function parseGlobalSchema(bytes = readFileSync(contractPath), verifyHash = true) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (verifyHash && hash !== CONTRACT_HASH) throw new Error('GLOBAL_CONTRACT_HASH_MISMATCH');
  const sql = bytes.toString('utf8').replace(/--[^\n]*/g, '');
  const tables = [], fks = [], indexes = [];
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const table = { name: m[1], columns: [], pk: [], checks: [], sql: m[0], owner: ownerOf(m[1]) };
    for (const def of splitSql(m[2])) {
      if (/^(?:CONSTRAINT\s+\w+\s+)?PRIMARY KEY/i.test(def)) { table.pk = /\(([^)]+)\)/.exec(def)[1].split(',').map(s => s.trim()); continue; }
      if (/^CONSTRAINT/i.test(def)) { const c = /^CONSTRAINT\s+(\w+)\s+(CHECK[\s\S]*)/i.exec(def); if (!c) throw new Error('UNSUPPORTED_CONSTRAINT'); table.checks.push({ name:c[1], definition:c[2] }); continue; }
      const c = /^(\w+)\s+(.+?)(?=\s+(?:NOT NULL|PRIMARY KEY|DEFAULT|CHECK|UNIQUE|REFERENCES)\b|$)/is.exec(def);
      if (!c) throw new Error('UNSUPPORTED_COLUMN');
      const pk = /\bPRIMARY KEY\b/i.test(def);
      const serial = /^(BIG)?SERIAL$/i.test(c[2]);
      const d = /\bDEFAULT\s+([\s\S]*?)(?=\s+(?:CHECK|NOT NULL|PRIMARY KEY|UNIQUE)\b|$)/i.exec(def);
      table.columns.push({ name:c[1], type:normalizeType(c[2]), nullable: !pk && !/NOT NULL/i.test(def), default:serial ? `nextval('${table.name}_${c[1]}_seq'::regclass)` : d?.[1] ?? null, serial, definition:def });
      if (pk) table.pk.push(c[1]);
      const check = /\b(CHECK\s*\([\s\S]*)/i.exec(def);
      if (check) table.checks.push({ name:`${table.name}_${c[1]}_check`, definition:check[1] });
    }
    for (const column of table.columns) if (table.pk.includes(column.name)) column.nullable = false;
    tables.push(table);
  }
  for (const m of sql.matchAll(/ALTER TABLE (\w+) ADD CONSTRAINT (\w+)\s+FOREIGN KEY\s*\(([^)]+)\) REFERENCES (\w+)\s*\(([^)]+)\)([^;]*);/g)) {
    const action = kind => new RegExp(`ON ${kind} (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)`, 'i').exec(m[6])?.[1].toUpperCase() ?? 'NO ACTION';
    fks.push({ table:m[1], name:m[2], columns:m[3].split(',').map(s=>s.trim()), referencedTable:m[4], referencedColumns:m[5].split(',').map(s=>s.trim()), onDelete:action('DELETE'), onUpdate:action('UPDATE'), sql:m[0] });
  }
  for (const m of sql.matchAll(/CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+) ON (\w+) ([^;]+);/g)) indexes.push({ name:m[2], table:m[3], unique:Boolean(m[1]), definition:m[4], sql:m[0] });
  const counts = { tables:tables.length, columns:tables.reduce((n,t)=>n+t.columns.length,0), pk:tables.filter(t=>t.pk.length).length, fk:fks.length, checks:tables.reduce((n,t)=>n+t.checks.length,0), indexes:indexes.length };
  if (verifyHash && (counts.tables!==91 || counts.columns!==897 || counts.pk!==91 || counts.fk!==211 || counts.checks!==33 || counts.indexes!==109)) throw new Error(`GLOBAL_PARSE_INCOMPLETE ${JSON.stringify(counts)}`);
  return { hash, tables, fks, indexes, counts };
}
