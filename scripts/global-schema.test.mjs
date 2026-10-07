import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGlobalSchema,splitSql,normalizeExpression,normalizeCheckExpression,normalizeIndexDefinition} from './global-schema.mjs';
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
const postgres18Checks = [
 {table:'tax_emission_intent',name:'tax_intent_environment_check',observed:"CHECK (ambiente::text = ANY (ARRAY['sandbox'::character varying, 'production'::character varying]::text[]))"},
 {table:'tax_emission_intent',name:'tax_intent_type_check',observed:'CHECK (tipo_dte = ANY (ARRAY[33, 34, 39, 41]))'},
 {table:'tax_emission_intent',name:'tax_intent_format_check',observed:'CHECK ((tipo_dte = ANY (ARRAY[33,34])) AND formato = 2 OR (tipo_dte = ANY (ARRAY[39,41])) AND formato = 1)'},
 {table:'tax_emission_intent',name:'tax_intent_expected_folio_check',observed:"CHECK (folio_esperado::text ~ '^[1-9][0-9]{0,9}$'::text OR folio_esperado::text = '0'::text AND (tipo_dte = ANY (ARRAY[39, 41])))"},
 {table:'tax_emission_intent',name:'tax_intent_state_check',observed:"CHECK (estado::text = ANY (ARRAY['PENDIENTE'::character varying, 'EN_PROCESO'::character varying, 'GENERADO'::character varying, 'FALLIDO'::character varying, 'RESULTADO_INDETERMINADO'::character varying]::text[]))"},
 {table:'tax_emission_intent',name:'tax_intent_generated_check',observed:"CHECK (estado::text <> 'GENERADO'::text OR folio IS NOT NULL AND folio::text ~ '^[1-9][0-9]{0,9}$'::text AND (folio::text = folio_esperado::text OR folio_esperado::text = '0'::text AND (tipo_dte = ANY (ARRAY[39, 41]))))"},
 {table:'tax_emission_intent',name:'tax_intent_artifact_check',observed:"CHECK (artefacto_estado::text = ANY (ARRAY['PENDIENTE'::character varying, 'DISPONIBLE'::character varying, 'FALLIDO'::character varying]::text[]))"},
 {table:'tax_emission_intent',name:'tax_intent_email_check',observed:"CHECK (email_estado::text = ANY (ARRAY['PENDIENTE'::character varying, 'NO_CONFIGURADO'::character varying, 'SIN_DESTINATARIO'::character varying, 'EN_PROCESO'::character varying, 'ENVIADO'::character varying, 'RESULTADO_INDETERMINADO'::character varying, 'REINTENTO_PENDIENTE'::character varying, 'FALLIDO'::character varying, 'SIMULADO'::character varying]::text[]))"},
 {table:'tax_payment_job',name:'tax_payment_job_monto_check',observed:'CHECK (monto > 0::numeric)'},
 {table:'tax_payment_job',name:'tax_payment_job_tipo_dte_check',observed:'CHECK (tipo_dte = ANY (ARRAY[33, 34, 39, 41]))'},
 {table:'tax_payment_job',name:'tax_payment_job_formato_check',observed:'CHECK (formato = ANY (ARRAY[1, 2]))'},
 {table:'tax_payment_job',name:'tax_payment_job_estado_check',observed:"CHECK (estado::text = ANY (ARRAY['PENDIENTE'::character varying, 'DATOS_REQUERIDOS'::character varying, 'PROCESADO'::character varying]::text[]))"},
 {table:'tax_payment_job',name:'tax_job_document_format_check',observed:'CHECK ((tipo_dte = ANY (ARRAY[33,34])) AND formato = 2 OR (tipo_dte = ANY (ARRAY[39,41])) AND formato = 1)'},
 {table:'tax_payment_job',name:'tax_job_folio_check',observed:"CHECK (folio_esperado::text ~ '^[1-9][0-9]{0,9}$'::text OR folio_esperado::text = '0'::text AND (tipo_dte = ANY (ARRAY[39, 41])))"},
];
const postgres18PartialIndexes = [
 {table:'tax_emission_intent',name:'tax_intent_generated_folio_key',observed:"CREATE UNIQUE INDEX tax_intent_generated_folio_key ON public.tax_emission_intent USING btree (id_empresa, ambiente, tipo_dte, folio) WHERE ((estado)::text = 'GENERADO'::text)"},
 {table:'tax_payment_job',name:'tax_job_reserved_folio_key',observed:"CREATE UNIQUE INDEX tax_job_reserved_folio_key ON public.tax_payment_job USING btree (id_empresa, tipo_dte, folio_esperado) WHERE ((folio_esperado)::text <> '0'::text)"},
 {table:'tax_emission_intent',name:'tax_intent_email_pending_idx',observed:"CREATE INDEX tax_intent_email_pending_idx ON public.tax_emission_intent USING btree (id_empresa, email_estado, fecha_proximo_email) WHERE ((estado)::text = 'GENERADO'::text)"},
];
test('canonical hash and all objects parsed, SQL expressions stay intact',()=>{
 assert.deepEqual(global.counts,{tables:94,columns:965,pk:94,fk:221,checks:58,indexes:124});
 const taxIntent=global.tables.find(table=>table.name==='tax_emission_intent');
 assert.ok(taxIntent);
 assert.equal(taxIntent.columns.length,28);
 assert.equal(taxIntent.checks.length,13);
 assert.equal(taxIntent.checks.filter(check=>check.name==='tax_intent_email_check').length,1);
 assert.match(taxIntent.checks.find(check=>check.name==='tax_intent_email_check').definition,/SIMULADO/);
 const taxJob=global.tables.find(table=>table.name==='tax_payment_job');
 assert.ok(taxJob);
 assert.equal(taxJob.columns.length,18);
 assert.equal(taxJob.checks.length,9);
 assert.equal(global.fks.some(fk=>fk.table==='tax_payment_job'&&fk.columns.includes('id_cliente')),false);
 assert.ok(global.indexes.some(index=>index.name==='tax_job_reserved_folio_key'&&index.unique&&/WHERE folio_esperado <> '0'/.test(index.definition)));
 const notification=global.tables.find(table=>table.name==='log_notificacion');
 assert.equal(notification.columns.length,17);
 assert.equal(notification.columns.find(column=>column.name==='estado_envio').type,'varchar(30)');
 assert.ok(notification.checks.some(check=>check.name==='log_notificacion_intentos_check'));
 assert.ok(global.fks.some(fk=>fk.name==='log_notificacion_id_empresa_fkey'&&fk.onDelete==='RESTRICT'&&fk.onUpdate==='CASCADE'));
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
 assert.equal(normalizeCheckExpression('CHECK (tipo_dte IN (33,34,39,41))'),normalizeCheckExpression('CHECK (tipo_dte = ANY (ARRAY[33,34,39,41]))'));
 assert.equal(normalizeCheckExpression('CHECK ((monto > (0)::numeric))'),normalizeCheckExpression('CHECK (monto > 0::numeric)'));
 assert.equal(
  normalizeCheckExpression("CHECK (latitud >= ('-90'::integer)::double precision AND latitud <= (90)::double precision)"),
  normalizeCheckExpression("CHECK (latitud >= '-90'::integer::double precision AND latitud <= 90::double precision)"),
 );
 assert.notEqual(normalizeCheckExpression('CHECK (valor IN (1,2))'),normalizeCheckExpression('CHECK (valor IN (1,3))'));
 assert.notEqual(normalizeCheckExpression("CHECK (estado = 'GENERADO')"),normalizeCheckExpression("CHECK (estado = 'FALLIDO')"));
 assert.notEqual(normalizeCheckExpression('CHECK (monto > 0)'),normalizeCheckExpression('CHECK (monto >= 0)'));
 assert.notEqual(normalizeCheckExpression('CHECK ((a OR b) AND c)'),normalizeCheckExpression('CHECK (a OR (b AND c))'));
 assert.notEqual(normalizeCheckExpression('CHECK ((a + b) * c > 0)'),normalizeCheckExpression('CHECK (a + (b * c) > 0)'));
 assert.notEqual(
  normalizeCheckExpression("CHECK (id_empresa::text = '1')",{textColumns:new Set()}),
  normalizeCheckExpression("CHECK (id_empresa = '1')",{textColumns:new Set()}),
 );
 assert.notEqual(normalizeCheckExpression("CHECK (lower(estado)::text = 'a')"),normalizeCheckExpression("CHECK (lower(estado) = 'a')"));
 assert.notEqual(normalizeCheckExpression("CHECK (codigo::integer::text = '1')"),normalizeCheckExpression("CHECK (codigo::integer = '1')"));
 assert.notEqual(normalizeCheckExpression("CHECK (estado = 'A')"),normalizeCheckExpression("CHECK (estado = 'B')"));
});
test('las 14 representaciones CHECK reales de PostgreSQL 18 hacen MATCH',()=>{
 assert.equal(postgres18Checks.length,14);
 const actual=fixture();
 for(const sample of postgres18Checks){
  const constraint=actual.constraints.find(item=>item.table===sample.table&&item.name===sample.name&&item.kind==='c');
  assert.ok(constraint,`${sample.table}.${sample.name}`);
  constraint.definition=sample.observed;
 }
 const result=compareCatalog(global,actual);
 for(const sample of postgres18Checks){
  const row=result.rows.find(item=>item.kind==='CHECK'&&item.table===sample.table&&item.name===sample.name);
  assert.equal(row?.status,'MATCH',`${sample.table}.${sample.name}`);
 }
 assert.equal(result.status,'PASS');
});
test('los tres índices parciales PostgreSQL 18 separan clave y predicado seguro',()=>{
 assert.equal(postgres18PartialIndexes.length,3);
 const actual=fixture();
 for(const sample of postgres18PartialIndexes){
  const index=actual.indexes.find(item=>item.table===sample.table&&item.name===sample.name);
  assert.ok(index,`${sample.table}.${sample.name}`);
  index.definition=sample.observed;
 }
 const result=compareCatalog(global,actual);
 for(const sample of postgres18PartialIndexes){
  const row=result.rows.find(item=>item.kind==='INDEX'&&item.table===sample.table&&item.name===sample.name);
  assert.equal(row?.status,'MATCH',`${sample.table}.${sample.name}`);
 }
 assert.notDeepEqual(
  normalizeIndexDefinition("(id_empresa, estado) WHERE estado = 'GENERADO'"),
  normalizeIndexDefinition("(id_empresa, estado) WHERE estado = 'FALLIDO'"),
 );
 assert.notDeepEqual(
  normalizeIndexDefinition("(id_empresa, estado) WHERE estado = 'GENERADO'"),
  normalizeIndexDefinition("(estado, id_empresa) WHERE estado = 'GENERADO'"),
 );
 const drift=fixture();
 drift.indexes.find(item=>item.name==='tax_intent_generated_folio_key').definition=
  "CREATE UNIQUE INDEX tax_intent_generated_folio_key ON public.tax_emission_intent USING btree (id_empresa, ambiente, tipo_dte, folio) WHERE ((estado)::text = 'FALLIDO'::text)";
 assert.ok(compareCatalog(global,drift).rows.some(row=>row.name==='tax_intent_generated_folio_key'&&row.status==='INDEX_MISMATCH'));
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
test('exactamente los cinco extras legacy preservados son permitidos y un sexto extra bloquea PASS',()=>{
 const actual=fixture();
 actual.tables.push({name:'_prisma_migrations'},{name:'solicitud_clave_wifi'});
 actual.columns.push(
  {table:'lista_negra',name:'nivel',type:'character varying',nullable:true,default:null},
  {table:'log_notificacion',name:'id_ot',type:'integer',nullable:true,default:null},
 );
 actual.constraints.push({table:'log_notificacion',name:'log_notificacion_id_ot_fkey',kind:'f',definition:'FOREIGN KEY (id_ot) REFERENCES orden_trabajo(id_ot)'});
 actual.indexes.push({table:'log_notificacion',name:'log_notificacion_estado_envio_fecha_envio_idx',definition:'CREATE INDEX log_notificacion_estado_envio_fecha_envio_idx ON log_notificacion (estado_envio, fecha_envio)',primary:false,unique:false,valid:true,ready:true});
 const result=compareCatalog(global,actual);
 assert.equal(result.status,'PASS');
 assert.deepEqual(
  result.rows.filter(row=>row.classification).reduce((counts,row)=>{
   counts[row.classification]=(counts[row.classification]??0)+1;return counts;
  },{}),
  {TECHNICAL_ALLOWED_EXTRA:1,PRESERVED_LEGACY_EXTRA:5},
 );
 assert.ok(result.rows.some(row=>row.table==='solicitud_instalacion_integracion'&&row.kind==='TABLE'&&row.status==='MATCH'&&row.owner==='G3'));
 assert.ok(result.rows.filter(row=>row.classification==='PRESERVED_LEGACY_EXTRA').every(row=>row.owner==='LEGACY_PRESERVED'));
 assert.equal(result.rows.filter(isAllowedDifference).length,6);

 actual.tables.push({name:'unexpected_sixth_extra'});
 const withUnknown=compareCatalog(global,actual);
 assert.equal(withUnknown.status,'FAIL');
 assert.ok(withUnknown.rows.some(row=>row.table==='unexpected_sixth_extra'&&row.classification==='UNOWNED_EXTRA'&&!isAllowedDifference(row)));
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
