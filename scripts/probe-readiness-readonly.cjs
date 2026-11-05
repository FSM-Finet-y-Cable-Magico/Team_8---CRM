const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { HealthController } = require('../backend/dist/health/health.controller.js');
const { writeFileSync } = require('node:fs');
(async () => {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: [] });
  try {
    const result = await new HealthController(prisma, new ConfigService()).ready();
    const report = { category: 'RAILWAY_READ_TEST', executedAt: new Date().toISOString(),
      mode: 'Controller compiled locally, direct invocation; no AppModule, no scheduler, no deployed HTTP endpoint',
      configurationScope: 'Provided process environment; does not inspect Railway service flags', result };
    writeFileSync('docs/i3-readiness-railway-read-test.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch { console.log(JSON.stringify({category:'RAILWAY_READ_TEST',status:'FAIL',reason:'READINESS_READ_FAILED'}));process.exitCode=1; }
  finally { await prisma.$disconnect(); }
})();
