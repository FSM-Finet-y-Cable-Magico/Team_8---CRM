import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGlobalSchema,normalizeType,normalizeExpression} from './global-schema.mjs';
import {compareCatalog} from './verify-global-db.mjs';
const global=parseGlobalSchema(),actual=JSON.parse(readFileSync('docs/i3-railway-catalog.json','utf8'));
const report=compareCatalog(global,actual);
writeFileSync('docs/i3-railway-vs-init-global.json',JSON.stringify(report,null,2)+'\n');
const q=s=>'"'+s.replaceAll('"','""')+'"',lit=s=>"'"+s.replaceAll("'","''")+"'";
const tableName=s=>'public.'+q(s);
const lines=[
'-- PREPARADO_NO_EJECUTADO. Requiere revision humana y acuerdo entre grupos.',
'-- Contrato SHA256: '+global.hash,
'-- Snapshot READ ONLY: '+actual.capturedAt,
'-- Catalog SHA256: '+createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
'-- Repetir introspeccion y regenerar antes de ejecutar. No baseline mientras haya drift.',
'-- Transaccion atomica: cualquier constraint/dato incompatible aborta sin aplicar cambios parciales.',
'-- El operador debe establecer crm.reconcile_reviewed=approved y crm.legacy_timezone',
'-- en su sesion DESPUES de respaldar y revisar los husos historicos con los grupos.',
'BEGIN;', "SET LOCAL lock_timeout='5s';", "SET LOCAL statement_timeout='120s';",
"SET LOCAL search_path=public,pg_catalog;",
"DO $$ BEGIN IF current_setting('crm.reconcile_reviewed',true) IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'REVIEW_REQUIRED'; END IF; END $$;"
];
const pending=[];const add=s=>lines.push(s);
for(const table of global.tables){
 const exists=actual.tables.some(t=>t.name===table.name);
 if(!exists){add('\n-- MISSING_TABLE '+table.name+' / '+table.owner);add(table.sql.replace('CREATE TABLE IF NOT EXISTS '+table.name,'CREATE TABLE IF NOT EXISTS '+tableName(table.name)));continue;}
 for(const c of table.columns){
  const a=actual.columns.find(x=>x.table===table.name&&x.name===c.name),tbl=tableName(table.name),col=q(c.name);
  if(!a){
   if(!c.nullable&&c.default===null)add(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM ${tbl} LIMIT 1) THEN RAISE EXCEPTION 'BACKFILL_REVIEW_REQUIRED: ${table.name}.${c.name}'; END IF; END $$;`);
   add(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${c.definition};`);continue;
  }
  const old=normalizeType(a.type);
  if(old!==c.type){
   const oldWidth=/^varchar\((\d+)\)$/.exec(old),newWidth=/^varchar\((\d+)\)$/.exec(c.type);
   const safeWidth=oldWidth&&newWidth&&Number(newWidth[1])>=Number(oldWidth[1]);
   const precision=old==='timestamp(3)'&&c.type==='timestamp';
   const dateZone=['date','timestamp'].includes(old)&&c.type==='timestamptz';
   const inet=old==='inet'&&c.type==='varchar(45)';
   if(dateZone){
    add("DO $$ BEGIN IF nullif(current_setting('crm.legacy_timezone',true),'') IS NULL THEN RAISE EXCEPTION 'LEGACY_TIMEZONE_REVIEW_REQUIRED'; END IF; END $$;");
    add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} TYPE timestamptz USING (${col}::timestamp AT TIME ZONE current_setting('crm.legacy_timezone'));`);
   }else if(inet){
    add(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM ${tbl} WHERE length(${col}::text)>45) THEN RAISE EXCEPTION 'IP_TEXT_LENGTH_REVIEW_REQUIRED'; END IF; END $$;`);
    add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} TYPE varchar(45) USING ${col}::text;`);
   }else if(safeWidth||precision||old==='char(64)'&&c.type==='varchar(64)'){
    add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} TYPE ${c.type};`);
   }else pending.push(`TYPE_REVIEW ${table.name}.${c.name}: ${old} -> ${c.type}`);
  }
  if(a.nullable!==c.nullable){
   if(c.nullable)add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} DROP NOT NULL;`);
   else{add(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM ${tbl} WHERE ${col} IS NULL) THEN RAISE EXCEPTION 'NULL_BACKFILL_REVIEW_REQUIRED'; END IF; END $$;`);add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} SET NOT NULL;`);}
  }
  if(normalizeExpression(a.default)!==normalizeExpression(c.default)){
   if(c.serial)pending.push(`SEQUENCE_DEFAULT_REVIEW ${table.name}.${c.name}; validar propiedad y max(id), no reiniciar secuencia`);
   else add(`ALTER TABLE ${tbl} ALTER COLUMN ${col} ${c.default===null?'DROP DEFAULT':'SET DEFAULT '+c.default};`);
  }
 }
}
for(const t of global.tables.filter(t=>actual.tables.some(a=>a.name===t.name))){
 for(const check of t.checks){const observed=actual.constraints.find(c=>c.table===t.name&&c.name===check.name);
  if(!observed)add(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=${lit('public.'+t.name)}::regclass AND conname=${lit(check.name)}) THEN ALTER TABLE ${tableName(t.name)} ADD CONSTRAINT ${q(check.name)} ${check.definition} NOT VALID; END IF; END $$;\nALTER TABLE ${tableName(t.name)} VALIDATE CONSTRAINT ${q(check.name)};`);
  else if(normalizeExpression(observed.definition)!==normalizeExpression(check.definition)||!observed.validated)pending.push(`CHECK_REVIEW ${t.name}.${check.name}: equivalencia y validacion deben verificarse`);
 }
}
for(const idx of global.indexes){
 const r=report.rows.find(r=>r.kind==='INDEX'&&r.table===idx.table&&r.name===idx.name);
 if(r.status==='MISSING_INDEX')add(idx.sql.replace(' ON '+idx.table+' ',' ON '+tableName(idx.table)+' '));
 else if(r.status!=='MATCH')pending.push(`INDEX_REVIEW ${idx.table}.${idx.name}: no sustituir silenciosamente`);
}
for(const fk of global.fks){
 const r=report.rows.find(r=>r.kind==='FK'&&r.table===fk.table&&r.name===fk.name);
 if(r.status==='MISSING_FK')add(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=${lit('public.'+fk.table)}::regclass AND conname=${lit(fk.name)}) THEN ${fk.sql.replace('ALTER TABLE '+fk.table,'ALTER TABLE '+tableName(fk.table)).replace(/;$/,' NOT VALID;')} END IF; END $$;\nALTER TABLE ${tableName(fk.table)} VALIDATE CONSTRAINT ${q(fk.name)};`);
 else if(r.status!=='MATCH')pending.push(`FK_REVIEW ${fk.table}.${fk.name}: acciones/relacion difieren; decision intergrupo`);
}
for(const r of report.rows.filter(r=>r.status!=='MATCH'&&r.kind==='PK'&&actual.tables.some(t=>t.name===r.table)))pending.push(`PK_REVIEW ${r.table}`);
add('\n-- Revision residual: el script no elimina extras ni inventa backfills.');
for(const s of pending)add('-- '+s);
add('COMMIT;');
writeFileSync('db/global/reconcile-railway-to-init-global.sql',lines.join('\n\n')+'\n');
const cell=x=>JSON.stringify(x??null).replaceAll('|','\\|');
writeFileSync('docs/i3-railway-vs-init-global.md',`# Railway frente al contrato global\n\nEstado: **DEGRADED_SCHEMA / PENDIENTE_RECONCILIACION_GLOBAL**. Lectura real ${actual.capturedAt}; transacción READ ONLY; no datos comerciales exportados.\n\nTablas físicas: ${actual.tables.length} (incluye _prisma_migrations); columnas: ${actual.columns.length}; migraciones registradas: ${actual.migrations.length}. Contrato: ${cell(global.counts)}.\n\nResultado: ${report.status}. Resumen: ${cell(report.summary)}.\n\nLa comparación normaliza presentación SQL; diferencias de expresiones no demostradas equivalentes se conservan para revisión. PK se compara por columnas; FK por tabla/columnas destino, acciones, validación y deferibilidad; índices por tabla, expresión, unicidad, validez. Secuencias por tipo/incremento/ciclo y propiedad serial. _prisma_migrations se conserva como metadatos; otras extras impiden igualdad exacta.\n\nReconciliación: PREPARADO_NO_EJECUTADO. Incluye guardas para aprobación/huso histórico, adiciones sin seeds, ampliaciones seguras, restricciones verificadas y transacción con timeout. No ejecutado ni validado aplicándolo a una BD local. Antes de ejecutarlo: respaldo, nueva introspección, revisar backfills NOT NULL, duplicados únicos, huérfanos FK y cambios de timezone con owners.\n\nPendientes de revisión residual del generador: ${cell(pending)}.\n\nCada columna incluye tipo/nulabilidad/default en origen y objetivo; otros objetos tienen filas propias. Ownership es funcional orientativo; no concede escritura directa en tablas externas.\n\n|Clase|Tabla|Objeto|Owner|Estado|Global|Railway|Acción|\n|---|---|---|---|---|---|---|---|\n`+report.rows.map(r=>`|${r.kind}|${r.table}|${r.name}|${r.owner}|${r.status}|${cell(r.expected)}|${cell(r.observed)}|${r.action}|`).join('\n')+'\n');
console.log(JSON.stringify({status:'PREPARADO_NO_EJECUTADO',summary:report.summary,residualReview:pending}));
