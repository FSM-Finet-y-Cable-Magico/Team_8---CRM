import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaxDocumentIssuerCompany } from './tax-document-issuer.types';

type FacturacionClConfigSnapshot = {
  enabled: boolean;
  valid: boolean;
  companies: TaxDocumentIssuerCompany[];
};

const COMPANY_KEYS = ['alias', 'enabled', 'environment', 'idEmpresa'].sort();

export function parseFacturacionClCompanies(raw?: string): { valid: boolean; companies: TaxDocumentIssuerCompany[] } {
  if (!raw?.trim()) return { valid: true, companies: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return { valid: false, companies: [] };
    const ids = new Set<number>();
    const aliases = new Set<string>();
    const companies: TaxDocumentIssuerCompany[] = [];
    for (const row of value) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return { valid: false, companies: [] };
      const candidate = row as Record<string, unknown>;
      const keys = Object.keys(candidate).sort();
      const idEmpresa = candidate.idEmpresa;
      const alias = candidate.alias;
      const environment = candidate.environment;
      const enabled = candidate.enabled;
      if (keys.length !== COMPANY_KEYS.length || keys.some((key, index) => key !== COMPANY_KEYS[index])
        || !Number.isSafeInteger(idEmpresa) || Number(idEmpresa) < 1
        || typeof alias !== 'string' || !/^[A-Z0-9_]{1,40}$/.test(alias)
        || (environment !== 'sandbox' && environment !== 'production')
        || typeof enabled !== 'boolean' || ids.has(Number(idEmpresa)) || aliases.has(alias)) {
        return { valid: false, companies: [] };
      }
      ids.add(Number(idEmpresa));
      aliases.add(alias);
      companies.push({ idEmpresa: Number(idEmpresa), alias, environment, enabled });
    }
    return { valid: true, companies };
  } catch {
    return { valid: false, companies: [] };
  }
}

@Injectable()
export class FacturacionClConfigService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const current = this.snapshot();
    if (!current.valid) throw new Error('FACTURACION_CL_CONFIGURATION_INVALID');
    if (current.enabled && current.companies.some(company => company.enabled && company.environment === 'production')) {
      throw new Error('FACTURACION_CL_PRODUCTION_NOT_CERTIFIED');
    }
  }

  snapshot(): FacturacionClConfigSnapshot {
    const flag = (this.config.get<string>('FACTURACION_CL_INTEGRATION_ENABLED') ?? 'false').trim().toLowerCase();
    const parsed = parseFacturacionClCompanies(this.config.get<string>('FACTURACION_CL_COMPANIES'));
    return {
      enabled: flag === 'true',
      valid: (flag === 'true' || flag === 'false') && parsed.valid,
      companies: parsed.companies,
    };
  }
}
