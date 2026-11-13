#!/usr/bin/env bash
# Phase E — DO NOT RUN without explicit authorization from the G8 owner for this SHA.
# Recreates ONLY backend and frontend with the new images. Usage:
#   CONFIRM_SHA=44c531c67482e783d07c5b9aad6d3b584a117b04 WORK=... bash 05-activate.sh
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/05-activate.txt") 2>&1
[ "${CONFIRM_SHA:-}" = "$SHA" ] || { echo "BLOQUEADO: falta CONFIRM_SHA=$SHA (autorización explícita)"; exit 2; }
[ "$(cat "$WORK/PREFLIGHT_PASS" 2>/dev/null)" = "$SHA" ] || { echo "BLOQUEADO: 04-preflight-compose.sh no terminó en PASS"; exit 2; }
discover; source "$WORK/rollback.env"
[ "$(d8 inspect "$CB" --format '{{.Image}}')" = "$OLD_BACKEND_ID" ] || { echo "BLOQUEADO: el backend cambió desde el preflight"; exit 2; }
[ "$(d8 inspect "$CF" --format '{{.Image}}')" = "$OLD_FRONTEND_ID" ] || { echo "BLOQUEADO: el frontend cambió desde el preflight"; exit 2; }
OV="$WORK/override.tk-$SHA7.yaml"

wait_healthy() {
  for _ in $(seq 1 60); do
    s=$(d8 inspect "$1" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
    case "$s" in "running healthy"|"running none") echo "$1 $s"; return 0;; "exited"*|*unhealthy) echo "$1 $s"; return 1;; esac
    sleep 5
  done; echo "$1 timeout"; return 1
}

# Never -V/--renew-anon-volumes, never down, never build or pull.
cc B -f "$OV.B" up -d --no-deps --no-build --pull never "$SVC_B"
wait_healthy "$CB" || { echo "FAIL backend no saludable: ejecutar 06-rollback.sh"; exit 1; }
wait_ready "$CB" || { echo "FAIL backend sin readiness: ejecutar 06-rollback.sh"; exit 1; }
cc F -f "$OV.F" up -d --no-deps --no-build --pull never "$SVC_F"
wait_healthy "$CF" || { echo "FAIL frontend no saludable: ejecutar 06-rollback.sh"; exit 1; }
bash "$KIT_DIR/07-postcheck.sh" tk
