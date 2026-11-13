#!/usr/bin/env bash
# Phase C (server side): verify the transferred archive and load the two new images.
# Expects $IMAGES_ARCHIVE (from release.env) and its .sha256 next to this script.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/03-load.txt") 2>&1
cd "$KIT_DIR"
fail() { echo "FAIL $*"; rm -f "$WORK/C_PASS"; exit 1; }
[ "$(cat "$WORK/B_PASS" 2>/dev/null)" = "$SHA" ] || fail "ejecute antes 02-backup.sh hasta PASS"

echo "== 1. integridad del paquete $IMAGES_ARCHIVE"
sha256sum -c "$IMAGES_ARCHIVE.sha256" || fail "sha256 del archivo transferido"
gunzip -t "$IMAGES_ARCHIVE" || fail "gzip corrupto"
gunzip -c "$IMAGES_ARCHIVE" | d8 load || fail "docker load"

echo "== 2. etiquetas de revisión y arquitectura"
ARCH=$(d8 version --format '{{.Server.Arch}}')
lbl() { d8 image inspect "$1" --format "{{index .Config.Labels \"$2\"}}"; }
for image in "$NEW_BACKEND_IMAGE" "$NEW_FRONTEND_IMAGE"; do
  rev=$(lbl "$image" org.opencontainers.image.revision); arch=$(d8 image inspect "$image" --format '{{.Architecture}}')
  echo "$image id=$(d8 image inspect "$image" --format '{{.Id}}') rev=$rev arch=$arch ref=$(lbl "$image" org.opencontainers.image.ref.name)"
  [ "$rev" = "$SHA" ] || fail "$image: revisión '$rev' distinta de $SHA"
  [ "$arch" = "$ARCH" ] || fail "$image: arquitectura $arch distinta del daemon $ARCH"
done
[ -n "${BACKEND_IMAGE_ID:-}" ] && { [ "$(d8 image inspect "$NEW_BACKEND_IMAGE" --format '{{.Id}}')" = "$BACKEND_IMAGE_ID" ] || fail "ID del backend distinto del construido ($BACKEND_IMAGE_ID)"; }
[ -n "${FRONTEND_IMAGE_ID:-}" ] && { [ "$(d8 image inspect "$NEW_FRONTEND_IMAGE" --format '{{.Id}}')" = "$FRONTEND_IMAGE_ID" ] || fail "ID del frontend distinto del construido ($FRONTEND_IMAGE_ID)"; }

echo "== 3. compatibilidad backend/frontend (mismo build del mismo código)"
for key in org.opencontainers.image.revision org.opencontainers.image.source org.opencontainers.image.ref.name org.opencontainers.image.created; do
  b=$(lbl "$NEW_BACKEND_IMAGE" "$key"); f=$(lbl "$NEW_FRONTEND_IMAGE" "$key")
  [ -n "$b" ] && [ "$b" = "$f" ] || fail "backend y frontend difieren en $key ('$b' vs '$f')"
done
echo "OK backend y frontend comparten revisión, origen, rama y fecha del commit"

echo "== 4. URL de API incorporada al bundle (VITE_API_URL se fija en el build)"
label=$(lbl "$NEW_FRONTEND_IMAGE" cl.finet.g8.vite-api-url)
[ "$label" = "$VITE_API_URL" ] || fail "etiqueta vite-api-url='$label' y release.env indica '$VITE_API_URL'"
report=$(d8 run --rm --network none --entrypoint sh "$NEW_FRONTEND_IMAGE" -c '
  js=$(cat /usr/share/nginx/html/assets/*.js)
  echo "drive=$(printf %s "$js" | grep -c "[A-Z]:/")"
  echo "absolutas=$(printf %s "$js" | grep -o "https\{0,1\}://[a-zA-Z0-9.:-]*/api" | sort -u | tr "\n" " ")"')
echo "$report"
drive=$(echo "$report" | sed -n 's/^drive=//p'); absolute=$(echo "$report" | sed -n 's/^absolutas=//p' | xargs)
[ "$drive" = "0" ] || fail "el bundle contiene rutas de unidad Windows (p. ej. D:/Git/api por conversión de Git Bash)"
case "$VITE_API_URL" in
  http*) echo " $absolute " | grep -q " $VITE_API_URL " || fail "el bundle no contiene $VITE_API_URL" ;;
  *) [ -z "$absolute" ] || fail "el bundle contiene URL absolutas de API ($absolute) y se esperaba la relativa $VITE_API_URL" ;;
esac
echo "OK bundle con VITE_API_URL=$VITE_API_URL"
echo "$SHA" > "$WORK/C_PASS"
echo "== FIN fase C: PASS, ambas imágenes son de la revisión $SHA"
