import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

test('el repositorio no guarda claves privadas PEM completas', () => {
  const findings = [];
  for (const file of files) {
    if (!existsSync(file) || !/\.(?:pem|key|env|example|sample|ts|js|mjs|json|md|txt|ya?ml)$/.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]+\r?\n/.test(content)) findings.push(file);
  }
  assert.deepEqual(findings, [], 'Se detectaron claves privadas; solo se informan rutas, nunca sus valores.');
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
