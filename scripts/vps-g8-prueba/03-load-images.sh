#!/usr/bin/env bash
# Phase C (server side): verify the transferred archive and load the two new images.
# Expects g8-tk-44c531c-images.tar.gz and its .sha256 next to this script.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/03-load.txt") 2>&1
cd "$KIT_DIR"
sha256sum -c "g8-tk-$SHA7-images.tar.gz.sha256" || { echo "FAIL sha256 del archivo transferido"; exit 1; }
gunzip -c "g8-tk-$SHA7-images.tar.gz" | d8 load
ARCH=$(d8 version --format '{{.Server.Arch}}')
for image in "$NEW_BACKEND_IMAGE" "$NEW_FRONTEND_IMAGE"; do
  rev=$(d8 image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  arch=$(d8 image inspect "$image" --format '{{.Architecture}}')
  echo "$image id=$(d8 image inspect "$image" --format '{{.Id}}') rev=$rev arch=$arch"
  [ "$rev" = "$SHA" ] || { echo "FAIL revisión distinta de $SHA"; exit 1; }
  [ "$arch" = "$ARCH" ] || { echo "FAIL arquitectura $arch distinta del daemon $ARCH"; exit 1; }
done
# The frontend bakes VITE_API_URL at build time; a Windows path (e.g. "D:/Git/api" from Git Bash
# path conversion) or an absolute URL different from the current one would break the UI.
API=$(d8 run --rm --network none --entrypoint sh "$NEW_FRONTEND_IMAGE" -c 'cat /usr/share/nginx/html/assets/*.js | grep -c "[A-Z]:/"' || true)
[ "${API:-1}" = "0" ] || { echo "FAIL el bundle del frontend contiene rutas de unidad Windows (build defectuoso)"; exit 1; }
echo "frontend VITE_API_URL=$(d8 image inspect "$NEW_FRONTEND_IMAGE" --format '{{index .Config.Labels "cl.finet.g8.vite-api-url"}}') (comparar con la fase A)"
echo "OK ambas imágenes son de la revisión $SHA"
