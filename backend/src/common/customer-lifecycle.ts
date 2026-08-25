import { Prisma } from '@prisma/client';

export const ACTIVE_CUSTOMER_STATUS = 'Activo';
export const LOST_PROSPECT_PIPELINE_STATUS = 'Perdido';

export function activeProspectWhere(
  companyScope: Prisma.ProspectoWhereInput,
): Prisma.ProspectoWhereInput {
  return {
    AND: [
      companyScope,
      { idCliente: null },
      {
        OR: [
          { estadoPipeline: null },
          { estadoPipeline: { not: LOST_PROSPECT_PIPELINE_STATUS } },
        ],
      },
    ],
  };
}

export function activeCustomerWhere(
  companyScope: Prisma.ClienteWhereInput,
): Prisma.ClienteWhereInput {
  return {
    AND: [companyScope, { estado: ACTIVE_CUSTOMER_STATUS }],
  };
}
