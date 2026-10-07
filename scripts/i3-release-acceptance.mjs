// Local QA only. Operational credentials and opt-in database tests are excluded.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendRequire = createRequire(resolve(root, 'backend/package.json'));

export function isolatedQaEnv(parent = process.env) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (typeof parent[key] === 'string') env[key] = parent[key];
  }
  return Object.assign(env, {
    NODE_ENV: 'test', CI: 'true',
    DATABASE_URL: 'postgresql://qa:synthetic@127.0.0.1:1/qa_unavailable',
    JWT_SECRET: 'synthetic-qa-only-never-use-in-production-2026',
    CRM_INTEGRATION_TESTS: '0', RUN_DB_INTEGRATION: '0',
    RUN_POSTGRES_INTEGRATION_TESTS: 'false',
    G1_INTEGRATION_ENABLED: 'false', G3_INTEGRATION_ENABLED: 'false',
    G8_INTEGRATION_API_KEYS: '[]',
    FACTURACION_CL_INTEGRATION_ENABLED: 'false',
    FACTURACION_CL_PRODUCTION_ENABLED: 'false',
    FACTURACION_CL_DELIVERY_ENABLED: 'false',
    FACTURACION_CL_COMPANIES: '[]', FACTURACION_CL_PROFILES: '[]',
    WHATSAPP_PROVIDER: 'disabled', WHATSAPP_COMPANIES: '[]',
    BILLING_NOTIFICATION_MODE: 'disabled',
    // No MAIL_PROVIDER/SMTP variables: protocol tests configure loopback servers.
  });
}

const groups = {
  AUTH_ROLES: ['common/guards/jwt-auth.guard.spec.ts', 'common/roles.spec.ts'],
  MULTI_COMPANY: ['integration-auth/integration-api-key.guard.spec.ts', 'g2-integration/g2-integration.service.spec.ts'],
  CUSTOMERS: ['customers/customers.service.spec.ts'],
  PROSPECTS: ['prospects/prospects.service.spec.ts'],
  CONTRACTS: ['contracts/contracts.service.spec.ts'],
  SERVICES: ['services/services.service.spec.ts'],
  BILLING: ['billing/billing.service.spec.ts', 'billing/billing-read.service.spec.ts', 'billing/invoice-balance.spec.ts'],
  G1: ['g1-integration/http-g1-inventory.client.spec.ts', 'g1-integration/g1-activation.service.spec.ts'],
  G2: ['g2-integration/g2-integration.service.spec.ts', 'integration-auth/integration-api-key.guard.spec.ts'],
  G3: ['g3-integration/installation-integration.service.spec.ts', 'g3-integration/g3-closure.processor.spec.ts', 'g3-integration/g3-integration.controller.spec.ts'],
  DTE: ['tax-document-issuance/facturacion-cl.issuer.spec.ts', 'tax-document-issuance/tax-emission-intent.service.spec.ts', 'tax-document-issuance/tax-recovery.spec.ts'],
  META: ['messaging/messaging.spec.ts', 'messaging/meta-webhook.http.spec.ts'],
  SMTP: ['mail/mail.service.spec.ts'],
};

export function localAcceptance({ runLocal = false } = {}) {
  const env = isolatedQaEnv();
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root}`, ...args],
    { cwd: root, env, encoding: 'utf8', windowsHide: true });
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  // Check filenames before reading any tracked content, including fingerprints.
  const environmentExamples = new Set(['.env.example', '.env.railway.example', 'backend/.env.example']);
  const autoEnvFiles = ['', 'backend', 'frontend'].flatMap(directory =>
    ['.env', '.env.local', '.env.test', '.env.test.local'].map(file => join(directory, file)));
  const privateEnvPresent = tracked.some(file => /(^|\/)\.env(?:\.|$)/i.test(file)
    && !environmentExamples.has(file)) || autoEnvFiles.some(file => existsSync(resolve(root, file)));
  const fingerprint = createHash('sha256');
  if (!privateEnvPresent) for (const file of tracked) {
    if (!existsSync(resolve(root, file))) continue;
    fingerprint.update(file).update('\0').update(readFileSync(resolve(root, file))).update('\0');
  }
  const report = {
    checkedAt: new Date().toISOString(),
    baseSHA: git('rev-parse', 'HEAD').trim(),
    branch: git('branch', '--show-current').trim(),
    workingTreeDirty: git('status', '--porcelain').trim().length > 0,
    trackedWorkingTreeSHA256: privateEnvPresent ? null : fingerprint.digest('hex'),
    runLocal, DATABASE_USED: false, RAILWAY_USED: false,
    EXTERNAL_PROVIDER_CALLS: 0, checks: [], suites: [], cases: [],
    QA_LOCAL_READY: false, RELEASE_READY: false,
  };
  const add = (id, environment, precondition, expected, actual, status, evidence = []) =>
    report.cases.push({ CASE_ID: id, ENVIRONMENT: environment, PRECONDITION: precondition,
      REQUEST_SANITIZED: 'Synthetic fixtures and loopback transports only',
      EXPECTED: expected, ACTUAL: actual, STATUS: status, EVIDENCE: evidence });

  // Refuse private dotenv files; do not inspect or display their contents.
  if (runLocal && privateEnvPresent) {
    add('QA_ENVIRONMENT', 'LOCAL', 'No auto-loaded private env files',
      'Isolated synthetic environment', 'QA_PRIVATE_ENV_PRESENT; tests not started', 'FAIL');
  } else if (runLocal) {
    const temporary = mkdtempSync(join(tmpdir(), 'finet-qa-'));
    try {
      const execute = (name, args, cwd = root) => {
        const result = spawnSync(process.execPath, args,
          { cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
            timeout: 300000, windowsHide: true });
        report.checks.push({ name, exitCode: result.status,
          errorCode: result.error?.code ?? null,
          outputSHA256: createHash('sha256').update((result.stdout ?? '') + (result.stderr ?? '')).digest('hex') });
        return result;
      };
      const jestFile = join(temporary, 'jest.json');
      const jest = execute('CORE_BACKEND_TESTS',
        [backendRequire.resolve('jest/bin/jest'), '--runInBand', '--silent',
          '--json', `--outputFile=${jestFile}`], resolve(root, 'backend'));
      let data;
      try { data = JSON.parse(readFileSync(jestFile, 'utf8')); } catch {}
      report.suites = (data?.testResults ?? []).map(suite => ({
        file: relative(resolve(root, 'backend/src'), suite.name).replaceAll('\\', '/'),
        status: suite.status,
        passed: suite.assertionResults.filter(t => t.status === 'passed').length,
        failed: suite.assertionResults.filter(t => t.status === 'failed').length,
        skipped: suite.assertionResults.filter(t => ['pending', 'todo', 'skipped'].includes(t.status)).length,
      }));
      const backendPassed = jest.status === 0 && data?.numPassedTests > 0
        && data?.numFailedTests === 0 && data?.success === true;
      add('CORE_BACKEND_TESTS', 'UNIT/CONTRACT', 'DB integration disabled',
        'Backend suite passes; opt-in DB cases remain skipped',
        { passed: data?.numPassedTests ?? 0, failed: data?.numFailedTests ?? 0,
          skipped: data?.numPendingTests ?? 0,
          suitesPassed: data?.numPassedTestSuites ?? 0,
          suitesSkipped: data?.numPendingTestSuites ?? 0 },
        backendPassed ? 'PASS_LOCAL' : 'FAIL', ['backend/src/**/*.spec.ts']);
      for (const [id, files] of Object.entries(groups)) {
        const suites = files.map(file => report.suites.find(s => s.file === file));
        const passed = backendPassed && suites.every(s => s?.status === 'passed'
          && s.passed > 0 && s.failed === 0 && s.skipped === 0);
        add(id + '_LOCAL', 'UNIT/CONTRACT', 'Synthetic fixtures; no real delivery',
          'All mapped assertions pass', suites, passed ? 'PASS_CONTRACT' : 'FAIL', files);
      }
      for (const [id, files] of [
        ['GLOBAL_SCHEMA_TOOLS', ['scripts/global-schema.test.mjs', 'scripts/g1-smoke.test.mjs',
          'scripts/validate-production-env.test.mjs', 'scripts/smoke-billing-write.test.mjs']],
        ['REPOSITORY_HYGIENE', ['scripts/repository-hygiene.test.mjs']],
        ['FRONTEND_RUNTIME_STATIC', ['frontend/runtime-config.test.mjs']],
        ['FRONTEND_MODEL', ['frontend/tests/control-book-model.test.mjs']],
        ['DTE_PROTOTYPE', ['tools/facturacion-cl-sandbox/prototype.test.mjs',
          'tools/facturacion-cl-sandbox/verify-test-api.test.mjs']],
      ]) {
        const result = execute(id, ['--test', ...files]);
        const output = (result.stdout ?? '') + (result.stderr ?? '');
        const counts = {};
        for (const key of ['tests', 'pass', 'fail', 'skipped']) {
          const value = output.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'));
          counts[key] = value ? Number(value[1]) : null;
        }
        add(id, 'UNIT', 'No operational configuration', 'Tests pass',
          { exitCode: result.status, ...counts }, result.status === 0 ? 'PASS_LOCAL' : 'FAIL', files);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  for (const [id, environment, requirement, status] of [
    ['SECURITY_REDACTED_SCAN', 'LOCAL_REVIEW', 'Separate redacted scan and contextual classification', 'PENDING_EXTERNAL'],
    ['DB_CONCURRENCY', 'INTEGRATION_LOCAL', 'Isolated PostgreSQL with reviewed migrations', 'BLOCKED_EXTERNAL'],
    ['FRONTEND_NGINX_LOCAL', 'INTEGRATION_LOCAL', 'Separate production image health, SPA and asset checks', 'PENDING_EXTERNAL'],
    ['CORE_UI', 'INTEGRATION_LOCAL', 'Browser + isolated database', 'BLOCKED_EXTERNAL'],
    ['G1_REAL', 'POST_DEPLOY', 'Authorized G1 endpoint/key and read regression', 'PENDING_BENJAMIN'],
    ['G2_REAL', 'POST_DEPLOY', 'Coordinated invoice/payment replay/receipt/WiFi tests', 'PENDING_BENJAMIN'],
    ['G3_REAL', 'POST_DEPLOY', 'Coordinated installation/retry/OT/webhook/reconcile tests', 'PENDING_BENJAMIN'],
    ['FINET_DTE', 'SANDBOX', 'Current FiNet account/profile and authorized emission', 'PENDING_BENJAMIN'],
    ['CABLE_MAGICO_DTE', 'SANDBOX', 'Current Cable Magico profile and authorized emission', 'PENDING_BENJAMIN'],
    ['META_REAL', 'SANDBOX', 'Approved templates/test recipient and delivery webhook', 'PENDING_BENJAMIN'],
    ['SMTP_REAL', 'SANDBOX', 'SMTP account/test recipient and inbox receipt', 'PENDING_BENJAMIN'],
    ['DEPLOY_HEALTH', 'POST_DEPLOY', 'Current deployed frontend/backend and readiness checks', 'PENDING_BENJAMIN'],
    ['SCHEMA_RELEASE', 'POST_DEPLOY', 'Owner-approved schema/migrations and live readonly comparison', 'PENDING_BENJAMIN'],
    ['SECURITY_RELEASE', 'RELEASE', 'Team decision on historical data/secret incidents', 'PENDING_BENJAMIN'],
  ]) add(id, environment, requirement, 'Current candidate evidence',
    'Not executed by this unit/contract harness', status);
  report.totals = Object.fromEntries(['PASS_LOCAL', 'PASS_CONTRACT', 'PENDING_EXTERNAL',
    'PENDING_BENJAMIN', 'BLOCKED_EXTERNAL', 'FAIL'].map(status =>
    [status, report.cases.filter(c => c.STATUS === status).length]));
  report.QA_LOCAL_READY = runLocal && report.totals.FAIL === 0 && !privateEnvPresent;
  return report;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--run-local')) throw new Error('Only --run-local is supported');
  // Results go to stdout. Historical evidence files are never overwritten.
  const report = localAcceptance({ runLocal: args.includes('--run-local') });
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.FAIL > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
