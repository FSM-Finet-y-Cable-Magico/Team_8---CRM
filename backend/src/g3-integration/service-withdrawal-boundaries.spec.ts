import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ServiceWithdrawalController } from './g3-integration.controller';

const roles = (method: keyof ServiceWithdrawalController) => Reflect.getMetadata(ROLES_KEY, ServiceWithdrawalController.prototype[method]) as string[];

describe('Baja por morosidad: permisos por ruta', () => {
  it.each(['eligibility', 'initiate', 'openTicket'] as const)('%s exige Administrador, Comercial o Soporte (Terreno no inicia bajas)', method => {
    expect(roles(method)).toEqual(['Administrador', 'Comercial', 'Soporte']);
  });

  it('la baja efectiva solo la ejecuta un Administrador', () => {
    expect(roles('finalize')).toEqual(['Administrador']);
  });
});

const migration = (name: string) => readFileSync(join(__dirname, '..', '..', '..', 'db', 'g8', 'migrations', name), 'utf8');
const executable = (sql: string) => sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');

describe.each(['002_service_withdrawal.sql', '003_withdrawal_unrecovered_exception.sql'])('Propuesta de migración %s', file => {
  const sql = migration(file);
  const code = executable(sql);

  it('es aditiva: sin DML, sin borrar ni renombrar, y solo crea objetos del esquema privado', () => {
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|RENAME)\b/i);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
    const created = [...code.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?:CONCURRENTLY\s+)?IF NOT EXISTS\s+(?:\w+\s+ON\s+)?([\w.]+)/gi)].map(match => match[1]);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every(name => name.startsWith('g8_retiros.'))).toBe(true);
  });

  it('no declara FK, triggers ni concesiones y no toca tablas públicas', () => {
    expect(code).not.toMatch(/REFERENCES|TRIGGER|\bGRANT\b/i);
    expect(code).not.toMatch(/\bpublic\./i);
    expect(code).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA g8_retiros FROM PUBLIC/);
  });

  it('es transaccional, con límites de bloqueo, idempotente y declara su condición de propuesta', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code).toMatch(/COMMIT;/);
    expect(code).toMatch(/SET LOCAL lock_timeout/);
    expect([...code.matchAll(/CREATE\s+(?:SCHEMA|TABLE|(?:UNIQUE\s+)?INDEX)\s+(?!IF NOT EXISTS)/gi)]).toHaveLength(0);
    expect(sql).toContain('PENDIENTE DE APROBACIÓN');
  });
});

describe('Verificación y permisos de la migración 002', () => {
  it('la verificación pre/post es de solo lectura y termina en ROLLBACK', () => {
    const code = executable(migration('002_service_withdrawal.verify.sql'));
    expect(code).toMatch(/^BEGIN TRANSACTION READ ONLY;/);
    expect(code.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  });

  it('los permisos van al rol de la aplicación indicado, sin DELETE, sin PUBLIC y sin contraseñas', () => {
    const code = executable(migration('002_service_withdrawal.grants.sql'));
    expect(code).toMatch(/g8_runtime_role/);
    expect(code).not.toMatch(/DELETE|PUBLIC|PASSWORD|OWNER/i);
  });

  it('las tablas que consulta la aplicación existen en la propuesta (almacenamiento y sonda coinciden con el SQL)', () => {
    const storage = readFileSync(join(__dirname, 'withdrawal.storage.ts'), 'utf8');
    const sql = migration('002_service_withdrawal.sql');
    for (const table of new Set([...storage.matchAll(/g8_retiros\.(\w+)/g)].map(match => match[1]))) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS g8_retiros.${table} (`);
    }
  });
});
