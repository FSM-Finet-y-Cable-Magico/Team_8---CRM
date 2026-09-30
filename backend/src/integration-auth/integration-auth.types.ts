import { SetMetadata } from '@nestjs/common';

export const INTEGRATION_GROUPS = 'integration:groups';
export const INTEGRATION_COMPANY_SCOPE = 'integration:company-scope';

export type IntegrationPrincipal = {
  keyId: string;
  group: string;
  companies: number[];
};

export type IntegrationCompanyRequirement = {
  source: 'body' | 'params' | 'query';
  field: string;
};

export const IntegrationGroups = (...groups: string[]) => SetMetadata(INTEGRATION_GROUPS, groups);
export const IntegrationCompanyScope = (
  source: IntegrationCompanyRequirement['source'],
  field = 'id_empresa',
) => SetMetadata(INTEGRATION_COMPANY_SCOPE, { source, field } satisfies IntegrationCompanyRequirement);

