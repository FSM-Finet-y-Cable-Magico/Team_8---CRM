import { Prisma } from '@prisma/client';
export async function inspectPrivateSignatureSchema(tx: Prisma.TransactionClient) {
  const columns = await tx.$queryRaw<Array<{ name: string; type: string; nullable: boolean }>>`
    SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable
    FROM pg_attribute a WHERE a.attrelid=to_regclass('g8_contratos.solicitud_firma')
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`;
  const constraints = await tx.$queryRaw<Array<{ name: string; kind: string; validated: boolean; definition: string }>>`
    SELECT conname AS name, contype::text AS kind, convalidated AS validated, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid=to_regclass('g8_contratos.solicitud_firma') ORDER BY conname`;
  const indexes = await tx.$queryRaw<Array<{ name: string; unique: boolean; valid: boolean; definition: string }>>`
    SELECT c.relname AS name, i.indisunique AS unique, i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid=to_regclass('g8_contratos.solicitud_firma') ORDER BY c.relname`;
  const permissions = await tx.$queryRaw<Array<{ runtime: string; owner: string; superuser: boolean; usage: boolean; create: boolean;
    select: boolean; insert: boolean; update: boolean; delete: boolean }>>`
    SELECT current_user AS runtime, pg_get_userbyid(c.relowner) AS owner, r.rolsuper AS superuser,
      has_schema_privilege(current_user,n.oid,'USAGE') AS usage, has_schema_privilege(current_user,n.oid,'CREATE') AS "create",
      has_table_privilege(current_user,c.oid,'SELECT') AS "select", has_table_privilege(current_user,c.oid,'INSERT') AS "insert",
      has_table_privilege(current_user,c.oid,'UPDATE') AS "update", has_table_privilege(current_user,c.oid,'DELETE') AS "delete"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.rolname=current_user
    WHERE n.nspname='g8_contratos' AND c.relname='solicitud_firma'`;
  const violations: string[] = [];
  const required = ['firma_state_check','firma_hash_check','firma_otp_check','firma_pdf_check','firma_snapshot_check',
    'firma_expiry_check','firma_signed_check','firma_mail_check','firma_version_check'];
  if (columns.length !== 29) violations.push('COLUMNS');
  if (constraints.some(c => c.kind === 'f')) violations.push('CROSS_SCHEMA_FK');
  if (required.some(name => !constraints.some(c => c.name === name && c.validated && c.kind === 'c'))) violations.push('CHECKS');
  const definitions = Object.fromEntries(constraints.map(c => [c.name, c.definition.replace(/\s+/g,' ').toLowerCase()]));
  if (!definitions.firma_otp_check?.includes('>= 0') || !definitions.firma_otp_check.includes('<= 5')
    || definitions.firma_otp_check.includes('between')) violations.push('OTP_BOUNDS');
  if (!definitions.firma_pdf_check?.includes('<= 4194304') || !definitions.firma_pdf_check.includes('<= 5242880')
    || definitions.firma_pdf_check.includes('between')) violations.push('PDF_BOUNDS');
  const requiredIndexes = ['firma_token_key','firma_document_key','firma_pending_contract_key','firma_version_key','firma_company_contract_idx'];
  if (requiredIndexes.some(name => !indexes.some(i => i.name === name && i.valid))) violations.push('INDEXES');
  const p = permissions[0];
  if (!p || p.superuser || p.owner === p.runtime || !p.usage || p.create || !p.select || !p.insert || !p.update || p.delete) violations.push('RUNTIME_PERMISSIONS');
  return { ready: !violations.length, violations, columns, constraints, indexes, permissions };
}
