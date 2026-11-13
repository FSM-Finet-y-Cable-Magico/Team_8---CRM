#!/usr/bin/env bash
# Shared definitions for the G8 VPS release kit (v4). Sourced by the numbered scripts.
# Nothing here writes to PostgreSQL, deletes images/volumes or prints secret values.
# There are NO silent defaults for the Docker daemon, the containers or the database: the operator sets them from
# what 00-discover.sh observed, and every script verifies them against the running backend before acting.
set -euo pipefail

# pwd -W only exists in Git Bash (local kit test); on Linux it fails and plain pwd is used.
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && { pwd -W 2>/dev/null || pwd; })

# ---- release identity: generated at build time and shipped INSIDE the package (never edited by hand) ----
[ -r "$KIT_DIR/release.env" ] || { echo "FAIL falta release.env junto al kit (viene en el paquete del release)" >&2; exit 2; }
# shellcheck source=/dev/null
source "$KIT_DIR/release.env"
[[ "${SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "FAIL release.env: SHA debe tener 40 caracteres hexadecimales" >&2; exit 2; }
SHA7=${SHA:0:7}
: "${IMAGES_ARCHIVE:?release.env sin IMAGES_ARCHIVE}" "${NEW_BACKEND_IMAGE:?release.env sin NEW_BACKEND_IMAGE}"
: "${NEW_FRONTEND_IMAGE:?release.env sin NEW_FRONTEND_IMAGE}" "${VITE_API_URL:?release.env sin VITE_API_URL}"

# ---- target selection: explicit, validated ----
: "${WORK:?Defina WORK=<directorio de trabajo privado para este release>}"
: "${G8_DOCKER_HOST:?Defina G8_DOCKER_HOST con el socket del daemon que ejecuta G8 (ver 00-discover.sh)}"
: "${CB:?Defina CB=<contenedor backend G8 real>}" "${CF:?Defina CF=<contenedor frontend G8 real>}"
: "${EXPECTED_PROJECT:?Defina EXPECTED_PROJECT=<proyecto Compose de G8 observado>}"
: "${PG_CONTAINER:?Defina PG_CONTAINER=<contenedor PostgreSQL que sirve la base de G8>}" "${PG_DB:?Defina PG_DB=<base efectiva de G8>}"
: "${PG_USER:?Defina PG_USER=<rol con el que se ejecuta pg_dump dentro de PG_CONTAINER>}"
PG_DOCKER_HOST=${PG_DOCKER_HOST:-$G8_DOCKER_HOST}
mkdir -p "$WORK" && chmod 700 "$WORK"

d8() { docker --host "$G8_DOCKER_HOST" "$@"; }
pgd() { docker --host "$PG_DOCKER_HOST" "$@"; }
d8 inspect "$CB" >/dev/null 2>&1 || { echo "FAIL $CB no existe en $G8_DOCKER_HOST" >&2; exit 2; }
d8 inspect "$CF" >/dev/null 2>&1 || { echo "FAIL $CF no existe en $G8_DOCKER_HOST" >&2; exit 2; }
pgd inspect "$PG_CONTAINER" >/dev/null 2>&1 || { echo "FAIL $PG_CONTAINER no existe en $PG_DOCKER_HOST" >&2; exit 2; }

label() { d8 inspect "$1" --format "{{index .Config.Labels \"$2\"}}"; }

# Compose context taken from the labels of the RUNNING containers, never guessed.
discover() {
  PROJECT=$(label "$CB" com.docker.compose.project)
  [ "$PROJECT" = "$EXPECTED_PROJECT" ] || { echo "Proyecto inesperado: '$PROJECT' (se esperaba '$EXPECTED_PROJECT')" >&2; return 1; }
  [ "$(label "$CF" com.docker.compose.project)" = "$PROJECT" ] || { echo "Frontend en otro proyecto" >&2; return 1; }
  WD_B=$(label "$CB" com.docker.compose.project.working_dir)
  WD_F=$(label "$CF" com.docker.compose.project.working_dir)
  SVC_B=$(label "$CB" com.docker.compose.service)
  SVC_F=$(label "$CF" com.docker.compose.service)
  IFS=',' read -r -a FILES_B <<< "$(label "$CB" com.docker.compose.project.config_files)"
  IFS=',' read -r -a FILES_F <<< "$(label "$CF" com.docker.compose.project.config_files)"
  IFS=',' read -r -a ENVF_B <<< "$(label "$CB" com.docker.compose.project.environment_file)"
  IFS=',' read -r -a ENVF_F <<< "$(label "$CF" com.docker.compose.project.environment_file)"
  for f in "${FILES_B[@]}" "${FILES_F[@]}"; do [ -r "$f" ] || { echo "No se puede leer el archivo Compose $f" >&2; return 1; }; done
}

compose_args() { # $1 = B|F ; fills ARGS
  local side=$1 f; ARGS=(-p "$PROJECT")
  if [ "$side" = B ]; then ARGS+=(--project-directory "$WD_B"); for f in "${ENVF_B[@]}"; do [ -n "$f" ] && ARGS+=(--env-file "$f"); done; for f in "${FILES_B[@]}"; do ARGS+=(-f "$f"); done
  else ARGS+=(--project-directory "$WD_F"); for f in "${ENVF_F[@]}"; do [ -n "$f" ] && ARGS+=(--env-file "$f"); done; for f in "${FILES_F[@]}"; do ARGS+=(-f "$f"); done; fi
}
# Only 'config' and 'up' are allowed (never down/pull/build/rm/prune); 'up' never renews volumes or builds.
cc() {
  local side=$1 verb="" a; shift
  for a in "$@"; do case "$a" in config|up) verb=$a; break;; esac; done
  [ -n "$verb" ] || { echo "FAIL comando Compose no permitido por el kit: $*" >&2; return 1; }
  for a in "$@"; do case "$a" in down|pull|build|rm|kill|-V|--renew-anon-volumes|--build|--remove-orphans) echo "FAIL opción no permitida: $a" >&2; return 1;; esac; done
  compose_args "$side"; d8 compose "${ARGS[@]}" "$@"
}

# ---- PostgreSQL identity: the instance/database the BACKEND really uses ----
# Read-only SELECT through the backend's own Prisma connection (no credentials printed) and the same SELECT inside
# PG_CONTAINER. Same database name, server start time and database OID = same instance and same database.
PG_IDENTITY_SQL="select current_database() as db, pg_postmaster_start_time()::text as started, (select oid::text from pg_database where datname = current_database()) as oid"
backend_pg_identity() {
  d8 exec -w /app "$CB" node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient({ log: [] });
p.\$queryRawUnsafe(process.argv[1]).then(r => { const x = r[0]; console.log([x.db, x.started, x.oid].join('|')); return p.\$disconnect(); })
 .catch(e => { console.error('ERROR', e.code || e.name); process.exit(1); });" "$PG_IDENTITY_SQL"
}
container_pg_identity() {
  pgd exec "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -At -F'|' -c "$PG_IDENTITY_SQL"
}
verify_pg_target() {
  local from_backend from_container
  from_backend=$(backend_pg_identity) || { echo "FAIL no se pudo leer la identidad de la base desde el backend" >&2; return 1; }
  from_container=$(container_pg_identity) || { echo "FAIL no se pudo consultar $PG_DB en $PG_CONTAINER" >&2; return 1; }
  if [ "$from_backend" != "$from_container" ]; then
    echo "FAIL la base indicada ($PG_CONTAINER/$PG_DB) NO es la que usa el backend G8: backend=[$from_backend] indicada=[$from_container]" >&2
    return 1
  fi
  echo "OK base efectiva verificada: $PG_CONTAINER/$PG_DB es la conexión del backend ($from_backend)"
  echo "$from_backend" > "$WORK/pg-identity.txt"
}

# Read-only business-data fingerprint (counts + md5, no PII printed).
db_fingerprint() {
  pgd exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -At < "$KIT_DIR/db-fingerprint.sql"
}

# Readiness endpoint of a running backend (read-only schema check). Apt ONLY with HTTP 200, database=UP,
# global_schema=READY, missing_columns=0 and different_columns=0: a degraded schema is never accepted.
backend_ready() {
  d8 exec "$1" node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(async r=>{const t=await r.text();console.log(r.status,t);let j={};try{j=JSON.parse(t)}catch{}
const ok=r.status===200&&j.database==='UP'&&j.global_schema==='READY'&&j.missing_columns===0&&j.different_columns===0;
if(!ok)console.log('READINESS NO APTA: status='+r.status+' database='+j.database+' global_schema='+j.global_schema+' missing_columns='+j.missing_columns+' different_columns='+j.different_columns);
process.exit(ok?0:1)}).catch(e=>{console.log('ERROR',e.message);process.exit(1)})"
}
# Wait until the backend is apt (max ~3 min); on failure print the last readiness answer.
wait_ready() { for _ in $(seq 1 36); do backend_ready "$1" >/dev/null 2>&1 && { backend_ready "$1"; return 0; }; sleep 5; done; backend_ready "$1" || true; echo "FAIL $1 sin readiness apta"; return 1; }

# sha256 manifest normalized (GNU vs Git-for-Windows "*" binary marker), sorted by path.
norm_manifest() { sed -E 's/^([0-9a-f]{64}) [ *]/\1  /' "$@" | sort -k2; }
