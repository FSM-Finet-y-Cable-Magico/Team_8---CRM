#!/usr/bin/env bash
# Shared definitions for the G8 VPS test kit. Sourced by the numbered scripts.
# Nothing here writes to PostgreSQL, deletes images/volumes or prints secret values.
set -euo pipefail

SHA=44c531c67482e783d07c5b9aad6d3b584a117b04
SHA7=${SHA:0:7}
NEW_BACKEND_IMAGE="finet-g8-backend:tk-$SHA7"
NEW_FRONTEND_IMAGE="finet-g8-frontend:tk-$SHA7"
CB=${CB:-finet-g8-prueba-backend-1}
CF=${CF:-finet-g8-prueba-frontend-1}
EXPECTED_PROJECT=${EXPECTED_PROJECT:-finet-g8-prueba}
PG_CONTAINER=${PG_CONTAINER:-finet-postgres-global}
PG_USER=${PG_USER:-finet_db_admin}
PG_DB=${PG_DB:-finet_global_validacion}
# pwd -W only exists in Git Bash (local kit test); on Linux it fails and plain pwd is used.
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && { pwd -W 2>/dev/null || pwd; })

: "${WORK:?Defina WORK=<directorio de trabajo creado por 01-preflight.sh>}"
mkdir -p "$WORK" && chmod 700 "$WORK"

d8() { docker --host "${G8_DOCKER_HOST:-unix:///run/user/1000/docker.sock}" "$@"; }

# PostgreSQL may live on a different daemon than the rootless G8 one.
pgdocker() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then docker "$@";
  elif d8 ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then d8 "$@";
  else echo "No se encontró el contenedor $PG_CONTAINER en ningún daemon" >&2; return 1; fi
}

label() { d8 inspect "$1" --format "{{index .Config.Labels \"$2\"}}"; }

# Compose context taken from the labels of the RUNNING containers, never guessed.
discover() {
  PROJECT=$(label "$CB" com.docker.compose.project)
  [ "$PROJECT" = "$EXPECTED_PROJECT" ] || { echo "Proyecto inesperado: '$PROJECT'" >&2; return 1; }
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

compose_args() { # $1 = B|F ; prints nothing, fills ARGS
  local side=$1 f; ARGS=(-p "$PROJECT")
  if [ "$side" = B ]; then ARGS+=(--project-directory "$WD_B"); for f in "${ENVF_B[@]}"; do [ -n "$f" ] && ARGS+=(--env-file "$f"); done; for f in "${FILES_B[@]}"; do ARGS+=(-f "$f"); done
  else ARGS+=(--project-directory "$WD_F"); for f in "${ENVF_F[@]}"; do [ -n "$f" ] && ARGS+=(--env-file "$f"); done; for f in "${FILES_F[@]}"; do ARGS+=(-f "$f"); done; fi
}
cc() { local side=$1; shift; compose_args "$side"; d8 compose "${ARGS[@]}" "$@"; }

# Read-only business-data fingerprint (counts + md5, no PII printed).
db_fingerprint() {
  pgdocker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -At < "$KIT_DIR/db-fingerprint.sql"
}

# Wait until the backend answers /api/ready (max ~3 min).
wait_ready() { for _ in $(seq 1 36); do backend_ready "$1" >/dev/null 2>&1 && { backend_ready "$1"; return 0; }; sleep 5; done; echo "FAIL $1 no responde /api/ready"; return 1; }

# sha256 manifest normalized (GNU vs Git-for-Windows "*" binary marker), sorted by path.
norm_manifest() { sed -E 's/^([0-9a-f]{64}) [ *]/\1  /' "$@" | sort -k2; }

# Readiness endpoint of a running backend: read-only schema check + integration flags.
backend_ready() {
  d8 exec "$1" node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(async r=>console.log(r.status,await r.text())).catch(e=>{console.log('ERROR',e.message);process.exit(1)})"
}
