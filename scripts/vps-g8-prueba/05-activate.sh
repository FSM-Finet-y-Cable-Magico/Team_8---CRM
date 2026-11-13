#!/usr/bin/env bash
# Phase E — activation of the release. Requires phases A-D in PASS for THIS SHA and CONFIRM_SHA=<SHA of release.env>.
# Recreates ONLY backend and frontend with the new images. Any failure after the backend has been touched rolls back
# BOTH images automatically (06-rollback.sh) before the CRM is opened to users. The database is never restored.
#   CONFIRM_SHA=<40 hex> WORK=... (plus the variables of 00-common.sh) bash 05-activate.sh
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/05-activate.txt") 2>&1
[ "${CONFIRM_SHA:-}" = "$SHA" ] || { echo "BLOQUEADO: falta CONFIRM_SHA=$SHA (confirmación explícita del SHA del release)"; exit 2; }
for phase in A_PASS B_PASS C_PASS PREFLIGHT_PASS; do
  [ "$(cat "$WORK/$phase" 2>/dev/null)" = "$SHA" ] || { echo "BLOQUEADO: $phase no está en PASS para $SHA"; exit 2; }
done
discover; source "$WORK/rollback.env"
[ "$(d8 inspect "$CB" --format '{{.Image}}')" = "$OLD_BACKEND_ID" ] || { echo "BLOQUEADO: el backend cambió desde el preflight"; exit 2; }
[ "$(d8 inspect "$CF" --format '{{.Image}}')" = "$OLD_FRONTEND_ID" ] || { echo "BLOQUEADO: el frontend cambió desde el preflight"; exit 2; }
verify_pg_target || { echo "BLOQUEADO: la base del backend ya no es la verificada"; exit 2; }
[ "$(cat "$WORK/pg-identity.txt")" = "$(backend_pg_identity)" ] || { echo "BLOQUEADO: identidad de base distinta"; exit 2; }
OV="$WORK/override.tk-$SHA7.yaml"
TOUCHED=0

rollback_now() {
  echo "!! $1 — ejecutando rollback de backend y frontend"
  if bash "$KIT_DIR/06-rollback.sh"; then echo "ROLLBACK COMPLETADO: el CRM quedó en las imágenes anteriores"; else echo "ROLLBACK CON FALLAS: revisar 06-rollback.txt antes de abrir el CRM"; fi
  exit 1
}
on_error() { [ "$TOUCHED" = 1 ] && rollback_now "falla inesperada durante la activación"; exit 1; }
trap on_error ERR

wait_healthy() {
  local s
  for _ in $(seq 1 60); do
    s=$(d8 inspect "$1" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
    case "$s" in "running healthy"|"running none") echo "$1 $s"; return 0;; "exited"*|*unhealthy) echo "$1 $s"; return 1;; esac
    sleep 5
  done; echo "$1 timeout"; return 1
}

# Never -V/--renew-anon-volumes, never down, never build or pull (enforced by cc in 00-common.sh).
TOUCHED=1
cc B -f "$OV.B" up -d --no-deps --no-build --pull never "$SVC_B" || rollback_now "no se pudo recrear el backend"
wait_healthy "$CB" || rollback_now "backend no saludable"
wait_ready "$CB" || rollback_now "backend sin readiness"
cc F -f "$OV.F" up -d --no-deps --no-build --pull never "$SVC_F" || rollback_now "no se pudo recrear el frontend"
wait_healthy "$CF" || rollback_now "frontend no saludable"
trap - ERR

set +e
bash "$KIT_DIR/07-postcheck.sh" tk
rc=$?
set -e
case $rc in
  0) echo "ACTIVACIÓN: PASS — release $SHA en ejecución. Línea base de datos para la QA: $WORK/db-post-activacion.txt" ;;
  3) echo "ACTIVACIÓN: REVISAR — imágenes, montajes, PDF y readiness OK, pero la huella de datos cambió durante la ventana."
     echo "  Confirmar que solo hubo actividad legítima de otros usuarios; si no, ejecutar 06-rollback.sh. No se revierte automáticamente."
     exit 3 ;;
  *) rollback_now "07-postcheck falló (código $rc)" ;;
esac
