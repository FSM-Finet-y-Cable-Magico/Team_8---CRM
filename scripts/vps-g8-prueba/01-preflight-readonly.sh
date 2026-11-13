#!/usr/bin/env bash
# Phase A: read-only inventory of the running G8 containers. Writes only into $WORK.
# Usage: WORK=$HOME/g8-deploy/tk-44c531c-$(date +%Y%m%d-%H%M%S) bash 01-preflight-readonly.sh
source "$(dirname "$0")/00-common.sh"
exec > >(tee "$WORK/01-preflight.txt") 2>&1

echo "== servidor"; hostname; whoami; date -Is
d8 version --format 'daemon g8: server={{.Server.Version}} arch={{.Server.Arch}} os={{.Server.Os}}'
d8 compose version
command -v python3 >/dev/null || { echo "FALTA python3 (necesario para compare.py)"; exit 1; }
df -h "$WORK" | sed 's/^/disco trabajo /'
df -h "$(d8 info --format '{{.DockerRootDir}}')" 2>/dev/null | sed 's/^/disco docker /' || echo "disco docker: no accesible desde el host (revisar espacio libre para ~600 MB de imágenes)"

echo "== contenedores"
d8 ps -a --filter "name=$EXPECTED_PROJECT" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
discover
for c in "$CB" "$CF"; do
  d8 inspect "$c" > "$WORK/$c.inspect.json"; chmod 600 "$WORK/$c.inspect.json"   # contiene variables: no compartir
  d8 inspect "$c" --format 'contenedor={{.Name}} imagen={{.Config.Image}} id={{.Image}} estado={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}} inicio={{.State.StartedAt}}'
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
if d8 inspect "$CB" --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep -qx /app/generated; then
  echo "OK /app/generated es un montaje persistente"
  echo "archivos en /app/generated: $(d8 exec "$CB" sh -c 'find /app/generated -type f | wc -l')"
else
  echo "FAIL /app/generated NO está montado: recrear el contenedor perdería los PDF. DETENER."
fi

echo "== conexiones (solo host/base, sin credenciales)"
d8 exec "$CB" node -e "for (const k of ['DATABASE_URL','G8_GLOBAL_DATABASE_URL']) { const v=process.env[k]; if(!v){console.log(k,'(no definida)');continue;} try{const u=new URL(v);console.log(k,'host='+u.hostname,'port='+(u.port||'5432'),'db='+u.pathname.slice(1))}catch{console.log(k,'formato no URL')} }
for (const k of ['G1_API_URL','G3_API_URL','FRONTEND_URL']) { const v=process.env[k]; try{console.log(k, v?new URL(v).origin:'(vacía)')}catch{console.log(k,'formato no URL')} }"
echo "== readiness y esquema (transacción READ ONLY del backend actual)"
backend_ready "$CB" || echo "FAIL readiness no disponible"

echo "== frontend actual: URL de API incrustada y proxy"
d8 exec "$CF" sh -c 'grep -ho "https\?://[a-zA-Z0-9.:-]*/api" /usr/share/nginx/html/assets/*.js 2>/dev/null | sort -u; echo "referencias a \"/api\": $(cat /usr/share/nginx/html/assets/*.js | grep -o "\"/api\"" | wc -l)"; grep -h "proxy_pass" /etc/nginx/conf.d/*.conf 2>/dev/null || echo "sin proxy_pass en nginx del frontend"; sha256sum /etc/nginx/templates/default.conf.template 2>/dev/null || echo "sin plantilla nginx"'
echo "imagen nueva: bundle con /api relativo (VITE_API_URL=/api); si el actual usa otra URL o proxy_pass, no activar el frontend"

echo "== base de datos: huella solo lectura"
db_fingerprint | tee "$WORK/db-antes.txt"
echo "== FIN fase A (sin escrituras fuera de $WORK)"
