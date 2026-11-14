import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ServiceWithdrawalController } from './g3-integration.controller';
import { InitiateServiceWithdrawalDto } from './g3-integration.dto';

// Adapted from PR #81 (integrate/p0b-jean-claude-20261112 @ c3486103, service-withdrawal-boundaries.spec.ts)
// to the consolidated routes and to the revised migration 002 (003 is intentionally NOT incorporated).
const roles = (method: keyof ServiceWithdrawalController) => Reflect.getMetadata(ROLES_KEY, ServiceWithdrawalController.prototype[method]) as string[];

describe('Baja por morosidad: permisos por ruta', () => {
  it.each(['eligibility', 'initiate', 'dispatch', 'refreshOrder', 'syncReception', 'cancel'] as const)(
    '%s exige Administrador, Comercial o Soporte (Terreno no gestiona bajas)', method => {
      expect(roles(method)).toEqual(['Administrador', 'Comercial', 'Soporte']);
    });

  it('la baja efectiva solo la ejecuta un Administrador', () => {
    expect(roles('finalize')).toEqual(['Administrador']);
  });
});

describe('Inicio desde el Libro de Control: confirmación explícita', () => {
  const errors = (body: Record<string, unknown>) => validateSync(plainToInstance(InitiateServiceWithdrawalDto, body), {
    whitelist: true, forbidNonWhitelisted: true,
  }).map(error => error.property);
  const base = { idServicio: 61, idContrato: 20, observaciones: 'Cliente notificado tres veces sin pago' };

  it('sin confirmación o con un valor distinto de true se rechaza antes de llegar al servicio', () => {
    expect(errors(base)).toContain('confirmacion');
    expect(errors({ ...base, confirmacion: 'true' })).toContain('confirmacion');
    expect(errors({ ...base, confirmacion: false })).toContain('confirmacion');
  });

  it('con confirmación true el cuerpo del formulario es válido y cualquier campo extra se rechaza', () => {
    expect(errors({ ...base, confirmacion: true })).toEqual([]);
    expect(errors({ ...base, confirmacion: true, estado: 'CERRADA' })).toContain('estado');
  });
});

const migrationsDir = join(__dirname, '..', '..', '..', 'db', 'g8', 'migrations');
const migration = (name: string) => readFileSync(join(migrationsDir, name), 'utf8');
const executable = (sql: string) => sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');

describe('Migración privada 002 (revisada; sin ejecutar en ambientes compartidos)', () => {
  const sql = migration('002_service_withdrawal.sql');
  const code = executable(sql);

  it('es aditiva: sin DML, sin borrar ni renombrar, y solo crea objetos del esquema privado', () => {
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|RENAME)\b/i);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
    const created = [...code.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF NOT EXISTS\s+(?:\w+\s+ON\s+)?([\w.]+)/gi)].map(match => match[1]);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every(name => name.startsWith('g8_retiros.'))).toBe(true);
  });

  it('no declara FK, triggers ni concesiones y no toca tablas públicas', () => {
    expect(code).not.toMatch(/REFERENCES|TRIGGER|\bGRANT\b/i);
    expect(code).not.toMatch(/\bpublic\./i);
    expect(code).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA g8_retiros FROM PUBLIC/);
  });

  it('es transaccional, con límites de bloqueo, idempotente y declara que requiere aprobación', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code).toMatch(/COMMIT;/);
    expect(code).toMatch(/SET LOCAL lock_timeout/);
    expect([...code.matchAll(/CREATE\s+(?:SCHEMA|TABLE|(?:UNIQUE\s+)?INDEX)\s+(?!IF NOT EXISTS)/gi)]).toHaveLength(0);
    expect(sql).toContain('PENDING APPROVAL');
  });

  it('la excepción por equipos no recuperados (003 del PR #81) no se incorpora', () => {
    expect(existsSync(join(migrationsDir, '003_withdrawal_unrecovered_exception.sql'))).toBe(false);
  });

  it('la verificación pre/post es de solo lectura y termina en ROLLBACK', () => {
    const verify = executable(migration('002_service_withdrawal.verify.sql'));
    expect(verify.trim().startsWith('BEGIN TRANSACTION READ ONLY;')).toBe(true);
    expect(verify.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(verify).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  });

  it('los permisos van al rol de la aplicación indicado, sin DELETE, sin PUBLIC y sin contraseñas', () => {
    const grants = executable(migration('002_service_withdrawal.grants.sql'));
    expect(grants).toMatch(/g8_runtime_role/);
    expect(grants).not.toMatch(/DELETE|PUBLIC|PASSWORD|OWNER/i);
  });

  it('sin el rol de aplicación, los permisos abortan con error (no terminan en éxito silencioso)', () => {
    const grants = executable(migration('002_service_withdrawal.grants.sql'));
    const missingRole = grants.slice(grants.indexOf('\\else'), grants.indexOf('\\endif'));
    expect(missingRole).toMatch(/ON_ERROR_STOP/);
    expect(missingRole).toMatch(/RAISE EXCEPTION 'G8_RUNTIME_ROLE_REQUIRED'/);
    expect(missingRole).not.toMatch(/\\quit\s+\d/);
  });

  it('las tablas que consulta la aplicación existen en las migraciones 002 + 003', () => {
    const storage = readFileSync(join(__dirname, 'withdrawal.storage.ts'), 'utf8');
    const tables = new Set([...storage.matchAll(/g8_retiros\.(\w+)/g)].map(match => match[1]));
    expect(tables.size).toBe(4);
    const both = sql + migration('003_withdrawal_voluntary_termination.sql');
    for (const table of tables) expect(both).toContain(`CREATE TABLE IF NOT EXISTS g8_retiros.${table} (`);
  });
});

// FINET 13-11-2026 (adjustment to Documento 2). 002's applied check still required the G1 reception: in PostgreSQL the
// G3-approved baja without reception would have failed at markApplied (invisible to in-memory tests). 003 replaces it.
describe('Migración privada 003 (término voluntario y baja sin recepción G1; sin ejecutar)', () => {
  const sql = migration('003_withdrawal_voluntary_termination.sql');
  const code = executable(sql);
  const constraint = (text: string, name: string) => text.slice(text.indexOf(`CONSTRAINT ${name}`)).split(';')[0];

  it('002 exige la recepción G1 en aplicado_en; 003 la reemplaza por G3 COMPLETADA + cierre (sin recepción)', () => {
    expect(constraint(executable(migration('002_service_withdrawal.sql')), 'solicitud_g3_aplicado_check')).toMatch(/recepcion_clave_evento IS NOT NULL/);
    const replaced = constraint(code, 'solicitud_g3_aplicado_check');
    expect(code).toMatch(/DROP CONSTRAINT IF EXISTS solicitud_g3_aplicado_check/);
    expect(replaced).toMatch(/estado_ot = 'COMPLETADA' AND cierre_clave IS NOT NULL/);
    expect(replaced).not.toMatch(/recepcion/);
  });

  it('el aviso de cobranza es obligatorio solo para MOROSIDAD; VOLUNTARIA no lo admite (no se fabrica)', () => {
    expect(code).toMatch(/ALTER COLUMN id_aviso DROP NOT NULL/);
    expect(constraint(code, 'solicitud_ticket_causa_check')).toMatch(/causa = 'MOROSIDAD' AND id_aviso IS NOT NULL\) OR \(causa = 'VOLUNTARIA' AND id_aviso IS NULL/);
  });

  it('es aditiva y privada: sin DML, sin FK ni triggers, sin tablas públicas, transaccional e idempotente', () => {
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|RENAME)\b/i);
    expect(code).not.toMatch(/REFERENCES|TRIGGER|\bGRANT\b|\bpublic\./i);
    expect([...code.matchAll(/ALTER TABLE\s+([\w.]+)/gi)].every(match => match[1].startsWith('g8_retiros.'))).toBe(true);
    expect([...code.matchAll(/\bDROP\s+(\w+)/gi)].map(match => match[1].toUpperCase())).toEqual(expect.arrayContaining(['CONSTRAINT']));
    expect(code).not.toMatch(/DROP\s+(TABLE|SCHEMA|COLUMN)/i);
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code).toMatch(/SET LOCAL lock_timeout/);
    expect([...code.matchAll(/CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\s+(?!IF NOT EXISTS)/gi)]).toHaveLength(0);
    expect([...code.matchAll(/ADD COLUMN\s+(?!IF NOT EXISTS)/gi)]).toHaveLength(0);
    expect(sql).toContain('PENDING APPROVAL');
  });

  it('el término guarda requerimiento, canal, solicitante y evidencia; uno por servicio y por ticket', () => {
    const table = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS g8_retiros.termino_servicio'));
    for (const column of ['requerimiento_en', 'canal', 'solicitante', 'evidencia', 'termino_comercial_en', 'cierre_tecnico_en']) expect(table).toContain(column);
    expect(table).toMatch(/PRIMARY KEY \(id_servicio\)/);
    expect(table).toMatch(/UNIQUE \(id_ticket\)/);
  });

  it('permisos 003: sin DELETE ni PUBLIC; UPDATE solo del cierre técnico; verificación de solo lectura', () => {
    const grants = executable(migration('003_withdrawal_voluntary_termination.grants.sql'));
    expect(grants).not.toMatch(/DELETE|PUBLIC|PASSWORD|OWNER/i);
    expect(grants).toMatch(/GRANT UPDATE \(cierre_tecnico_en\)/);
    expect(grants).toMatch(/RAISE EXCEPTION 'G8_RUNTIME_ROLE_REQUIRED'/);
    const verify = executable(migration('003_withdrawal_voluntary_termination.verify.sql'));
    expect(verify.trim().startsWith('BEGIN TRANSACTION READ ONLY;')).toBe(true);
    expect(verify.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(verify).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  });

  it('evolución desde la 002: los vínculos históricos quedan MOROSIDAD con su aviso y cumplen el nuevo CHECK', () => {
    // 002 created id_aviso NOT NULL (> 0): every historical row has a notice, and the new column defaults to MOROSIDAD.
    expect(executable(migration('002_service_withdrawal.sql'))).toMatch(/id_aviso INTEGER NOT NULL/);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS causa VARCHAR\(20\) NOT NULL DEFAULT 'MOROSIDAD'/);
    expect(constraint(code, 'solicitud_ticket_ids_check')).toMatch(/id_aviso IS NULL OR id_aviso > 0/);
    // The 002 file itself is not edited (append-only migrations).
    expect(executable(migration('002_service_withdrawal.sql'))).not.toMatch(/causa|termino_servicio/);
  });

  it('cada restricción reemplazada se elimina con IF EXISTS antes de crearse (re-ejecutable) y la unicidad se conserva', () => {
    for (const name of [...code.matchAll(/ADD CONSTRAINT (\w+)/g)].map(match => match[1])) {
      expect(code.indexOf(`DROP CONSTRAINT IF EXISTS ${name}`)).toBeGreaterThan(-1);
      expect(code.indexOf(`DROP CONSTRAINT IF EXISTS ${name}`)).toBeLessThan(code.indexOf(`ADD CONSTRAINT ${name}`));
    }
    // 002 uniqueness is untouched: one link per request and per ticket, one dispatch per request/request_id/OT.
    expect(code).not.toMatch(/solicitud_ticket_pkey|solicitud_ticket_id_ticket_key|solicitud_g3_pkey|solicitud_g3_request_key|solicitud_g3_ot_key/);
    expect(code).toMatch(/CONSTRAINT termino_servicio_solicitud_key UNIQUE \(id_solicitud_retiro\)/);
  });

  it('el código solo marca aplicada después de exigir lo mismo que el CHECK de la 003 (OT COMPLETADA + cierre baja:{id_ot})', () => {
    const workflow = readFileSync(join(__dirname, 'withdrawal-workflow.service.ts'), 'utf8');
    const calls = [...workflow.matchAll(/this\.storage\.markApplied\(/g)].map(match => match.index!);
    expect(calls).toHaveLength(2); // morosity baja + technical closure after a termination
    for (const index of calls) {
      const before = workflow.slice(Math.max(0, workflow.lastIndexOf('assessWithdrawalClosure({', index)), index);
      expect(before).toMatch(/assessment\.outcome !== 'APLICAR_BAJA'/);
    }
    const closure = readFileSync(join(__dirname, 'withdrawal-closure.ts'), 'utf8');
    expect(closure).toMatch(/evidence\.estadoOt !== 'COMPLETADA'/);
    expect(closure).toMatch(/evidence\.cierreClave !== `baja:\$\{evidence\.idOtG3\}`/);
  });

  it('la aplicación exige 002 y 003: con solo la 002 responde bloqueada en vez de fallar al aplicar', () => {
    const storage = readFileSync(join(__dirname, 'withdrawal.storage.ts'), 'utf8');
    expect(storage).toMatch(/to_regclass\('g8_retiros\.termino_servicio'\) IS NOT NULL AS "termination"/);
    expect(storage).toMatch(/withdrawalStorageReady = \(c: WithdrawalCapabilities\) => c\.ticketLink && c\.g3Dispatch && c\.termination/);
  });
});

// Found in the consolidation (13-11-2026): the morosidad branch wrote PENDIENTE_ENVIO_G3, ENVIADA_G3, ... into
// public.solicitud_retiro_servicio.estado_despacho_tecnico, whose CHECK in the global contract only admits
// BLOQUEADO_CONTRATO_G3: every initiate would fail in finet_global_validacion. The dispatch state lives in g8_retiros.
describe('Las escrituras sobre solicitud_retiro_servicio respetan el contrato global', () => {
  const contract = readFileSync(join(__dirname, '..', '..', '..', 'db', 'global', 'init-global.sql'), 'utf8');
  const allowed = (constraint: string) => {
    const definition = contract.slice(contract.indexOf(`CONSTRAINT ${constraint} CHECK`)).split('\n')[0];
    return [...definition.matchAll(/'([A-Z0-9_]+)'/g)].map(match => match[1]);
  };
  const sources = ['withdrawal-workflow.service.ts', 'service-withdrawal.service.ts']
    .map(file => readFileSync(join(__dirname, file), 'utf8'));

  it('estado_despacho_tecnico solo recibe el valor que admite el CHECK global', () => {
    expect(allowed('solicitud_retiro_servicio_despacho_check')).toEqual(['BLOQUEADO_CONTRATO_G3']);
    const written = sources.flatMap(source => [...source.matchAll(/estadoDespachoTecnico:\s*([^,}\n]+)/g)].map(match => match[1].trim()))
      .filter(value => !value.startsWith('created.') && !value.startsWith('updated.'));
    expect(written.length).toBeGreaterThan(0);
    for (const value of written) expect(["'BLOQUEADO_CONTRATO_G3'", 'PUBLIC_DISPATCH_COLUMN_VALUE']).toContain(value);
  });

  it('estado solo recibe valores del CHECK global', () => {
    const states = allowed('solicitud_retiro_servicio_estado_check');
    expect(states).toEqual(['REGISTRADA', 'EN_GESTION', 'CANCELADA', 'CERRADA']);
    const workflow = sources[0];
    const written = [...workflow.matchAll(/servicioRetiroSolicitud\.(?:create|update)\([\s\S]*?estado:\s*'([A-Z_]+)'/g)].map(match => match[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const value of written) expect(states).toContain(value);
  });
});

describe('Consulta de exclientes históricos (FINET 13-11-2026)', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', 'db', 'g8', 'queries', 'exclientes-historicos.readonly.sql'), 'utf8');
  const code = executable(sql);

  it('es exclusivamente de lectura: transacción READ ONLY que termina en ROLLBACK, sin DML ni DDL', () => {
    expect(code.trim().startsWith('BEGIN TRANSACTION READ ONLY;')).toBe(true);
    expect(code.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COMMIT)\b/i);
  });

  it('devuelve solo conteos por empresa (sin RUT, nombres de cliente ni montos)', () => {
    const select = code.slice(code.lastIndexOf('SELECT e.id_empresa'));
    expect(select).toMatch(/GROUP BY e\.id_empresa/);
    expect(select).not.toMatch(/\brut\b|nombre_completo|monto/i);
  });
});
