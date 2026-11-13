#!/usr/bin/env bash
# Phase D: build the override/rollback files OUTSIDE Git and prove that, compared with the
# running containers, only the backend and frontend images change. Read-only for services.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/04-preflight-compose.txt") 2>&1
[ "$(cat "$WORK/C_PASS" 2>/dev/null)" = "$SHA" ] || { echo "FAIL ejecute antes 03-load-images.sh hasta PASS"; exit 1; }
discover
[ -r "$WORK/rollback.env" ] || { echo "FAIL ejecute antes 02-backup.sh (falta rollback.env)"; exit 1; }
source "$WORK/rollback.env"
for image in "$NEW_BACKEND_IMAGE" "$NEW_FRONTEND_IMAGE" "finet-g8-backend:rollback-$ROLLBACK_TS" "finet-g8-frontend:rollback-$ROLLBACK_TS"; do
  d8 image inspect "$image" >/dev/null || { echo "FAIL falta la imagen $image"; exit 1; }
done
[ "$(d8 image inspect "finet-g8-backend:rollback-$ROLLBACK_TS" --format '{{.Id}}')" = "$OLD_BACKEND_ID" ] || { echo "FAIL tag rollback backend"; exit 1; }
[ "$(d8 image inspect "finet-g8-frontend:rollback-$ROLLBACK_TS" --format '{{.Id}}')" = "$OLD_FRONTEND_ID" ] || { echo "FAIL tag rollback frontend"; exit 1; }
[ "$(d8 inspect "$CB" --format '{{.Image}}')" = "$OLD_BACKEND_ID" ] || { echo "FAIL el backend cambió desde el respaldo; repetir 02"; exit 1; }
[ "$(d8 inspect "$CF" --format '{{.Image}}')" = "$OLD_FRONTEND_ID" ] || { echo "FAIL el frontend cambió desde el respaldo; repetir 02"; exit 1; }

OV="$WORK/override.tk-$SHA7.yaml"; RB="$WORK/override.rollback-$ROLLBACK_TS.yaml"
printf 'services:\n  %s:\n    image: %s\n' "$SVC_B" "$NEW_BACKEND_IMAGE" > "$OV.B"
printf 'services:\n  %s:\n    image: %s\n' "$SVC_F" "$NEW_FRONTEND_IMAGE" > "$OV.F"
printf 'services:\n  %s:\n    image: %s\n' "$SVC_B" "finet-g8-backend:rollback-$ROLLBACK_TS" > "$RB.B"
printf 'services:\n  %s:\n    image: %s\n' "$SVC_F" "finet-g8-frontend:rollback-$ROLLBACK_TS" > "$RB.F"
chmod 600 "$OV".? "$RB".?

status=0
check() { # side container service overridefile expected_image old_image_json new_image_ref label
  local side=$1 c=$2 svc=$3 ov=$4 expect=$5 newref=$6 name=$7 cfg
  cfg="$WORK/config.$name.json"
  if [ -n "$ov" ]; then cc "$side" -f "$ov" config --quiet && cc "$side" -f "$ov" config --format json > "$cfg"
  else cc "$side" config --quiet && cc "$side" config --format json > "$cfg"; fi
  chmod 600 "$cfg"   # contiene valores de entorno resueltos: no compartir
  d8 image inspect "$newref" > "$WORK/image.$name.json"
  echo "--- $name"
  python3 "$KIT_DIR/compare.py" --running "$WORK/$c.inspect.json" --old-image "$WORK/$c.old-image.json" \
    --new-image "$WORK/image.$name.json" --config "$cfg" --service "$svc" --expect-image "$expect" \
    $( [ "$side" = B ] && echo --require-mount /app/generated ) || status=1
}
d8 inspect "$CB" > "$WORK/$CB.inspect.json"; d8 inspect "$CF" > "$WORK/$CF.inspect.json"; chmod 600 "$WORK"/*.inspect.json
d8 image inspect "$OLD_BACKEND_ID" > "$WORK/$CB.old-image.json"; d8 image inspect "$OLD_FRONTEND_ID" > "$WORK/$CF.old-image.json"

# 1) Without override the Compose files must describe exactly what runs today (no drift).
check B "$CB" "$SVC_B" "" "$(d8 inspect "$CB" --format '{{.Config.Image}}')" "$OLD_BACKEND_ID" base-backend
check F "$CF" "$SVC_F" "" "$(d8 inspect "$CF" --format '{{.Config.Image}}')" "$OLD_FRONTEND_ID" base-frontend
# 2) With the override only the image may change.
check B "$CB" "$SVC_B" "$OV.B" "$NEW_BACKEND_IMAGE" "$NEW_BACKEND_IMAGE" tk-backend
check F "$CF" "$SVC_F" "$OV.F" "$NEW_FRONTEND_IMAGE" "$NEW_FRONTEND_IMAGE" tk-frontend
# 3) The rollback override must also reproduce today's containers.
check B "$CB" "$SVC_B" "$RB.B" "finet-g8-backend:rollback-$ROLLBACK_TS" "$OLD_BACKEND_ID" rollback-backend
check F "$CF" "$SVC_F" "$RB.F" "finet-g8-frontend:rollback-$ROLLBACK_TS" "$OLD_FRONTEND_ID" rollback-frontend

echo "--- plan de Compose (dry-run): solo deben aparecer los contenedores $CB y $CF"
for side in B F; do
  if [ $side = B ]; then svc=$SVC_B; ov=$OV.B; else svc=$SVC_F; ov=$OV.F; fi
  plan=$(cc $side -f "$ov" up --dry-run -d --no-deps --no-build --pull never "$svc" 2>&1) || { echo "$plan"; echo "FAIL dry-run"; status=1; continue; }
  echo "$plan" | grep -E "Container|Network|Volume" | sed 's/^/  /'
  if echo "$plan" | grep -E "Container|Network|Volume" | grep -vE "($CB|$CF)" | grep -qE "Creat|Recreat|Remov|Start|Stop"; then
    echo "FAIL el plan toca recursos distintos de backend/frontend"; status=1
  fi
done

if [ $status -eq 0 ]; then echo "$SHA" > "$WORK/PREFLIGHT_PASS"; echo "RESULTADO PREFLIGHT: PASS (solo cambian las imágenes)";
else rm -f "$WORK/PREFLIGHT_PASS"; echo "RESULTADO PREFLIGHT: FAIL — no activar"; fi
exit $status
