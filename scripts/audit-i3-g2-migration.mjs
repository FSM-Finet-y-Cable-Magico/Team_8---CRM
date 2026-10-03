import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const migrationPath = resolve(
  root,
  'backend/prisma/migrations/20261001120000_i3_g2_intergroup_contract/migration.sql',
);

const required = {
  prospectPlanColumn: /ALTER TABLE\s+prospecto[\s\S]*?ADD COLUMN IF NOT EXISTS\s+id_plan_interes\s+INTEGER\s*;/i,
  prospectPlanForeignKey: /CONSTRAINT\s+prospecto_id_plan_interes_fkey[\s\S]*?FOREIGN KEY\s*\(id_plan_interes\)\s+REFERENCES\s+plan\s*\(id_plan\)[\s\S]*?ON UPDATE CASCADE\s+ON DELETE SET NULL/i,
  prospectPlanIndex: /CREATE INDEX IF NOT EXISTS\s+prospecto_id_empresa_id_plan_interes_idx\s+ON\s+prospecto\s*\(id_empresa,\s*id_plan_interes\)/i,
  paymentAuthorization: /ADD COLUMN IF NOT EXISTS\s+codigo_autorizacion\s+VARCHAR\(100\)/i,
  receiptStateColumn: /ADD COLUMN IF NOT EXISTS\s+comprobante_estado\s+VARCHAR\(20\)/i,
  receiptStateBackfill: /UPDATE\s+pago[\s\S]*?SET\s+comprobante_estado\s*=\s*CASE[\s\S]*?'GENERADO'[\s\S]*?'PENDIENTE'[\s\S]*?WHERE\s+comprobante_estado\s+IS NULL/i,
  receiptStateDefault: /ALTER COLUMN\s+comprobante_estado\s+SET DEFAULT\s+'PENDIENTE'/i,
  receiptStateNotNull: /ALTER COLUMN\s+comprobante_estado\s+SET NOT NULL/i,
  receiptStateCheck: /CONSTRAINT\s+pago_comprobante_estado_check[\s\S]*?CHECK\s*\(comprobante_estado\s+IN\s*\('PENDIENTE',\s*'GENERADO',\s*'FALLIDO'\)\)/i,
  wifiCategoryInsert: /INSERT INTO\s+categoria_falla\s*\(nombre,\s*sla_horas\)[\s\S]*?'CAMBIO_CREDENCIALES_WIFI'[\s\S]*?WHERE NOT EXISTS/i,
  wifiCategoryUnique: /CREATE UNIQUE INDEX IF NOT EXISTS\s+categoria_falla_nombre_key\s+ON\s+categoria_falla\s*\(nombre\)/i,
  wifiResultTable: /CREATE TABLE IF NOT EXISTS\s+integracion_resultado_wifi_g2\s*\(/i,
  wifiResultPrimaryKey: /id_resultado\s+BIGSERIAL\s+PRIMARY KEY/i,
  wifiResultRequestId: /request_id\s+VARCHAR\(100\)\s+NOT NULL/i,
  wifiResultTraceId: /trace_id\s+VARCHAR\(100\)(?!\s+NOT NULL)/i,
  wifiResultCompany: /id_empresa\s+INTEGER\s+NOT NULL/i,
  wifiResultTicket: /id_ticket\s+INTEGER\s+NOT NULL/i,
  wifiResultHash: /payload_hash\s+VARCHAR\(64\)\s+NOT NULL/i,
  wifiResultSuccess: /exito\s+BOOLEAN\s+NOT NULL/i,
  wifiResultSanitizedResult: /resultado_tecnico\s+TEXT\s+NOT NULL/i,
  wifiResultState: /estado_ticket_resultante\s+VARCHAR\(20\)\s+NOT NULL/i,
  wifiResultTimestamp: /fecha_recepcion\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT CURRENT_TIMESTAMP/i,
  wifiResultCheck: /CONSTRAINT\s+integracion_resultado_wifi_g2_estado_check[\s\S]*?CHECK\s*\(estado_ticket_resultante\s+IN\s*\('Resuelto',\s*'Escalado'\)\)/i,
  wifiResultCompanyFk: /CONSTRAINT\s+integracion_resultado_wifi_g2_id_empresa_fkey[\s\S]*?FOREIGN KEY\s*\(id_empresa\)\s+REFERENCES\s+empresa\s*\(id_empresa\)[\s\S]*?ON UPDATE CASCADE\s+ON DELETE RESTRICT/i,
  wifiResultTicketFk: /CONSTRAINT\s+integracion_resultado_wifi_g2_id_ticket_fkey[\s\S]*?FOREIGN KEY\s*\(id_ticket\)\s+REFERENCES\s+ticket\s*\(id_ticket\)[\s\S]*?ON UPDATE CASCADE\s+ON DELETE RESTRICT/i,
  wifiResultRequestUnique: /CREATE UNIQUE INDEX IF NOT EXISTS\s+integracion_resultado_wifi_g2_request_id_key\s+ON\s+integracion_resultado_wifi_g2\s*\(request_id\)/i,
  wifiResultCompanyIndex: /CREATE INDEX IF NOT EXISTS\s+integracion_resultado_wifi_g2_empresa_fecha_idx\s+ON\s+integracion_resultado_wifi_g2\s*\(id_empresa,\s*fecha_recepcion\)/i,
  wifiResultTicketIndex: /CREATE INDEX IF NOT EXISTS\s+integracion_resultado_wifi_g2_ticket_fecha_idx\s+ON\s+integracion_resultado_wifi_g2\s*\(id_ticket,\s*fecha_recepcion\)/i,
};

export function auditMigration(sql = readFileSync(migrationPath, 'utf8')) {
  const code = sql.replace(/--[^\r\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const objects = Object.fromEntries(Object.entries(required).map(([name, pattern]) => [name, pattern.test(code)]));
  const forbidden = {
    DROP: /(?:^|;)\s*DROP\s+/im.test(code),
    TRUNCATE: /(?:^|;)\s*TRUNCATE(?:\s+TABLE)?\s+/im.test(code),
    DELETE: /(?:^|;)\s*DELETE\s+FROM\s+/im.test(code),
  };
  const failed = Object.entries(objects).filter(([, present]) => !present).map(([name]) => name);
  const destructive = Object.entries(forbidden).filter(([, present]) => present).map(([name]) => name);
  return {
    status: failed.length || destructive.length ? 'FAIL' : 'PASS',
    file: 'backend/prisma/migrations/20261001120000_i3_g2_intergroup_contract/migration.sql',
    sha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
    additive: destructive.length === 0,
    forbidden,
    plannedDataChanges: { updatePaymentReceiptStateBackfill: true, insertWifiCategoryIfMissing: true },
    objects,
    failed,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditMigration();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}
