import { pathToFileURL } from 'node:url';
import { validateIntegrationKeys } from './validate-production-env.mjs';

// Pure/local preflight. Never load dotenv, connect, print values or authorize a deployment.
export function validateG8G3QaConfig(env) {
  const errors = [];
  const origin = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    } catch { return false; }
  };
  const image = value => typeof value === 'string' && /^[^\s@]+@sha256:[a-f0-9]{64}$/.test(value);
  if (!image(env.QA_BACKEND_IMAGE)) errors.push('QA_BACKEND_IMAGE_DIGEST_REQUIRED');
  if (!image(env.QA_FRONTEND_IMAGE)) errors.push('QA_FRONTEND_IMAGE_DIGEST_REQUIRED');
  try {
    const db = new URL(env.QA_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== '/finet_global_validacion'
      || !db.hostname || !db.username || !db.password || ['postgres', 'root'].includes(decodeURIComponent(db.username).toLowerCase())
      || db.hash || [...db.searchParams].some(([key, value]) => key === 'schema' && value !== 'public')) {
      errors.push('QA_DATABASE_TARGET_OR_ROLE_INVALID');
    }
  } catch { errors.push('QA_DATABASE_TARGET_OR_ROLE_INVALID'); }
  if (typeof env.QA_JWT_SECRET !== 'string' || env.QA_JWT_SECRET.length < 32
    || /placeholder|reemplazar|change.?me/i.test(env.QA_JWT_SECRET)) errors.push('QA_JWT_SECRET_INVALID');
  if (!origin(env.QA_FRONTEND_ORIGIN)) errors.push('QA_FRONTEND_ORIGIN_INVALID');
  if (!origin(env.QA_G3_API_URL)) errors.push('QA_G3_ORIGIN_INVALID');
  if (typeof env.QA_G3_API_KEY !== 'string' || !env.QA_G3_API_KEY.trim() || /\s/.test(env.QA_G3_API_KEY)
    || env.QA_G3_API_KEY.length > 1024 || /placeholder|reemplazar|change.?me/i.test(env.QA_G3_API_KEY)) errors.push('QA_G3_KEY_INVALID');
  const keys = validateIntegrationKeys(env.QA_G8_INTEGRATION_API_KEYS);
  if (!keys.configured || !keys.valid) errors.push('QA_INBOUND_KEYS_INVALID');
  else if (JSON.parse(env.QA_G8_INTEGRATION_API_KEYS).some(row => row.group !== 'G3' || row.active !== true
    || Object.keys(row).sort().join(',') !== 'active,companies,group,keyId,sha256')) errors.push('QA_INBOUND_KEYS_G3_ONLY');
  const ports = [env.QA_BACKEND_PORT ?? '18808', env.QA_FRONTEND_PORT ?? '18809'];
  if (ports.some(port => !/^[1-9]\d{0,4}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || Number(port) === 8800)
    || Number(ports[0]) === Number(ports[1])) errors.push('QA_PORTS_INVALID');
  return { valid: errors.length === 0, errors, credentialsPrinted: false, databaseUsed: false, deploymentAuthorized: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateG8G3QaConfig(process.env);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.valid ? 0 : 1;
}
