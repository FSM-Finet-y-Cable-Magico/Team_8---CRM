import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
const nginx = readFileSync(new URL('./nginx.conf.template', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('./.dockerignore', import.meta.url), 'utf8');

test('la imagen productiva copia solo dist a un runtime estatico sin devDependencies', () => {
  assert.match(dockerfile, /FROM node:22-alpine AS build/);
  assert.match(dockerfile, /ARG VITE_API_URL=\/api/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /FROM nginx:1\.30-alpine AS prod/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/);
  const productionStage = dockerfile.slice(dockerfile.indexOf('FROM nginx:1.30-alpine AS prod'));
  assert.match(productionStage, /HEALTHCHECK[\s\S]*127\.0\.0\.1:\$\{PORT\}\/health/);
  assert.doesNotMatch(productionStage, /npm (?:ci|install)|node_modules|src\/|vite (?:--host|preview)/i);
  assert.doesNotMatch(dockerfile + nginx, /JWT_SECRET|DATABASE_URL|API_KEY|PASSWORD/i);
});

test('nginx escucha PORT, expone health y conserva fallback SPA sin fallback de assets', () => {
  assert.match(nginx, /listen \$\{PORT\};/);
  assert.match(nginx, /location = \/health[\s\S]*return 200/);
  assert.match(nginx, /location \/assets\/[\s\S]*try_files \$uri =404/);
  assert.match(nginx, /location \/[\s\S]*try_files \$uri \$uri\/ \/index\.html/);
  assert.doesNotMatch(nginx, /proxy_pass|autoindex\s+on/i);
});

test('el contexto Docker excluye entornos, dependencias y artefactos locales', () => {
  for (const entry of ['node_modules', 'dist', '.env', '.env.*']) assert.match(dockerignore, new RegExp(`^${entry.replace('.', '\\.')}$`, 'm'));
});
