import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGlobalSchema,splitSql,normalizeExpression,normalizeCheckExpression} from './global-schema.mjs';
import {classifyDifference,compareCatalog,isAllowedDifference,readCatalog} from './verify-global-db.mjs';
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
 assert.deepEqual(global.counts,{tables:91,columns:897,pk:91,fk:211,checks:33,indexes:109});
 const g3Request=global.tables.find(table=>table.name==='solicitud_instalacion_integracion');
 assert.equal(g3Request.owner,'G3');
 assert.deepEqual(g3Request.columns.map(({name,type,nullable,default:defaultValue})=>({name,type,nullable,default:defaultValue})),[
  {name:'id_solicitud',type:'integer',nullable:false,default:"nextval('solicitud_instalacion_integracion_id_solicitud_seq'::regclass)"},
  {name:'request_id',type:'varchar(100)',nullable:false,default:null},
  {name:'trace_id',type:'varchar(100)',nullable:false,default:null},
  {name:'hash_payload',type:'varchar(64)',nullable:false,default:null},
  {name:'id_empresa',type:'integer',nullable:false,default:null},
  {name:'id_prospecto_externo',type:'integer',nullable:false,default:null},
  {name:'id_contrato_externo',type:'integer',nullable:false,default:null},
  {name:'id_plan_externo',type:'integer',nullable:true,default:null},
  {name:'rut',type:'varchar(12)',nullable:false,default:null},
  {name:'nombre_completo',type:'varchar(120)',nullable:false,default:null},
  {name:'telefono',type:'varchar(21)',nullable:false,default:null},
  {name:'direccion_completa',type:'varchar(200)',nullable:false,default:null},
  {name:'comuna',type:'varchar(80)',nullable:false,default:null},
  {name:'ciudad',type:'varchar(80)',nullable:true,default:null},
  {name:'observaciones',type:'text',nullable:true,default:null},
  {name:'requisitos_equipamiento',type:'jsonb',nullable:true,default:null},
  {name:'id_ot',type:'integer',nullable:true,default:null},
  {name:'estado',type:'varchar(30)',nullable:false,default:null},
  {name:'fecha_creacion',type:'timestamptz',nullable:false,default:'CURRENT_TIMESTAMP'},
  {name:'fecha_actualizacion',type:'timestamptz',nullable:false,default:'CURRENT_TIMESTAMP'},
 ]);
 assert.equal(g3Request.checks.length,0);
 assert.deepEqual(g3Request.pk,['id_solicitud']);
 assert.deepEqual(global.indexes.filter(index=>index.table===g3Request.name).map(({name,unique,definition})=>({name,unique,definition})),[
  {name:'solicitud_instalacion_integracion_request_id_key',unique:true,definition:'(request_id)'},
  {name:'solicitud_instalacion_integracion_id_ot_key',unique:true,definition:'(id_ot)'},
  {name:'solicitud_instalacion_integracion_id_empresa_idx',unique:false,definition:'(id_empresa)'},
 ]);
 const g3RequestFk=global.fks.find(fk=>fk.table===g3Request.name);
 assert.deepEqual(
  {name:g3RequestFk.name,onDelete:g3RequestFk.onDelete,onUpdate:g3RequestFk.onUpdate},
  {name:'solicitud_instalacion_integracion_id_ot_fkey',onDelete:'SET NULL',onUpdate:'CASCADE'},
 );
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
test('_prisma_migrations es el unico extra tecnico permitido',()=>{
 const withPrisma=fixture();withPrisma.tables.push({name:'_prisma_migrations'});
 const allowed=compareCatalog(global,withPrisma);
 assert.equal(allowed.status,'PASS');
 assert.equal(allowed.rows.filter(isAllowedDifference).length,1);
 const unexpected=fixture();unexpected.tables.push({name:'unexpected_business_table'});
 assert.equal(compareCatalog(global,unexpected).status,'FAIL');
});
test('tabla G3 confirmada hace MATCH y extras sin dueno siguen bloqueando PASS',()=>{
 const actual=fixture();
 actual.tables.push({name:'_prisma_migrations'},{name:'solicitud_clave_wifi'});
 actual.columns.push(
  {table:'lista_negra',name:'nivel',type:'character varying',nullable:true,default:null},
  {table:'log_notificacion',name:'id_ot',type:'integer',nullable:true,default:null},
 );
 actual.constraints.push({table:'log_notificacion',name:'log_notificacion_id_ot_fkey',kind:'f',definition:'FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot)'});
 actual.indexes.push({table:'log_notificacion',name:'log_notificacion_estado_envio_fecha_envio_idx',definition:'CREATE INDEX log_notificacion_estado_envio_fecha_envio_idx ON log_notificacion (estado_envio, fecha_envio)',primary:false,unique:false,valid:true,ready:true});
 const result=compareCatalog(global,actual);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(
  result.rows.filter(row=>row.classification).reduce((counts,row)=>{
   counts[row.classification]=(counts[row.classification]??0)+1;return counts;
  },{}),
  {TECHNICAL_ALLOWED_EXTRA:1,UNOWNED_EXTRA:5},
 );
 assert.ok(result.rows.some(row=>row.table==='solicitud_instalacion_integracion'&&row.kind==='TABLE'&&row.status==='MATCH'&&row.owner==='G3'));
 assert.ok(result.rows.filter(row=>row.classification==='UNOWNED_EXTRA').every(row=>row.owner==='UNDETERMINED'));
 assert.equal(result.rows.filter(isAllowedDifference).length,1);
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
