// Reproducible SQL package for owner review. This command never connects to a DB.
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const names=['20261003010000_i3_tax_emission_intents','20261003020000_i3_tax_payment_pipeline','20261004010000_i3_tax_smtp_delivery',
  '20261004020000_i3_whatsapp_notifications','20261004030000_i3_mail_simulated_delivery'];
const migrations=names.map(name=>{
  const file=`backend/prisma/migrations/${name}/migration.sql`;
  const sql=readFileSync(file,'utf8').replaceAll('\r\n','\n');
  return {name,file,sql,sha256LF:createHash('sha256').update(sql).digest('hex')};
});
mkdirSync('docs/proposals',{recursive:true});
writeFileSync('docs/proposals/i3-schema-additions.sql','-- PROPOSAL ONLY. Requires reviewed G2/global baseline; not an idempotent bootstrap.\n-- Do not execute against a shared database without coordinated migration review.\n\n'+migrations.map(m=>`-- ${m.name}; SHA256-LF ${m.sha256LF}\n${m.sql}`).join('\n'));
writeFileSync('docs/proposals/i3-schema-manifest.json',JSON.stringify({applied:false,requiresOwnerReview:true,
  baseline:'db/global/init-global.sql plus reconciled Prisma/G2 migration history',migrations:migrations.map(({sql,...entry})=>entry)},null,2)+'\n');
console.log(JSON.stringify({proposal:true,applied:false,migrations:migrations.length}));
