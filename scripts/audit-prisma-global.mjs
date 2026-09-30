import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseGlobalSchema, normalizeType, ownerOf } from './global-schema.mjs';

const scalar = new Set(['String','Int','BigInt','Decimal','Boolean','DateTime','Json','Float','Bytes']);
export function parsePrisma(text) {
  return [...text.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map(m=>{
    const model={name:m[1], table:/@@map\("([^"]+)"\)/.exec(m[2])?.[1]??m[1], block:m[0], fields:[], relations:[], indexes:[], pk:[]};
    for(const line of m[2].split(/\r?\n/)) {
      const f=/^\s+(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/.exec(line);
      if(!f) continue;
      const field={name:f[1],base:f[2],suffix:f[3]??'',attrs:f[4],line,column:/@map\("([^"]+)"\)/.exec(f[4])?.[1]??f[1]};
      if(scalar.has(field.base)) model.fields.push(field); else if(/@relation\(/.test(field.attrs)) model.relations.push(field);
    }
    const map=name=>model.fields.find(f=>f.name===name.trim())?.column??name.trim();
    const id=model.fields.find(f=>/@id\b/.test(f.attrs));
    const compound=/@@id\(\[([^\]]+)\]/.exec(m[2]);
    model.pk=id?[id.column]:compound?compound[1].split(',').map(map):[];
    for(const f of model.fields.filter(f=>/@unique\b/.test(f.attrs))) model.indexes.push({columns:[f.column],unique:true});
    for(const idx of m[2].matchAll(/@@(index|unique)\(\[([^\]]+)\]/g)) model.indexes.push({columns:idx[2].split(',').map(map),unique:idx[1]==='unique'});
    return model;
  });
}
export function prismaType(f){
  const native=/@db\.(\w+)(?:\(([^)]+)\))?/.exec(f.attrs);
  let type;
  if(native){const name={VarChar:'varchar',Char:'char',Decimal:'numeric',Timestamp:'timestamp',Timestamptz:'timestamptz',Date:'date',Inet:'inet',Text:'text',JsonB:'jsonb',SmallInt:'smallint',Integer:'integer',BigInt:'bigint',DoublePrecision:'double precision'}[native[1]]??native[1].toLowerCase();type=name+(native[2]?`(${native[2].replace(/\s/g,'')})`:'');}
  else type={String:'text',Int:'integer',BigInt:'bigint',Boolean:'boolean',Decimal:'numeric(65,30)',DateTime:'timestamp(3)',Json:'jsonb',Float:'double precision',Bytes:'bytea'}[f.base];
  return normalizeType(type+(f.suffix==='[]'?'[]':''));
}
function nativeFor(type) {
  if (type === 'double precision') return ' @db.DoublePrecision';
  const m=/^(\w+)(?:\(([^)]+)\))?(\[\])?$/.exec(type); if(!m) throw new Error('UNSUPPORTED_GLOBAL_TYPE');
  const names={varchar:'VarChar',char:'Char',numeric:'Decimal',timestamp:'Timestamp',timestamptz:'Timestamptz',date:'Date',inet:'Inet',smallint:'SmallInt',uuid:'Uuid'};
  if(names[m[1]]) return ` @db.${names[m[1]]}${m[2]?`(${m[2]})`:['timestamp','timestamptz'].includes(m[1])?'(6)':''}`;
  if(['text','integer','bigint','boolean','jsonb','bytea'].includes(m[1])) return '';
  throw new Error('UNSUPPORTED_GLOBAL_TYPE');
}
function relParts(f,model,models){
  const target=models.find(m=>m.name===f.base);
  const cols=/fields:\s*\[([^\]]+)\]/.exec(f.attrs)?.[1].split(',').map(s=>model.fields.find(x=>x.name===s.trim())?.column);
  const refs=/references:\s*\[([^\]]+)\]/.exec(f.attrs)?.[1].split(',').map(s=>target?.fields.find(x=>x.name===s.trim())?.column);
  return {target,cols,refs};
}
export function auditPrisma(text,global){
  const models=parsePrisma(text), rows=[];const add=(table,column,status,prisma,expected)=>rows.push({table,column,owner:ownerOf(table),status,prisma,global:expected});
  for(const model of models){
    const table=global.tables.find(t=>t.name===model.table);
    for(const f of model.fields){
      const col=table?.columns.find(c=>c.name===f.column);
      const p={type:prismaType(f),nullable:f.suffix==='?'};
      if(!col){add(model.table,f.column,'PRISMA_ONLY',p,null);continue;}
      const statuses=[];if(p.type!==col.type)statuses.push('TYPE_WIDENING_REQUIRED');if(p.nullable!==col.nullable)statuses.push('NULLABILITY_MISMATCH');
      add(model.table,f.column,statuses.length?statuses.join(','):'MATCH',p,{type:col.type,nullable:col.nullable});
    }
    add(model.table,'PRIMARY KEY',JSON.stringify(model.pk)===JSON.stringify(table?.pk)?'MATCH':'INDEX_MISMATCH',model.pk,table?.pk);
    for(const f of model.relations){
      const {target,cols,refs}=relParts(f,model,models);if(!cols)continue;
      const fk=global.fks.find(k=>k.table===model.table&&k.referencedTable===target?.table&&JSON.stringify(k.columns)===JSON.stringify(cols)&&JSON.stringify(k.referencedColumns)===JSON.stringify(refs));
      const action=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase();
      const p={onDelete:action(/onDelete:\s*(\w+)/.exec(f.attrs)?.[1]??(f.suffix==='?'?'SetNull':'Restrict')),onUpdate:action(/onUpdate:\s*(\w+)/.exec(f.attrs)?.[1]??'Cascade')};
      add(model.table,`FK:${f.name}`,fk&&p.onDelete===fk.onDelete&&p.onUpdate===fk.onUpdate?'MATCH':'FK_MISMATCH',p,fk?{onDelete:fk.onDelete,onUpdate:fk.onUpdate}:null);
    }
    for(const i of model.indexes){ const signature=`(${i.columns.join(',')})`; const exists=global.indexes.some(x=>x.table===model.table&&x.unique===i.unique&&x.definition.replace(/\s/g,'')===signature);
      add(model.table,`INDEX:${i.columns.join(',')}`,exists?'MATCH':'INDEX_MISMATCH',i,null);
    }
  }
  for(const t of global.tables){const model=models.find(m=>m.table===t.name);for(const c of t.columns)if(!model?.fields.some(f=>f.column===c.name))add(t.name,c.name,model?'COLUMN_GLOBAL_ONLY':'OWNER_EXTERNAL',null,{type:c.type,nullable:c.nullable});}
  for(const i of global.indexes){const m=models.find(x=>x.table===i.table);if(!m?.indexes.some(x=>x.unique===i.unique&&i.definition.replace(/\s/g,'')===`(${x.columns.join(',')})`))add(i.table,`INDEX:${i.name}`,'INDEX_MISMATCH',null,i.definition);}
  for(const fk of global.fks) {
    const model=models.find(m=>m.table===fk.table);
    const modeled=model?.relations.some(f=>{
      const {target,cols,refs}=relParts(f,model,models);
      return target?.table===fk.referencedTable&&JSON.stringify(cols)===JSON.stringify(fk.columns)&&JSON.stringify(refs)===JSON.stringify(fk.referencedColumns);
    });
    if(!modeled)add(fk.table,'FK:'+fk.name,model?'FK_MISMATCH':'OWNER_EXTERNAL',null,{columns:fk.columns,referencedTable:fk.referencedTable,referencedColumns:fk.referencedColumns,onDelete:fk.onDelete,onUpdate:fk.onUpdate});
  }
  const summary=rows.reduce((r,x)=>{r[x.status]=(r[x.status]??0)+1;return r;},{});
  return {contractHash:global.hash,modeledTables:models.length,summary,rows};
}
export function alignPrisma(text,global){
  const models=parsePrisma(text);
  for(const model of models){let block=model.block;const table=global.tables.find(t=>t.name===model.table);if(!table)continue;
    for(const f of model.fields){const col=table.columns.find(c=>c.name===f.column);if(!col)continue;
      if(col.nullable&&f.suffix==='[]')continue; // Prisma cannot express nullable scalar lists: documented, never ALTER global.
      const attrs=f.attrs.replace(/\s*@db\.\w+(?:\([^)]*\))?/g,'');
      const base=col.type==='bigint'?'BigInt':f.base;
      const suffix=f.suffix==='[]'?'[]':col.nullable?'?':'';
      block=block.replace(f.line,`  ${f.name} ${base}${suffix} ${attrs}${nativeFor(col.type)}`.trimEnd());
    }
    for(const f of model.relations){const {target,cols,refs}=relParts(f,model,models);if(!cols)continue;
      const fk=global.fks.find(k=>k.table===model.table&&k.referencedTable===target?.table&&JSON.stringify(k.columns)===JSON.stringify(cols)&&JSON.stringify(k.referencedColumns)===JSON.stringify(refs));
      if(!fk)continue;const action=s=>s.toLowerCase().replace(/(?:^| )\w/g,c=>c.trim().toUpperCase());
      const attrs=f.attrs.replace(/,?\s*on(?:Delete|Update):\s*\w+/g,'').replace(/(@relation\([^\n]*)(\))/,`$1, onDelete: ${action(fk.onDelete)}, onUpdate: ${action(fk.onUpdate)}$2`);
      block=block.replace(f.line,`  ${f.name} ${f.base}${f.suffix} ${attrs}`);
    }
    text=text.replace(model.block,block);
  }return text;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file='backend/prisma/schema.prisma',global=parseGlobalSchema(),beforeText=readFileSync(file,'utf8');
  const before=auditPrisma(beforeText,global);
  if(process.argv.includes('--align')) {writeFileSync('docs/i3-prisma-vs-global-before.json',JSON.stringify(before,null,2)+'\n');writeFileSync(file,alignPrisma(beforeText,global));}
  const report=auditPrisma(readFileSync(file,'utf8'),global);writeFileSync('docs/i3-prisma-vs-global-schema.json',JSON.stringify(report,null,2)+'\n');
  const cell=x=>JSON.stringify(x??null).replaceAll('|','\\|');
  writeFileSync('docs/i3-prisma-vs-global-schema.md',`# Proyección Prisma G8 frente al contrato global\n\nHash canónico: ${global.hash}. Modelos G8: ${report.modeledTables}.\n\nPrisma es una proyección; los objetos globales no modelados se conservan. OWNER_EXTERNAL significa fuera de la proyección; ownership funcional se indica por separado. FK_MISMATCH con Prisma null significa relación física fuera de la proyección (se conserva en PostgreSQL). INDEX_MISMATCH con Prisma null significa índice global no modelado (incluye parciales/expresiones); conservarlo, jamás usar db push para quitarlo. El contrato vigente ya incluye integracion_activacion_g1.payload_snapshot nullable y elimina la unicidad inválida prospecto_id_cliente_key. Los default y checks SQL se validan en el verificador físico, no se infieren de @default de aplicación.\n\nAntes: ver i3-prisma-vs-global-before.json como evidencia histórica del contrato anterior. Después: ${cell(report.summary)}.\n\n|Tabla|Objeto|Owner|Estado|Prisma|Global|\n|---|---|---|---|---|---|\n`+report.rows.map(r=>`|${r.table}|${r.column}|${r.owner}|${r.status}|${cell(r.prisma)}|${cell(r.global)}|`).join('\n')+'\n');
  console.log(JSON.stringify({modeledTables:report.modeledTables,summary:report.summary}));
}
