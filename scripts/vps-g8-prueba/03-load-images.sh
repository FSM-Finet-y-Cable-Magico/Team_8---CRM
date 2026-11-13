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
: "${BACKEND_CONFIG_DIGEST:?release.env sin BACKEND_CONFIG_DIGEST}" "${FRONTEND_CONFIG_DIGEST:?release.env sin FRONTEND_CONFIG_DIGEST}"
# The archive must contain exactly the configs recorded at build time (docker load then verifies every blob digest).
archive_digest() { gunzip -c "$IMAGES_ARCHIVE" | tar -xOf - manifest.json | python3 -c "import json,sys
tag=sys.argv[1]; m=[e for e in json.load(sys.stdin) if tag in (e.get('RepoTags') or [])]
print('sha256:'+(m[0]['Config'].split('/')[-1] if m[0]['Config'].startswith('blobs/') else m[0]['Config'][:-5]) if len(m)==1 else 'AUSENTE')" "$1"; }
[ "$(archive_digest "$NEW_BACKEND_IMAGE")" = "$BACKEND_CONFIG_DIGEST" ] || fail "el archivo no contiene el backend construido ($BACKEND_CONFIG_DIGEST)"
[ "$(archive_digest "$NEW_FRONTEND_IMAGE")" = "$FRONTEND_CONFIG_DIGEST" ] || fail "el archivo no contiene el frontend construido ($FRONTEND_CONFIG_DIGEST)"
echo "OK el archivo contiene las configuraciones del build ($BACKEND_CONFIG_DIGEST / $FRONTEND_CONFIG_DIGEST)"
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
# Image ID depends on the store: classic (overlay2) shows the CONFIG digest, containerd shows the MANIFEST digest
# (the ID seen on the build machine). Either one identifies the built image; anything else is rejected.
check_id() { local image=$1 cfg=$2 manifest=$3 id; id=$(d8 image inspect "$image" --format '{{.Id}}')
  if [ "$id" = "$cfg" ]; then echo "OK $image ID = digest de configuración del build (almacén clásico)"
  elif [ "$id" = "$manifest" ]; then echo "OK $image ID = digest de manifiesto del build (almacén containerd)"
  else fail "$image: ID $id no corresponde al build (config $cfg / manifiesto $manifest)"; fi; }
check_id "$NEW_BACKEND_IMAGE" "$BACKEND_CONFIG_DIGEST" "${BACKEND_IMAGE_ID:-}"
check_id "$NEW_FRONTEND_IMAGE" "$FRONTEND_CONFIG_DIGEST" "${FRONTEND_IMAGE_ID:-}"

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
