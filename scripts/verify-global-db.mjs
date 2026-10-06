import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseGlobalSchema, normalizeType, normalizeExpression, normalizeCheckExpression, ownerOf } from './global-schema.mjs';

export async function readCatalog(prisma) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15000ms'");
    const query = sql => tx.$queryRawUnsafe(sql);
    const tables = await query("SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename");
    const columns = await query(`SELECT c.table_name AS "table", c.column_name AS name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
      c.is_nullable='YES' AS nullable, c.column_default AS "default", c.is_identity AS identity,
      pg_get_serial_sequence(format('%I.%I',c.table_schema,c.table_name),c.column_name) AS sequence
      FROM information_schema.columns c JOIN pg_namespace n ON n.nspname=c.table_schema
      JOIN pg_class t ON t.relnamespace=n.oid AND t.relname=c.table_name
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attname=c.column_name
      WHERE c.table_schema='public' ORDER BY c.table_name,c.ordinal_position`);
    const constraints = await query(`SELECT t.relname AS "table", c.conname AS name, c.contype::text AS kind,
      pg_get_constraintdef(c.oid,true) AS definition, c.convalidated AS validated,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS columns,
      rt.relname AS "referencedTable", rn.nspname AS "referencedSchema",
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord) AS "referencedColumns",
      c.confdeltype::text AS "deleteCode", c.confupdtype::text AS "updateCode", c.condeferrable AS deferrable
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_class rt ON rt.oid=c.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
      WHERE n.nspname='public' AND c.contype IN ('p','f','u','c') ORDER BY t.relname,c.conname`);
    const indexes = await query(`SELECT p.tablename AS "table", p.indexname AS name, p.indexdef AS definition,
      i.indisunique AS "unique", i.indisprimary AS primary, i.indisvalid AS valid, i.indisready AS ready
      FROM pg_indexes p JOIN pg_class c ON c.relname=p.indexname JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
      JOIN pg_index i ON i.indexrelid=c.oid WHERE p.schemaname='public' ORDER BY p.tablename,p.indexname`);
    const sequences = await query(`SELECT sequencename AS name, data_type::text AS type, start_value::text AS start, min_value::text AS min,
      max_value::text AS max, increment_by::text AS increment, cycle, cache_size::text AS cache FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`);
    const migrations = tables.some(t=>t.name==='_prisma_migrations')
      ? await query('SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM public._prisma_migrations ORDER BY started_at') : [];
    return { capturedAt:new Date().toISOString(), access:'READ_ONLY', tables, columns, constraints, indexes, sequences, migrations };
  }, { timeout:120000, maxWait:10000 });
}
const actions = { a:'NO ACTION', r:'RESTRICT', c:'CASCADE', n:'SET NULL', d:'SET DEFAULT' };
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
export const classifyDifference = row => {
  if (row.status === 'MATCH') return null;
  if (row.status === 'EXTRA_LEGACY' && row.kind === 'TABLE' && row.table === '_prisma_migrations') {
    return 'TECHNICAL_ALLOWED_EXTRA';
  }
  if (row.status === 'EXTRA_LEGACY') return 'UNOWNED_EXTRA';
  return 'CONTRACT_DIFFERENCE';
};
export const isAllowedDifference = row => classifyDifference(row)==='TECHNICAL_ALLOWED_EXTRA';
function sameDefault(expected, observed, columnType) {
  const clean = value => {
    let result = normalizeExpression(value);
    if (result && /^varchar(?:\(|$)/.test(columnType)) {
      result = result.replace(/^(('(?:''|[^'])*'))::(?:charactervarying|varchar|text)$/, '$1');
    }
    return result;
  };
  return clean(expected) === clean(observed);
}
export function compareCatalog(global, actual) {
  const rows = []; const add=(kind,table,name,status,expected,observed,action) => rows.push({kind,table,name,owner:ownerOf(table),status,expected,observed,action:action ?? (status==='MATCH'?'Ninguna':'Revisar y reconciliar antes de baseline')});
  const tableMap=new Map(actual.tables.map(t=>[t.name,t])); const columnMap=new Map(actual.columns.map(c=>[`${c.table}.${c.name}`,c]));
  for (const table of global.tables) {
    add('TABLE',table.name,table.name,tableMap.has(table.name)?'MATCH':'MISSING_TABLE',true,tableMap.has(table.name));
    for (const c of table.columns) {
      const a=columnMap.get(`${table.name}.${c.name}`);
      const flags=[];
      if (!a) flags.push('MISSING_COLUMN'); else {
        if(normalizeType(a.type)!==c.type) flags.push('TYPE_DIFFERENCE');
        if(a.nullable!==c.nullable) flags.push('NULLABILITY_DIFFERENCE');
        // Serial defaults are compared with sequence ownership as well as expression.
        if(!sameDefault(c.default,a.default,c.type)) flags.push('DEFAULT_DIFFERENCE');
        if(c.serial && !a.sequence) flags.push('REQUIRES_REVIEW');
      }
      add('COLUMN',table.name,c.name,flags.length?flags.join(','):'MATCH', {type:c.type,nullable:c.nullable,default:c.default}, a?{type:a.type,nullable:a.nullable,default:a.default}:null);
    }
    const pk=actual.constraints.find(c=>c.table===table.name&&c.kind==='p');
    add('PK',table.name,`${table.name}_pkey`,same(pk?.columns,table.pk)?'MATCH':'REQUIRES_REVIEW',table.pk,pk?.columns??null);
    for(const c of table.checks){ const a=actual.constraints.find(x=>x.table===table.name&&x.name===c.name&&x.kind==='c');
      add('CHECK',table.name,c.name,a&&a.validated&&normalizeCheckExpression(a.definition)===normalizeCheckExpression(c.definition)?'MATCH':'REQUIRES_REVIEW',c.definition,a?.definition??null);
    }
  }
  for(const fk of global.fks){
    const a=actual.constraints.find(c=>c.table===fk.table&&c.name===fk.name&&c.kind==='f');
    const shape=x=>({columns:x.columns,referencedTable:x.referencedTable,referencedColumns:x.referencedColumns,onDelete:x.onDelete,onUpdate:x.onUpdate});
    const observed=a?{...a,onDelete:actions[a.deleteCode],onUpdate:actions[a.updateCode]}:null;
    add('FK',fk.table,fk.name,!a?'MISSING_FK':a.validated&&!a.deferrable&&a.referencedSchema==='public'&&same(shape(fk),shape(observed))?'MATCH':'FK_MISMATCH',shape(fk),observed?shape(observed):null);
  }
  for(const index of global.indexes){
    const a=actual.indexes.find(i=>i.table===index.table&&i.name===index.name);
    const def=a?.definition.replace(/^CREATE (?:UNIQUE )?INDEX \S+ ON (?:public\.)?\S+ (?:USING btree )?/,'');
    add('INDEX',index.table,index.name,!a?'MISSING_INDEX':a.unique===index.unique&&a.valid&&a.ready&&normalizeExpression(def)===normalizeExpression(index.definition)?'MATCH':'INDEX_MISMATCH',index.definition,def??null);
  }
  for(const table of global.tables) for(const col of table.columns.filter(c=>c.serial)) {
    const name=`${table.name}_${col.name}_seq`; const a=actual.sequences.find(s=>s.name===name);
    add('SEQUENCE',table.name,name,a&&normalizeType(a.type)===col.type&&a.increment==='1'&&!a.cycle?'MATCH':'REQUIRES_REVIEW',{type:col.type,increment:'1',cycle:false},a??null);
  }
  const globalNames=new Set(global.tables.map(t=>t.name));
  for(const t of actual.tables) if(!globalNames.has(t.name)) add('TABLE',t.name,t.name,'EXTRA_LEGACY',null,true,t.name==='_prisma_migrations'?'Metadatos Prisma; conservar, no parte del contrato físico':'Conservar; decisión conjunta pendiente');
  for(const c of actual.columns) if(globalNames.has(c.table)&&!global.tables.find(t=>t.name===c.table).columns.some(x=>x.name===c.name)) add('COLUMN',c.table,c.name,'EXTRA_LEGACY',null,{type:c.type,nullable:c.nullable,default:c.default},'Conservar; no eliminar automáticamente');
  for(const c of actual.constraints.filter(c=>['f','c','u'].includes(c.kind))) {
    const known=c.kind==='f'?global.fks.some(x=>x.table===c.table&&x.name===c.name):c.kind==='c'?global.tables.find(t=>t.name===c.table)?.checks.some(x=>x.name===c.name):global.indexes.some(x=>x.table===c.table&&x.name===c.name&&x.unique);
    if(!known&&globalNames.has(c.table)) add('CONSTRAINT',c.table,c.name,'EXTRA_LEGACY',null,c.definition,'Revisar restricciones adicionales; no eliminar');
  }
  for(const i of actual.indexes) if(!i.primary&&globalNames.has(i.table)&&!global.indexes.some(x=>x.table===i.table&&x.name===i.name)) add('INDEX',i.table,i.name,'EXTRA_LEGACY',null,i.definition,'Revisar índice adicional; no eliminar');
  for (const row of rows) {
    const classification=classifyDifference(row);
    if (classification) row.classification=classification;
    if (classification==='TECHNICAL_ALLOWED_EXTRA') row.owner='Prisma';
    if (classification==='UNOWNED_EXTRA') row.owner='UNDETERMINED';
  }
  const summary=rows.reduce((r,x)=>{r[x.status]=(r[x.status]??0)+1;return r;},{});
  const differences=rows.filter(r=>r.status!=='MATCH'&&!isAllowedDifference(r));
  return { contractHash:global.hash, capturedAt:actual.capturedAt, status:differences.length?'FAIL':'PASS', counts:global.counts, summary, rows };
}
export async function verifyMain() {
  if(!process.env.DATABASE_URL) { console.log(JSON.stringify({status:'FAIL',reason:'DATABASE_URL_NOT_CONFIGURED'})); return 2; }
  let prisma;
  try {
    const global=parseGlobalSchema();
    prisma=new PrismaClient({datasourceUrl:process.env.DATABASE_URL,log:[]});
    const actual=await readCatalog(prisma); const report=compareCatalog(global,actual);
    if(process.env.GLOBAL_DB_REPORT_PATH) writeFileSync(process.env.GLOBAL_DB_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
    if(process.env.GLOBAL_DB_CATALOG_PATH) writeFileSync(process.env.GLOBAL_DB_CATALOG_PATH,JSON.stringify(actual,null,2)+'\n');
    const blockingRows=report.rows.filter(r=>r.status!=='MATCH'&&!isAllowedDifference(r));
    const classifications=report.rows.reduce((result,row)=>{
      if(row.classification) result[row.classification]=(result[row.classification]??0)+1;
      return result;
    },{});
    console.log(JSON.stringify({status:report.status,counts:report.counts,summary:report.summary,classifications,
      allowedExtras:report.rows.filter(isAllowedDifference).length,
      missing:blockingRows.filter(r=>r.status.includes('MISSING')).length,
      different:blockingRows.filter(r=>!r.status.includes('MISSING')).length}));
    return report.status==='PASS'?0:1;
  } catch { console.log(JSON.stringify({status:'FAIL',reason:'GLOBAL_DB_READ_FAILED',detail:'Revisar conectividad, permisos de lectura y hash del contrato; error original omitido para proteger credenciales.'})); return 2; }
  finally { if(prisma) await prisma.$disconnect(); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) process.exitCode=await verifyMain();
