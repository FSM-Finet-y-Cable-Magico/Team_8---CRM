import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGlobalSchema,splitSql,normalizeExpression,normalizeCheckExpression} from './global-schema.mjs';
import {compareCatalog,readCatalog} from './verify-global-db.mjs';
const global=parseGlobalSchema();
function fixture(){
 const actions={'NO ACTION':'a',CASCADE:'c',RESTRICT:'r','SET NULL':'n','SET DEFAULT':'d'};
 return {capturedAt:'synthetic-unit-fixture',tables:global.tables.map(t=>({name:t.name})),
 columns:global.tables.flatMap(t=>t.columns.map(c=>({...c,table:t.name,sequence:c.serial?'public.'+t.name+'_'+c.name+'_seq':null}))),
 constraints:[...global.tables.map(t=>({table:t.name,name:t.name+'_pkey',kind:'p',columns:t.pk})),
 ...global.tables.flatMap(t=>t.checks.map(c=>({...c,table:t.name,kind:'c',validated:true}))),
 ...global.fks.map(f=>({...f,kind:'f',validated:true,deferrable:false,referencedSchema:'public',deleteCode:actions[f.onDelete],updateCode:actions[f.onUpdate]}))],
 indexes:global.indexes.map(i=>({...i,definition:i.sql.replace(' IF NOT EXISTS','').replace(/;$/,''),primary:false,valid:true,ready:true})),
 sequences:global.tables.flatMap(t=>t.columns.filter(c=>c.serial).map(c=>({name:t.name+'_'+c.name+'_seq',type:c.type,increment:'1',cycle:false}))),migrations:[]};
}
test('canonical hash and all objects parsed, SQL expressions stay intact',()=>{
 assert.deepEqual(global.counts,{tables:90,columns:877,pk:90,fk:210,checks:33,indexes:106});
 assert.equal(splitSql("a numeric(12,2), b text DEFAULT 'x,y', CHECK(a IN (1,2))").length,3);
 assert.throws(()=>parseGlobalSchema(Buffer.from('changed')),/HASH_MISMATCH/);
 assert.notEqual(normalizeExpression('(a+b)*c'),normalizeExpression('a+b*c'));
});
test('normaliza solo diferencias seguras de CHECK y preserva precedencia booleana',()=>{
 assert.equal(
  normalizeCheckExpression("CHECK (((estado)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying])::text[])))"),
  normalizeCheckExpression("CHECK (estado::text = ANY (ARRAY['A'::character varying::text, 'B'::character varying::text]))"),
 );
 assert.equal(normalizeCheckExpression('CHECK ((monto > (0)::numeric))'),normalizeCheckExpression('CHECK (monto > 0::numeric)'));
 assert.notEqual(normalizeCheckExpression('CHECK ((a OR b) AND c)'),normalizeCheckExpression('CHECK (a OR b AND c)'));
 assert.notEqual(normalizeCheckExpression('CHECK ((a + b) * c > 0)'),normalizeCheckExpression('CHECK (a + (b * c) > 0)'));
 assert.notEqual(normalizeCheckExpression("CHECK (estado = 'A')"),normalizeCheckExpression("CHECK (estado = 'B')"));
});
test('las columnas de PK compuesta son no nulas aunque el SQL no repita NOT NULL',()=>{
 const sequence=global.tables.find(table=>table.name==='secuencia_srv');
 assert.equal(sequence.columns.find(column=>column.name==='id_empresa').nullable,false);
 assert.equal(sequence.columns.find(column=>column.name==='anio').nullable,false);
});
test('exact synthetic catalog passes; this is not Railway evidence',()=>{
 assert.equal(compareCatalog(global,fixture()).status,'PASS');
});
test('missing critical table fails, unrelated schemas cannot satisfy FK',()=>{
 const a=fixture();a.tables=a.tables.filter(t=>t.name!=='historial_cambio_plan');
 a.constraints.find(c=>c.kind==='f').referencedSchema='other';
 const r=compareCatalog(global,a);assert.equal(r.status,'FAIL');
 assert.ok(r.rows.some(x=>x.status==='MISSING_TABLE'&&x.table==='historial_cambio_plan'));
 assert.ok(r.rows.some(x=>x.status==='FK_MISMATCH'));
});
test('wrong nullable, FK action and invalid index all fail',()=>{
 const a=fixture();a.columns.find(c=>c.table==='usuario'&&c.name==='version_sesion').nullable=false;
 a.constraints.find(c=>c.kind==='f').deleteCode='d';a.indexes[0].valid=false;
 const r=compareCatalog(global,a);assert.equal(r.status,'FAIL');
 assert.ok(r.rows.some(x=>x.status==='NULLABILITY_DIFFERENCE'));assert.ok(r.rows.some(x=>x.status==='FK_MISMATCH'));assert.ok(r.rows.some(x=>x.status==='INDEX_MISMATCH'));
});
test('readCatalog starts READ ONLY and only reads catalogs',async()=>{
 const commands=[],tx={$executeRawUnsafe:async sql=>commands.push(sql),$queryRawUnsafe:async sql=>{commands.push(sql);return [];}};
 await readCatalog({$transaction:async fn=>fn(tx)});
 assert.equal(commands[0],'SET TRANSACTION READ ONLY');
 for(const sql of commands.slice(2))assert.match(sql,/^SELECT/);
 assert.ok(commands.every(sql=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)/i.test(sql)));
});
