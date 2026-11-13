#!/usr/bin/env bash
# Rollback: recreate backend AND frontend with the images captured by 02-backup.sh.
# Same mounts, networks and variables; the database is NOT touched or restored (QA writes made after the activation
# are legitimate transactions to reconcile, never to overwrite with a dump). Exit code != 0 if anything failed.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/06-rollback.txt") 2>&1
discover; source "$WORK/rollback.env"
status=0
RB="$WORK/override.rollback-$ROLLBACK_TS.yaml"
for side in B F; do [ -r "$RB.$side" ] || { echo "FAIL falta $RB.$side (ejecute 04)"; exit 1; }; done
if ! d8 image inspect "finet-g8-backend:rollback-$ROLLBACK_TS" >/dev/null 2>&1 || ! d8 image inspect "finet-g8-frontend:rollback-$ROLLBACK_TS" >/dev/null 2>&1; then
  echo "Tags de rollback ausentes: recuperando desde el archivo verificado"
  ( cd "$WORK/backup" && sha256sum -c "g8-rollback-images-$ROLLBACK_TS.tar.gz.sha256" ) || { echo "FAIL archivo de rollback alterado"; exit 1; }
  gunzip -c "$WORK/backup/g8-rollback-images-$ROLLBACK_TS.tar.gz" | d8 load || { echo "FAIL no se pudieron cargar las imágenes de rollback"; exit 1; }
fi
cc B -f "$RB.B" up -d --no-deps --no-build --pull never "$SVC_B" || { echo "FAIL no se pudo recrear el backend anterior"; status=1; }
cc F -f "$RB.F" up -d --no-deps --no-build --pull never "$SVC_F" || { echo "FAIL no se pudo recrear el frontend anterior"; status=1; }
wait_ready "$CB" || status=1
[ "$(d8 inspect "$CB" --format '{{.Image}}')" = "$OLD_BACKEND_ID" ] && echo "OK backend en imagen anterior $OLD_BACKEND_ID" || { echo "FAIL backend no volvió a $OLD_BACKEND_ID"; status=1; }
[ "$(d8 inspect "$CF" --format '{{.Image}}')" = "$OLD_FRONTEND_ID" ] && echo "OK frontend en imagen anterior $OLD_FRONTEND_ID" || { echo "FAIL frontend no volvió a $OLD_FRONTEND_ID"; status=1; }
set +e; bash "$KIT_DIR/07-postcheck.sh" rollback; rc=$?; set -e
[ $rc -eq 1 ] && status=1
[ $status -eq 0 ] && echo "RESULTADO ROLLBACK: PASS" || echo "RESULTADO ROLLBACK: FAIL — no abrir el CRM; revisar este registro"
exit $status
