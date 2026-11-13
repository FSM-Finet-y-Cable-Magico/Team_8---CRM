#!/usr/bin/env bash
# Build machine (NOT the VPS): builds backend and frontend from the SAME published commit and assembles the package.
#   SHA=<40 hex published on the branch> OUT=<empty dir> [VITE_API_URL=/api] bash build-release.sh
# The sources come from `git archive $SHA` (never the working tree), the images are linux/amd64 with consistent OCI
# labels, and release.env pins SHA, image names/IDs and VITE_API_URL for the VPS scripts.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash would turn /api into C:/.../api inside --build-arg
: "${SHA:?Defina SHA=<commit de 40 caracteres>}" "${OUT:?Defina OUT=<directorio de salida vacío>}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA inválido" >&2; exit 2; }
BRANCH=${BRANCH:-fix/tickets-ux-inventario-g8-20261112}
VITE_API_URL=${VITE_API_URL:-/api}
SOURCE=https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM
REPO=$(git rev-parse --show-toplevel)

remote=$(git -C "$REPO" ls-remote origin "refs/heads/$BRANCH" | cut -f1)
[ "$remote" = "$SHA" ] || { echo "FAIL $BRANCH en GitHub es '$remote', no $SHA" >&2; exit 1; }
[ -z "$(ls -A "$OUT" 2>/dev/null)" ] || { echo "FAIL $OUT no está vacío" >&2; exit 1; }
mkdir -p "$OUT/src" "$OUT/kit"
SHA7=${SHA:0:7}
CREATED=$(git -C "$REPO" show -s --format=%cI "$SHA")
# Last commit that changed application code (backend/ or frontend/): traceability of what the images contain.
APP_CODE_SHA=$(git -C "$REPO" log -1 --format=%H "$SHA" -- backend frontend)
BACKEND_IMAGE="finet-g8-backend:tk-$SHA7"; FRONTEND_IMAGE="finet-g8-frontend:tk-$SHA7"
ARCHIVE="g8-tk-$SHA7-images.tar.gz"

# Repository bytes (LF), never the Windows checkout conversion (core.autocrlf would turn the scripts into CRLF).
git -c core.autocrlf=false -C "$REPO" archive --format=tar "$SHA" | ( cd "$OUT/src" && tar -xf - )
# Kit and runbook also come from the archived commit, never from the working tree.
KIT_SRC="$OUT/src/scripts/vps-g8-prueba"
labels=(--label "org.opencontainers.image.revision=$SHA" --label "org.opencontainers.image.source=$SOURCE"
        --label "org.opencontainers.image.ref.name=$BRANCH" --label "org.opencontainers.image.created=$CREATED")
docker build --platform linux/amd64 --target prod "${labels[@]}" --label org.opencontainers.image.title=finet-g8-backend \
  -t "$BACKEND_IMAGE" "$OUT/src/backend" > "$OUT/build-backend.log" 2>&1
docker build --platform linux/amd64 --target prod --build-arg "VITE_API_URL=$VITE_API_URL" "${labels[@]}" \
  --label org.opencontainers.image.title=finet-g8-frontend --label "cl.finet.g8.vite-api-url=$VITE_API_URL" \
  -t "$FRONTEND_IMAGE" "$OUT/src/frontend" > "$OUT/build-frontend.log" 2>&1

# Bundle checks: no Windows drive paths, API URL exactly as requested.
check=$(docker run --rm --network none --entrypoint sh "$FRONTEND_IMAGE" -c 'js=$(cat /usr/share/nginx/html/assets/*.js); echo "drive=$(printf %s "$js" | grep -c "[A-Z]:/")"; echo "abs=$(printf %s "$js" | grep -o "https\{0,1\}://[a-zA-Z0-9.:-]*/api" | sort -u | tr "\n" " ")"; echo "rel=$(printf %s "$js" | grep -o "\"/api\"" | wc -l)"')
echo "$check" > "$OUT/bundle-check.txt"
[ "$(sed -n 's/^drive=//p' <<< "$check")" = 0 ] || { echo "FAIL bundle con rutas Windows" >&2; exit 1; }
case "$VITE_API_URL" in
  http*) grep -q "$VITE_API_URL" <<< "$check" || { echo "FAIL bundle sin $VITE_API_URL" >&2; exit 1; } ;;
  *) [ -z "$(sed -n 's/^abs=//p' <<< "$check" | xargs)" ] || { echo "FAIL bundle con URL absolutas" >&2; exit 1; } ;;
esac

BID=$(docker image inspect "$BACKEND_IMAGE" --format '{{.Id}}'); FID=$(docker image inspect "$FRONTEND_IMAGE" --format '{{.Id}}')
docker save "$BACKEND_IMAGE" "$FRONTEND_IMAGE" | gzip -6 > "$OUT/kit/$ARCHIVE"
gunzip -t "$OUT/kit/$ARCHIVE"
( cd "$OUT/kit" && sha256sum "$ARCHIVE" > "$ARCHIVE.sha256" )
# Config digest of each image, read from the archive itself: it is the image ID a classic (overlay2) Docker store
# shows after `docker load`, while a containerd store shows the manifest digest (BID/FID). 03 accepts either.
config_digest() { gunzip -c "$OUT/kit/$ARCHIVE" | tar -xOf - manifest.json | python3 -c "import json,sys
tag=sys.argv[1]; m=[e for e in json.load(sys.stdin) if tag in (e.get('RepoTags') or [])]
assert len(m)==1, 'tag ausente en manifest.json'
c=m[0]['Config']; print('sha256:'+(c.split('/')[-1] if c.startswith('blobs/') else c.removesuffix('.json')))" "$1"; }
BCFG=$(config_digest "$BACKEND_IMAGE"); FCFG=$(config_digest "$FRONTEND_IMAGE")
[[ "$BCFG" =~ ^sha256:[0-9a-f]{64}$ && "$FCFG" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "FAIL no se pudo leer el digest de configuración" >&2; exit 1; }

cp "$KIT_SRC"/0*.sh "$KIT_SRC/compare.py" "$KIT_SRC/db-fingerprint.sql" "$OUT/kit/"
if [ "$(cat "$OUT"/kit/*.sh "$OUT/kit/compare.py" | tr -cd '\r' | wc -c)" -ne 0 ]; then echo "FAIL scripts del kit con fin de línea CRLF" >&2; exit 1; fi
cp "$OUT/src/docs/qa-libro-control/vps-release-tickets-g8-20261113.md" "$OUT/kit/RUNBOOK.md"
cat > "$OUT/kit/release.env" <<EOF
SHA=$SHA
BRANCH=$BRANCH
IMAGES_ARCHIVE=$ARCHIVE
NEW_BACKEND_IMAGE=$BACKEND_IMAGE
NEW_FRONTEND_IMAGE=$FRONTEND_IMAGE
BACKEND_IMAGE_ID=$BID
FRONTEND_IMAGE_ID=$FID
BACKEND_CONFIG_DIGEST=$BCFG
FRONTEND_CONFIG_DIGEST=$FCFG
VITE_API_URL=$VITE_API_URL
CREATED=$CREATED
APP_CODE_SHA=$APP_CODE_SHA
EOF
( cd "$OUT/kit" && sha256sum release.env 0*.sh compare.py db-fingerprint.sql RUNBOOK.md "$ARCHIVE" > MANIFEST.sha256 )
( cd "$OUT" && tar -czf "g8-release-tk-$SHA7.tar.gz" kit )   # relative paths: GNU tar reads C:/... as a remote host
( cd "$OUT" && sha256sum "g8-release-tk-$SHA7.tar.gz" > "g8-release-tk-$SHA7.tar.gz.sha256" )
echo "OK release $SHA"; cat "$OUT/kit/release.env"; cat "$OUT/g8-release-tk-$SHA7.tar.gz.sha256"
