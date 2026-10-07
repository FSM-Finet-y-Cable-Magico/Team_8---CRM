import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { isolatedQaEnv } from './i3-release-acceptance.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

test('no private environment files or database data backups are tracked', () => {
  const environmentExamples = new Set(['.env.example','.env.railway.example','backend/.env.example']);
  const forbidden = files.filter(file => /(^|\/)\.env(?:\.|$)/i.test(file) && !environmentExamples.has(file)
    || /\.(?:dump|backup|sql)(?:\.(?:gz|bz2|xz|zst|zip|7z))$/i.test(file)
    || /\.(?:dump|backup)$/i.test(file)
    || /(^|\/)(?:backups?|dumps?)\/.*\.sql$/i.test(file)
      && /\bCOPY\s[\s\S]*?FROM\s+stdin\b|(?:^|;)\s*INSERT\s+INTO\b/im.test(readFileSync(file, 'utf8')));
  assert.deepEqual(forbidden, [], 'Only paths are reported; private files must remain outside Git.');
});

test('QA descarta conexiones y credenciales heredadas incluso si estaban habilitadas', () => {
  const inherited = {
    PATH: '/synthetic/bin',
    DATABASE_URL: 'synthetic-operational-url', JWT_SECRET: 'synthetic-operational-secret',
    G1_INTEGRATION_ENABLED: 'true', G1_API_KEY: 'synthetic-operational-key',
    G3_INTEGRATION_ENABLED: 'true', G3_API_KEY: 'synthetic-operational-key',
    FACTURACION_CL_PRODUCTION_ENABLED: 'true', FACTURACION_CL_PROFILES: 'synthetic-profile',
    WHATSAPP_PROVIDER: 'meta', WHATSAPP_ACCESS_TOKEN: 'synthetic-token',
    SMTP_PASSWORD: 'synthetic-password', MAIL_PROVIDER: 'smtp',
    CRM_INTEGRATION_TESTS: '1', RUN_DB_INTEGRATION: '1', RUN_POSTGRES_INTEGRATION_TESTS: 'true',
    NODE_OPTIONS: '--require=synthetic-hook', NODE_EXTRA_CA_CERTS: 'synthetic-cert',
  };
  const env = isolatedQaEnv(inherited);
  assert.equal(env.PATH, inherited.PATH);
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(env.DATABASE_URL).port, '1');
  assert.notEqual(env.JWT_SECRET, inherited.JWT_SECRET);
  for (const key of ['G1_API_KEY', 'G3_API_KEY', 'WHATSAPP_ACCESS_TOKEN',
    'SMTP_PASSWORD', 'MAIL_PROVIDER', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS']) {
    assert.equal(Object.hasOwn(env, key), false, key);
  }
  assert.equal(env.CRM_INTEGRATION_TESTS, '0');
  assert.equal(env.RUN_DB_INTEGRATION, '0');
  assert.equal(env.RUN_POSTGRES_INTEGRATION_TESTS, 'false');
  assert.equal(env.G1_INTEGRATION_ENABLED, 'false');
  assert.equal(env.G3_INTEGRATION_ENABLED, 'false');
  assert.equal(env.FACTURACION_CL_PRODUCTION_ENABLED, 'false');
  assert.equal(env.FACTURACION_CL_PROFILES, '[]');
  assert.equal(env.WHATSAPP_PROVIDER, 'disabled');
  assert.equal(inherited.G1_INTEGRATION_ENABLED, 'true', 'No modifica el entorno padre');
});

test('QA elimina SMTP ambiental y permite que los tests configuren sus servidores loopback', () => {
  const env = isolatedQaEnv({ SMTP_HOST: 'synthetic-host', SMTP_PORT: '465',
    SMTP_TLS_REJECT_UNAUTHORIZED: 'false', MAIL_PROVIDER: 'disabled', CUSTOM_PROVIDER_TOKEN: 'synthetic-token' });
  assert.equal(Object.keys(env).some(key => key.startsWith('SMTP_')), false);
  assert.equal(Object.hasOwn(env, 'MAIL_PROVIDER'), false);
  assert.equal(Object.hasOwn(env, 'CUSTOM_PROVIDER_TOKEN'), false);
});

test('el informe saneado no publica valores de hallazgos', () => {
  const report = JSON.parse(readFileSync('docs/i3-security-redacted.json', 'utf8'));
  assert.ok(Array.isArray(report.findings));
  assert.ok(report.findings.every(finding => finding.value === '[REDACTED]'));
});

test('el repositorio no guarda claves privadas PEM completas', () => {
  const findings = [];
  for (const file of files) {
    if (!existsSync(file) || !/\.(?:pem|key|env|example|sample|template|ts|tsx|cts|mts|js|jsx|cjs|mjs|json|md|txt|sql|ps1|sh|conf|ya?ml)$/i.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    const bodyPresent = /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n|Proc-Type:)/.test(content);
    const blockPresent = /-----BEGIN ((?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----[\s\S]+?-----END \1-----/.test(content);
    if (bodyPresent || blockPresent) findings.push(file);
  }
  assert.deepEqual(findings, [], 'Se detectaron claves privadas; solo se informan rutas, nunca sus valores.');
});

test('las URLs HTTP de manifests y locks no contienen credenciales ni tokens en query', () => {
  const findings = [];
  for (const file of ['package.json', 'backend/package.json', 'frontend/package.json',
    'package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json']) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error(`${file}: no se pudo auditar; no se muestra contenido`); }
    const urls = file.endsWith('package-lock.json')
      ? Object.values(manifest.packages ?? {}).map(pkg => pkg.resolved)
      : Object.values({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies });
    const unsafe = urls.some(value => {
      if (typeof value !== 'string' || !/^(?:git\+)?https?:/i.test(value)) return false;
      try {
        const url = new URL(value.replace(/^git\+/i, ''));
        const sensitiveQuery = [...url.searchParams.keys()].some(key =>
          /token|secret|password|passwd|credential|api[-_]?key|auth|signature/i.test(key));
        return Boolean(url.username || url.password || sensitiveQuery);
      } catch { return true; }
    });
    if (unsafe) findings.push(file);
  }
  assert.deepEqual(findings, [], 'Se informan solo rutas, nunca URLs ni valores de credenciales.');
});

test('las plantillas no incluyen tokens de proveedores reales', () => {
  for (const file of ['.env.example', '.env.railway.example', 'backend/.env.example']) {
    const content = readFileSync(file, 'utf8');
    assert.equal(/\b(?:ghp_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,}|sk-[a-zA-Z0-9_-]{30,})\b/.test(content), false, file);
    for (const line of content.split(/\r?\n/)) {
      if (/^\s*(?:G1_API_KEY|G3_API_KEY|TOMODAT_API_TOKEN|SMTP_PASSWORD|WHATSAPP_\w+(?:ACCESS_TOKEN|APP_SECRET))\s*=/.test(line)) {
        assert.match(line, /=\s*(?:#.*)?$/, `${file}: la credencial debe configurarse fuera de Git`);
      }
    }
  }
});
