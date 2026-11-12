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

describe('Propuesta de migración g8_retiros', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', 'db', 'g8', 'migrations', '002_service_withdrawal.sql'), 'utf8');
  const executable = sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');

  it('es aditiva: sin DML, sin borrar ni renombrar, y solo crea objetos del esquema privado', () => {
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|RENAME)\b/i);
    expect(executable).not.toMatch(/ALTER\s+TABLE/i);
    const created = [...executable.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?:CONCURRENTLY\s+)?IF NOT EXISTS\s+(?:\w+\s+ON\s+)?([\w.]+)/gi)].map(match => match[1]);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every(name => name.startsWith('g8_retiros.'))).toBe(true);
  });

  it('no declara FK ni triggers hacia tablas públicas compartidas', () => {
    expect(executable).not.toMatch(/REFERENCES|TRIGGER/i);
    expect(executable).not.toMatch(/\bpublic\./i);
  });

  it('declara su condición de propuesta pendiente de aprobación', () => {
    expect(sql).toContain('PENDIENTE DE APROBACIÓN');
    expect(sql).toContain('NO EJECUTAR');
  });
});
