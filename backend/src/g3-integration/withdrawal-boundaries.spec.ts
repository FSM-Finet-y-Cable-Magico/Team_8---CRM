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

  it('las tablas que consulta la aplicación existen en la migración', () => {
    const storage = readFileSync(join(__dirname, 'withdrawal.storage.ts'), 'utf8');
    const tables = new Set([...storage.matchAll(/g8_retiros\.(\w+)/g)].map(match => match[1]));
    expect(tables.size).toBe(3);
    for (const table of tables) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS g8_retiros.${table} (`);
  });
});
