import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HttpG1InventoryClient } from '../g1-integration/http-g1-inventory.client';
import { HttpG3IntegrationClient } from '../g3-integration/http-g3-integration.client';
import { GLOBAL_COLUMNS } from './global-columns.generated';

type Column = { table: string; name: string; type: string; nullable: boolean };
const normalize = (type: string) => type.toLowerCase().replace(/character varying/g, 'varchar')
  .replace(/timestamp(\(\d+\))? without time zone/g, 'timestamp$1')
  .replace(/timestamp(\(\d+\))? with time zone/g, 'timestamptz$1')
  .replace(/\b(timestamp|timestamptz)\(6\)/g, '$1').replace(/character/g, 'char').replace(/,\s+/g, ',');

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  @Get('health')
  health() { return { application: 'UP' }; }

  @Get('ready')
  async ready() {
    const configured = {
      g1_configured: new HttpG1InventoryClient(this.config).configured(),
      g3_configured: new HttpG3IntegrationClient(this.config).configured(),
    };
    try {
      const rows = await this.prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='3000ms'");
        return tx.$queryRawUnsafe<Column[]>(`SELECT t.relname AS "table", a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable
          FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid
          WHERE n.nspname='public' AND t.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`);
      }, { timeout: 5000, maxWait: 1000 });
      const columns = new Map(rows.map(c => [c.table + '.' + c.name, c]));
      let missing = 0, different = 0;
      for (const c of GLOBAL_COLUMNS) {
        const actual = columns.get(c.table + '.' + c.name);
        if (!actual) missing++;
        else if (normalize(actual.type) !== c.type || actual.nullable !== c.nullable) different++;
      }
      return { application: 'UP', database: 'UP', global_schema: missing || different ? 'DEGRADED' : 'READY',
        schema_check: 'TABLES_COLUMNS_TYPES_NULLABILITY', missing_columns: missing, different_columns: different,
        g1_payload_snapshot: columns.has('integracion_activacion_g1.payload_snapshot') ? 'READY' : 'PENDING_APPROVAL_OR_RECONCILIATION',
        ...configured };
    } catch {
      throw new ServiceUnavailableException({ application: 'UP', database: 'DOWN', global_schema: 'DEGRADED', ...configured });
    }
  }
}
