// Static boundaries only. Never imports Prisma, connects to PostgreSQL or executes proposal SQL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const code = sql => sql.replace(/--[^\r\n]*/g, '');
const attention = code(read('db/proposals/g8-attention-catalog.sql'));
const termination = code(read('db/proposals/g8-termino-servicio-catalog.sql'));
const verify = code(read('db/g8/migrations/003_withdrawal_voluntary_termination.verify.sql'));

test('proposal targets the same seven canonical names as the backend; termination remains separate', () => {
  const backend = read('backend/src/tickets/ticket-attention-categories.ts');
  const names = text => [...text.matchAll(/'([^']+)'/g)].map(match => match[1]);
  const expected = names(backend.match(/TICKET_ATTENTION_NAMES = \[([\s\S]*?)\] as const/)[1]);
  const actual = names(attention.match(/official_names text\[\] := ARRAY\[([\s\S]*?)\];/)[1]);
  assert.equal(expected.length, 7); assert.deepEqual(actual, expected);
  assert(!actual.includes('Término de servicio'));
  assert.match(termination, /VALUES \('Término de servicio',base_sla,'ATENCION'\)/);
});

for (const [name, sql] of [['attention', attention], ['termination', termination]]) {
  test(`${name}: insert-only proposal uses real ID default, explicit type and catalog writer lock`, () => {
    assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|setval)\b/i);
    const inserts = [...sql.matchAll(/INSERT INTO ([\w.]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^;]+)\);/g)];
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0][1], 'public.categoria_falla');
    assert.equal(inserts[0][2], 'nombre,sla_horas,tipo');
    assert.match(inserts[0][3], /'ATENCION'/);
    assert.match(sql, /pg_get_serial_sequence\('public.categoria_falla','id_categoria'\)/);
    assert.match(sql, /CATEGORY_DEFAULT_SEQUENCE_MISMATCH/);
    assert(sql.indexOf('LOCK TABLE public.categoria_falla IN SHARE ROW EXCLUSIVE MODE') < sql.indexOf('INSERT INTO'));
    assert.match(sql, /CATALOG_REQUIRES_READ_COMMITTED_FRESH_SNAPSHOT/);
    assert.match(sql, /current_setting\('finet\.[a-z_]+reviewed',true\) IS DISTINCT FROM 'on'/);
    assert.doesNotMatch(sql, /(?:\bi[dr]\b|id_categoria)\s*=\s*\d+/i);
  });
}

test('attention: no implicit SLA, all seven approval entries required before any insert', () => {
  assert.match(attention, /jsonb_array_length\(manifest\)<>7/);
  assert.match(attention, /EXPLICIT_APPROVED_SLA_AND_SOURCE_REQUIRED/);
  assert.match(attention, /SLA_MUST_BE_APPROVED_SMALLINT_OR_EXPLICIT_NULL/);
  assert.match(attention, /EXISTING_SLA_DIFFERS_FROM_APPROVAL_PRESERVE_AND_REVIEW/);
  assert.match(attention, /approved_sla := \(entry->>'sla_horas'\)::smallint/);
  assert.doesNotMatch(attention, /COALESCE\([^;]*sla/i);
  assert(attention.indexOf('AMBIGUOUS_ATTENTION_CATEGORY') < attention.indexOf('INSERT INTO'));
});

test('both proposals use NFC and Unicode space normalization; Consulta alias is preserved without rename', () => {
  for (const sql of [attention, termination]) {
    assert.match(sql, /btrim\(regexp_replace\(normalize\(c.nombre,NFC\),space_pattern,' ','g'\)\)/);
    for (const point of [160, 8199, 8239, 65279]) assert(sql.includes(`chr(${point})`));
  }
  assert.match(attention, /category_name='Consulta general' AND [^\n]+='consulta'/);
  assert.match(attention, /existing_count>1/);
});

test('termination: no arbitrary Baja fallback; explicit approval or one compatible source, never historical SLA writes', () => {
  assert.doesNotMatch(termination, /ORDER BY|LIMIT 1/);
  assert.match(termination, /existing_count<>1 OR attention_count<>1/);
  assert.match(termination, /UNIQUE_ATTENTION_BAJA_OR_EXPLICIT_APPROVED_SLA_REQUIRED/);
  assert.match(termination, /EXPLICIT_APPROVED_TERMINATION_SLA_AND_SOURCE_REQUIRED/);
  assert.match(termination, /TERMINATION_CATEGORY_AMBIGUOUS_OR_INCOMPATIBLE/);
  assert.match(termination, /IF existing_count=1 THEN[\s\S]*RETURN;[\s\S]*INSERT INTO/);
});

test('003 W5 is read-only, distinguishes both causes and reports a missing cause column before 003', () => {
  assert(verify.trim().startsWith('BEGIN TRANSACTION READ ONLY;'));
  assert(verify.trim().endsWith('ROLLBACK;'));
  assert.doesNotMatch(verify, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  assert.match(verify, /NOT_APPLIED_CAUSE_COLUMN_MISSING/);
  assert.match(verify, /WHERE to_jsonb\(s\)->>'causa'='MOROSIDAD' AND s.id_aviso IS NULL/);
  assert.match(verify, /WHERE to_jsonb\(s\)->>'causa'='VOLUNTARIA' AND s.id_aviso IS NOT NULL/);
  assert.match(verify, /causas_ausentes_o_invalidas/);
});
