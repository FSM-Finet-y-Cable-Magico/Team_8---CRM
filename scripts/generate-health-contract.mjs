import {writeFileSync} from 'node:fs';
import {parseGlobalSchema} from './global-schema.mjs';
const contract=parseGlobalSchema();
writeFileSync('backend/src/health/global-columns.generated.ts','// Generated from init-global.sql SHA256 '+contract.hash+'; no seeds or credentials.\nexport const GLOBAL_COLUMNS = '+JSON.stringify(contract.tables.flatMap(t=>t.columns.map(c=>({table:t.name,name:c.name,type:c.type,nullable:c.nullable}))),null,2)+';\n');
