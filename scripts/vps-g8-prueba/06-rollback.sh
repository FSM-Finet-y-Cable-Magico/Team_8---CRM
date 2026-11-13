#!/usr/bin/env bash
# Rollback: recreate backend AND frontend with the images captured by 02-backup.sh.
# Same mounts, networks and variables; the database is not touched or restored.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/06-rollback.txt") 2>&1
discover; source "$WORK/rollback.env"
RB="$WORK/override.rollback-$ROLLBACK_TS.yaml"
for side in B F; do [ -r "$RB.$side" ] || { echo "FAIL falta $RB.$side (ejecute 04)"; exit 1; }; done
if ! d8 image inspect "finet-g8-backend:rollback-$ROLLBACK_TS" >/dev/null 2>&1 || ! d8 image inspect "finet-g8-frontend:rollback-$ROLLBACK_TS" >/dev/null 2>&1; then
  echo "Tags de rollback ausentes: recuperando desde el archivo verificado"
  ( cd "$WORK/backup" && sha256sum -c "g8-rollback-images-$ROLLBACK_TS.tar.gz.sha256" ) && gunzip -c "$WORK/backup/g8-rollback-images-$ROLLBACK_TS.tar.gz" | d8 load
fi
cc B -f "$RB.B" up -d --no-deps --no-build --pull never "$SVC_B"
cc F -f "$RB.F" up -d --no-deps --no-build --pull never "$SVC_F"
wait_ready "$CB" || echo "FAIL backend anterior sin readiness"
[ "$(d8 inspect "$CB" --format '{{.Image}}')" = "$OLD_BACKEND_ID" ] && echo "OK backend en imagen anterior $OLD_BACKEND_ID" || echo "FAIL backend no volvió a $OLD_BACKEND_ID"
[ "$(d8 inspect "$CF" --format '{{.Image}}')" = "$OLD_FRONTEND_ID" ] && echo "OK frontend en imagen anterior $OLD_FRONTEND_ID" || echo "FAIL frontend no volvió a $OLD_FRONTEND_ID"
bash "$KIT_DIR/07-postcheck.sh" rollback
