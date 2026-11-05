import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { INTEGRATION_GROUPS } from './integration-auth.types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function setup(input: { key?: string; groups?: string[]; company?: number; entries?: unknown[]; source?: 'body' | 'query' } = {}) {
  const entries = input.entries ?? [{ keyId: 'g1-current', group: 'G1', sha256: hash('g1-test-key'), companies: [1, 2], active: true }];
  const config = new ConfigService({ G8_INTEGRATION_API_KEYS: JSON.stringify(entries) });
  const reflector = { getAllAndOverride: jest.fn((metadata: string) => metadata === INTEGRATION_GROUPS
    ? input.groups ?? ['G1']
    : input.company === undefined ? undefined : { source: input.source ?? 'body', field: 'id_empresa' }) };
  const request: Record<string, unknown> = {
    headers: input.key === undefined ? {} : { 'x-api-key': input.key },
    body: { id_empresa: input.company },
    query: { id_empresa: input.company?.toString() },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => setup, getClass: () => IntegrationApiKeyGuard };
  return { guard: new IntegrationApiKeyGuard(config, reflector as never), context: context as never, request };
}

describe('IntegrationApiKeyGuard', () => {
  it('responde 401 ante key ausente o inválida sin incluir secretos', () => {
    expect(() => setup().guard.canActivate(setup().context)).toThrow(UnauthorizedException);
    const invalid = setup({ key: 'wrong-secret' });
    let error: unknown;
    try { invalid.guard.canActivate(invalid.context); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify(error)).not.toContain('wrong-secret');
  });

  it('responde 403 cuando el grupo autenticado no está autorizado', () => {
    const test = setup({ key: 'g1-test-key', groups: ['G3'] });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });

  it('responde 403 cuando la empresa queda fuera del scope', () => {
    const test = setup({ key: 'g1-test-key', company: 3 });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });

  it('autoriza grupo y empresa y solo adjunta contexto saneado', () => {
    const test = setup({ key: 'g1-test-key', company: 2 });
    expect(test.guard.canActivate(test.context)).toBe(true);
    expect(test.request.integration).toEqual({ keyId: 'g1-current', group: 'G1', companies: [1, 2] });
    expect(JSON.stringify(test.request.integration)).not.toContain('g1-test-key');
  });

  it('permite rotación mediante varias hashes activas y rechaza entradas inactivas', () => {
    const entries = [
      { keyId: 'g1-old', group: 'G1', sha256: hash('old-key'), companies: [1], active: false },
      { keyId: 'g1-new', group: 'G1', sha256: hash('new-key'), companies: [1], active: true },
    ];
    const active = setup({ key: 'new-key', company: 1, entries });
    expect(active.guard.canActivate(active.context)).toBe(true);
    const inactive = setup({ key: 'old-key', company: 1, entries });
    expect(() => inactive.guard.canActivate(inactive.context)).toThrow(UnauthorizedException);
  });

  it.each([1, 2])('autoriza una key G2 para empresa %s dentro de companies=[1,2]', (company) => {
    const entries = [{ keyId: 'g2-current', group: 'G2', sha256: hash('g2-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g2-test-key', groups: ['G2'], company, entries, source: 'query' });
    expect(test.guard.canActivate(test.context)).toBe(true);
    expect(test.request.integration).toEqual({ keyId: 'g2-current', group: 'G2', companies: [1, 2] });
  });

  it('rechaza una empresa fuera del scope de la key G2', () => {
    const entries = [{ keyId: 'g2-current', group: 'G2', sha256: hash('g2-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g2-test-key', groups: ['G2'], company: 3, entries, source: 'query' });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });

  it('impide que una key G3 consuma endpoints exclusivos de G2', () => {
    const entries = [{ keyId: 'g3-current', group: 'G3', sha256: hash('g3-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g3-test-key', groups: ['G2'], company: 1, entries });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });

  it.each([1, 2])('autoriza una key G3 para empresa %s dentro de companies=[1,2]', (company) => {
    const entries = [{ keyId: 'g3-current', group: 'G3', sha256: hash('g3-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g3-test-key', groups: ['G3'], company, entries });
    expect(test.guard.canActivate(test.context)).toBe(true);
    expect(test.request.integration).toEqual({ keyId: 'g3-current', group: 'G3', companies: [1, 2] });
  });

  it('rechaza una empresa fuera del scope de la key G3', () => {
    const entries = [{ keyId: 'g3-current', group: 'G3', sha256: hash('g3-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g3-test-key', groups: ['G3'], company: 3, entries });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });

  it('impide que una key G2 consuma el cierre exclusivo de G3', () => {
    const entries = [{ keyId: 'g2-current', group: 'G2', sha256: hash('g2-test-key'), companies: [1, 2], active: true }];
    const test = setup({ key: 'g2-test-key', groups: ['G3'], company: 1, entries });
    expect(() => test.guard.canActivate(test.context)).toThrow(ForbiddenException);
  });
});
