import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  INTEGRATION_COMPANY_SCOPE,
  INTEGRATION_GROUPS,
  IntegrationCompanyRequirement,
  IntegrationPrincipal,
} from './integration-auth.types';

type ConfiguredKey = IntegrationPrincipal & { hash: Buffer; active: boolean };

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Record<string, unknown> & {
      headers?: Record<string, string | string[] | undefined>;
      integration?: IntegrationPrincipal;
    }>();
    const raw = request.headers?.['x-api-key'];
    if (typeof raw !== 'string' || !raw || raw !== raw.trim() || raw.length > 1024 || /[\r\n]/.test(raw)) {
      throw new UnauthorizedException('Falta una API key de integración válida');
    }

    const presented = createHash('sha256').update(raw, 'utf8').digest();
    let matched: ConfiguredKey | undefined;
    for (const entry of this.keys().filter(key => key.active)) {
      if (entry.hash.length === presented.length && timingSafeEqual(entry.hash, presented)) matched ??= entry;
    }
    if (!matched) throw new UnauthorizedException('API key de integración inválida');

    const groups = this.reflector.getAllAndOverride<string[]>(INTEGRATION_GROUPS, [context.getHandler(), context.getClass()]);
    if (!groups?.length || !groups.includes(matched.group)) throw new ForbiddenException('Grupo de integración no autorizado');

    const scope = this.reflector.getAllAndOverride<IntegrationCompanyRequirement | undefined>(
      INTEGRATION_COMPANY_SCOPE,
      [context.getHandler(), context.getClass()],
    );
    if (scope) {
      const source = request[scope.source];
      const value = source && typeof source === 'object' ? (source as Record<string, unknown>)[scope.field] : undefined;
      const idEmpresa = typeof value === 'number' ? value : typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(idEmpresa) || !matched.companies.includes(idEmpresa)) {
        throw new ForbiddenException('Empresa fuera del alcance de la integración');
      }
    }

    request.integration = { keyId: matched.keyId, group: matched.group, companies: [...matched.companies] };
    return true;
  }

  private keys(): ConfiguredKey[] {
    const raw = this.config.get<string>('G8_INTEGRATION_API_KEYS') ?? '[]';
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((value): ConfiguredKey[] => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        const keyId = typeof row.keyId === 'string' ? row.keyId.trim() : '';
        const group = typeof row.group === 'string' ? row.group.trim().toUpperCase() : '';
        const sha256 = typeof row.sha256 === 'string' ? row.sha256.trim().toLowerCase() : '';
        const companies = Array.isArray(row.companies)
          ? [...new Set(row.companies.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))]
          : [];
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(keyId) || !/^G[1-9]\d?$/.test(group)
          || !/^[a-f0-9]{64}$/.test(sha256) || !companies.length || typeof row.active !== 'boolean') return [];
        return [{ keyId, group, companies, active: row.active, hash: Buffer.from(sha256, 'hex') }];
      });
    } catch {
      return [];
    }
  }
}

