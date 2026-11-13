#!/usr/bin/env bash
# Phase A: read-only inventory of the running G8 containers. Writes only into $WORK.
# Requires the variables of 00-common.sh (set from 00-discover.sh). Aborts if the database given is not the one the
# backend really uses: a dump or fingerprint of another database would not protect G8 data.
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/01-preflight.txt") 2>&1
fail() { echo "FAIL $*"; rm -f "$WORK/A_PASS"; exit 1; }

echo "== release $SHA (imágenes $NEW_BACKEND_IMAGE / $NEW_FRONTEND_IMAGE, VITE_API_URL=$VITE_API_URL)"
echo "== servidor"; hostname; whoami; date -Is
d8 version --format 'daemon g8: server={{.Server.Version}} arch={{.Server.Arch}} os={{.Server.Os}}'
d8 compose version
command -v python3 >/dev/null || fail "falta python3 (necesario para compare.py)"
df -h "$WORK" | sed 's/^/disco trabajo /'
df -h "$(d8 info --format '{{.DockerRootDir}}')" 2>/dev/null | sed 's/^/disco docker /' || echo "disco docker: no accesible desde el host (revisar espacio libre para ~600 MB de imágenes)"

echo "== contenedores del proyecto $EXPECTED_PROJECT"
d8 ps -a --filter "label=com.docker.compose.project=$EXPECTED_PROJECT" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
discover || fail "contexto Compose no verificable"
for c in "$CB" "$CF"; do
  d8 inspect "$c" > "$WORK/$c.inspect.json"; chmod 600 "$WORK/$c.inspect.json"   # contiene variables: no compartir
  d8 inspect "$c" --format 'contenedor={{.Name}} imagen={{.Config.Image}} id={{.Image}} estado={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}} inicio={{.State.StartedAt}}'
  [ "$(d8 inspect "$c" --format '{{.State.Status}}')" = running ] || fail "$c no está en ejecución"
  d8 image inspect "$(d8 inspect "$c" --format '{{.Image}}')" > "$WORK/$c.old-image.json"
  d8 image inspect "$(d8 inspect "$c" --format '{{.Image}}')" --format '  revision={{index .Config.Labels "org.opencontainers.image.revision"}} arch={{.Architecture}} creada={{.Created}} tags={{.RepoTags}}'
  d8 inspect "$c" --format '{{range .Mounts}}  mount {{.Type}} {{.Name}} {{.Source}} -> {{.Destination}} rw={{.RW}}{{println}}{{end}}'
  d8 inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}  red {{$k}}{{println}}{{end}}{{range $p,$b := .HostConfig.PortBindings}}  puerto {{$p}} {{$b}}{{println}}{{end}}  restart={{.HostConfig.RestartPolicy.Name}}'
  d8 inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sed '/^$/d' | sort > "$WORK/$c.env-names.txt"
  echo "  variables: $(wc -l < "$WORK/$c.env-names.txt") nombres guardados en $c.env-names.txt (sin valores)"
done
echo "proyecto=$PROJECT servicios=$SVC_B/$SVC_F"
echo "backend  workdir=$WD_B archivos=${FILES_B[*]} env_files=${ENVF_B[*]:-}"
echo "frontend workdir=$WD_F archivos=${FILES_F[*]} env_files=${ENVF_F[*]:-}"

echo "== persistencia de PDF"
d8 inspect "$CB" --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep -qx /app/generated \
  || fail "/app/generated NO está montado: recrear el contenedor perdería los PDF"
echo "OK /app/generated es un montaje persistente ($(d8 exec "$CB" sh -c 'find /app/generated -type f | wc -l') archivos)"

echo "== base de datos efectiva (identidad comparada con la conexión del backend)"
verify_pg_target || fail "la base indicada no es la del backend G8"
d8 exec "$CB" node -e "const v=process.env.DATABASE_URL; try{const u=new URL(v);console.log('  DATABASE_URL host='+u.hostname,'port='+(u.port||'5432'),'db='+u.pathname.slice(1))}catch{console.log('  DATABASE_URL formato no URL')}"
[ "$(cut -d'|' -f1 "$WORK/pg-identity.txt")" = "$PG_DB" ] || fail "PG_DB no coincide con la base del backend"

echo "== integraciones y geocodificación efectivas (sin secretos; estas variables NO cambian con el release)"
d8 exec "$CB" node -e "const e=process.env; for (const k of ['G1_INTEGRATION_ENABLED','G3_INTEGRATION_ENABLED','GEOCODING_PROVIDER','MAIL_PROVIDER','CONTRACT_SIGNATURE_ENABLED']) console.log(' ',k,'=',e[k]??'(no definida)');
for (const k of ['G1_API_URL','G3_API_URL','GEOCODING_API_URL','FRONTEND_URL']) { const v=e[k]; try{console.log(' ',k, v?new URL(v).origin:'(vacía)')}catch{console.log(' ',k,'formato no URL')} }
for (const k of ['G1_API_KEY','G3_API_KEY','JWT_SECRET']) console.log(' ',k, e[k]?'presente':'AUSENTE');"

echo "== readiness y esquema (transacción READ ONLY del backend actual)"
backend_ready "$CB" || fail "readiness del backend actual no responde 2xx"

echo "== frontend actual: URL de API incrustada y proxy"
d8 exec "$CF" sh -c 'js=$(cat /usr/share/nginx/html/assets/*.js 2>/dev/null); echo "absolutas: $(printf %s "$js" | grep -o "https\{0,1\}://[a-zA-Z0-9.:-]*/api" | sort -u | tr "\n" " ")"; echo "referencias a \"/api\": $(printf %s "$js" | grep -o "\"/api\"" | wc -l)"; grep -h "proxy_pass" /etc/nginx/conf.d/*.conf 2>/dev/null || echo "sin proxy_pass en nginx del frontend"' | tee "$WORK/frontend-api-actual.txt"
current_abs=$(sed -n 's/^absolutas: //p' "$WORK/frontend-api-actual.txt" | xargs)
case "$VITE_API_URL" in
  http*) echo " $current_abs " | grep -q " $VITE_API_URL " || fail "el frontend actual no usa $VITE_API_URL ($current_abs): el bundle nuevo no sería compatible" ;;
  *) [ -z "$current_abs" ] || fail "el frontend actual usa URL absolutas ($current_abs) y el nuevo bundle usa $VITE_API_URL relativa: reconstruir con la URL observada" ;;
esac
echo "OK el bundle nuevo ($VITE_API_URL) coincide con la estrategia del frontend actual"

echo "== base de datos: huella solo lectura"
db_fingerprint | tee "$WORK/db-antes.txt"
grep -q '^columnas_requeridas|0|' "$WORK/db-antes.txt" || fail "faltan columnas que el código nuevo lee (ver columnas_requeridas)"
echo "$SHA" > "$WORK/A_PASS"
echo "== FIN fase A: PASS (sin escrituras fuera de $WORK)"
