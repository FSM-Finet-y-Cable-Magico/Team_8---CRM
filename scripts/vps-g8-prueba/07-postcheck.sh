#!/usr/bin/env bash
# Post-check after activation or rollback: images, variables, mounts, PDFs and DB fingerprint.
source "$(dirname "$0")/00-common.sh"
MODE=${1:-tk}
exec > >(tee "$WORK/07-postcheck-$MODE.txt") 2>&1
discover
mounts() { python3 -c "import json,sys;[print(m['Type'],m.get('Name') or m['Source'],m['Destination'],m.get('RW')) for m in sorted(json.load(sys.stdin)[0]['Mounts'],key=lambda m:m['Destination'])]"; }
d8 ps --filter "name=$EXPECTED_PROJECT" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
for c in "$CB" "$CF"; do
  d8 inspect "$c" --format '{{.Name}} imagen={{.Config.Image}} id={{.Image}} rev={{index .Config.Labels "org.opencontainers.image.revision"}}'
  d8 inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sed '/^$/d' | sort | diff -q - "$WORK/$c.env-names.txt" >/dev/null \
    && echo "OK $c mismos nombres de variables" || echo "REVISAR $c nombres de variables distintos (aceptable solo si son ENV de imagen, ver 04)"
  diff <(mounts < "$WORK/$c.inspect.json") <(d8 inspect "$c" | mounts) && echo "OK $c mismos montajes" || echo "FAIL $c montajes distintos"
done
wait_ready "$CB" || true
LIVE="$WORK/generated-live-$MODE.sha256"
d8 exec "$CB" sh -c 'cd /app/generated && find . -type f -print0 | sort -z | xargs -0 -r sha256sum' > "$LIVE"
MISSING=$(comm -23 <(norm_manifest "$WORK/backup/generated.sha256" | sort) <(norm_manifest "$LIVE" | sort) | wc -l)
[ "$MISSING" -eq 0 ] && echo "OK PDF preexistentes intactos ($(wc -l < "$WORK/backup/generated.sha256") archivos; ahora $(wc -l < "$LIVE"))" \
  || echo "FAIL $MISSING PDF preexistentes faltan o cambiaron"
db_fingerprint > "$WORK/db-despues-$MODE.txt"
diff "$WORK/db-antes.txt" "$WORK/db-despues-$MODE.txt" && echo "OK huella de datos idéntica" \
  || echo "REVISAR la huella de datos cambió: confirmar si hubo operaciones legítimas de otros usuarios en la ventana"
