#!/usr/bin/env bash
# Post-check after activation (mode tk) or rollback (mode rollback). Exit codes:
#   0 PASS · 1 FAIL blocking (wrong image/revision, variables, mounts, PDFs, readiness) · 3 only the data fingerprint changed.
# Mode tk: data must be identical to phase A unless ALLOW_DB_DRIFT=1 (operator confirmed legitimate activity in the
# window); the fingerprint taken here becomes the baseline (db-post-activacion.txt) before any QA operation.
# Mode rollback: data changes after the activation are QA transactions to reconcile by IDs/audit, never a failure and
# never a reason to restore the database: the diff is only recorded.
source "$(dirname "$0")/00-common.sh"
MODE=${1:-tk}
exec > >(tee "$WORK/07-postcheck-$MODE.txt") 2>&1
discover; source "$WORK/rollback.env"
status=0
bad() { echo "FAIL $*"; status=1; }
mounts() { python3 -c "import json,sys;[print(m['Type'],m.get('Name') or m['Source'],m['Destination'],m.get('RW')) for m in sorted(json.load(sys.stdin)[0]['Mounts'],key=lambda m:m['Destination'])]"; }
envnames() { python3 -c "import json,sys;d=json.load(sys.stdin);d=d[0] if isinstance(d,list) else d;print('\n'.join(sorted({e.split('=',1)[0] for e in (d.get('Config',{}).get('Env') or [])})))"; }

d8 ps --filter "label=com.docker.compose.project=$EXPECTED_PROJECT" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
for c in "$CB" "$CF"; do
  d8 inspect "$c" --format '{{.Name}} imagen={{.Config.Image}} id={{.Image}} estado={{.State.Status}}'
  [ "$(d8 inspect "$c" --format '{{.State.Status}}')" = running ] || bad "$c no está en ejecución"
  image_id=$(d8 inspect "$c" --format '{{.Image}}')
  if [ "$MODE" = tk ]; then
    rev=$(d8 image inspect "$image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
    [ "$rev" = "$SHA" ] && echo "OK $c ejecuta la revisión $SHA" || bad "$c ejecuta la revisión '$rev', no $SHA"
  else
    expected=$([ "$c" = "$CB" ] && echo "$OLD_BACKEND_ID" || echo "$OLD_FRONTEND_ID")
    [ "$image_id" = "$expected" ] && echo "OK $c volvió a la imagen anterior" || bad "$c no ejecuta la imagen anterior $expected"
  fi
  # Variable NAMES must be the same; a difference is accepted only if it comes from the images' own ENV.
  diff_names=$(comm -3 <(d8 inspect "$c" | envnames) <(envnames < "$WORK/$c.inspect.json") | tr -d '\t' | sed '/^$/d')
  image_names=$( { d8 image inspect "$image_id" | envnames; envnames < "$WORK/$c.old-image.json"; } | sort -u)
  unexplained=$(comm -23 <(echo "$diff_names" | sed '/^$/d' | sort -u) <(echo "$image_names" | sort -u))
  if [ -z "$diff_names" ]; then echo "OK $c mismos nombres de variables"
  elif [ -z "$unexplained" ]; then echo "OK $c variables distintas solo por ENV de imagen: $(echo $diff_names)"
  else bad "$c variables de entorno distintas no explicadas por la imagen: $(echo $unexplained)"; fi
  diff <(mounts < "$WORK/$c.inspect.json") <(d8 inspect "$c" | mounts) >/dev/null && echo "OK $c mismos montajes" || bad "$c montajes distintos"
done
wait_ready "$CB" || bad "backend sin readiness"
LIVE="$WORK/generated-live-$MODE.sha256"
if d8 exec "$CB" sh -c 'cd /app/generated && find . -type f -print0 | sort -z | xargs -0 -r sha256sum' > "$LIVE"; then
  MISSING=$(comm -23 <(norm_manifest "$WORK/backup/generated.sha256" | sort) <(norm_manifest "$LIVE" | sort) | wc -l)
  [ "$MISSING" -eq 0 ] && echo "OK PDF preexistentes intactos ($(wc -l < "$WORK/backup/generated.sha256") archivos; ahora $(wc -l < "$LIVE"))" \
    || bad "$MISSING PDF preexistentes faltan o cambiaron"
else bad "no se pudo leer /app/generated"; fi

verify_pg_target >/dev/null || bad "la base del backend ya no es la verificada en la fase A"
db_fingerprint > "$WORK/db-despues-$MODE.txt" || bad "no se pudo leer la huella de datos"
drift=0
if diff "$WORK/db-antes.txt" "$WORK/db-despues-$MODE.txt" > "$WORK/db-diff-$MODE.txt"; then echo "OK huella de datos idéntica a la fase A"
else drift=1; echo "Diferencias de huella (conteos/hash por tabla, sin datos):"; sed 's/^/  /' "$WORK/db-diff-$MODE.txt"; fi

if [ "$MODE" = tk ]; then
  cp "$WORK/db-despues-$MODE.txt" "$WORK/db-post-activacion.txt"   # baseline for the QA that follows
  if [ $status -eq 0 ] && [ $drift -eq 1 ] && [ "${ALLOW_DB_DRIFT:-0}" != 1 ]; then
    echo "REVISAR la huella cambió durante la ventana de activación (ALLOW_DB_DRIFT=1 solo si el operador confirmó actividad legítima)"
    exit 3
  fi
else
  [ $drift -eq 1 ] && echo "INFO cambios de datos posteriores a la activación: conciliar por IDs y auditoría; la base NO se restaura"
fi
[ $status -eq 0 ] && echo "RESULTADO POSTCHECK ($MODE): PASS" || echo "RESULTADO POSTCHECK ($MODE): FAIL"
exit $status
