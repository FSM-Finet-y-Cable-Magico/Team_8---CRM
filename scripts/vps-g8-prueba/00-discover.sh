#!/usr/bin/env bash
# Phase 0 — READ-ONLY discovery on the VPS (run as the administrator, e.g. with sudo). Writes nothing outside $OUT.
# Finds the Docker daemons (rootful and rootless), the real G8 backend/frontend containers, the database the backend
# really uses, its PostgreSQL container, persistent mounts and the effective state of G1, G3, geocoding, SMTP and
# signature. Secret values are never printed: only presence, URL origins, hosts/ports and flags.
#
# Usage (first pass, inventory):            sudo OUT=/root/g8-discover bash 00-discover.sh
# Usage (second pass, once CB is known):    sudo OUT=/root/g8-discover G8_DOCKER_HOST=unix:///run/user/1000/docker.sock CB=<backend> CF=<frontend> bash 00-discover.sh
set -uo pipefail
OUT=${OUT:-$PWD/g8-discover-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$OUT" && chmod 700 "$OUT"
exec > >(tee "$OUT/00-discover.txt") 2>&1

echo "== servidor"; hostname; whoami; date -Is
command -v nginx >/dev/null && { nginx -t 2>&1 | tail -2; } || echo "nginx no está en PATH (puede ir en contenedor)"
command -v ss >/dev/null && ss -lntp 2>/dev/null | grep -E ':(8843|8143|8343|8300|8305|15432)\b' | sed 's/users:.*//' || true

echo "== daemons Docker visibles"
hosts=()
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 && hosts+=("unix:///var/run/docker.sock")
for s in /run/user/*/docker.sock; do [ -S "$s" ] && hosts+=("unix://$s"); done
[ ${#hosts[@]} -gt 0 ] || { echo "FAIL no se encontró ningún daemon Docker accesible"; exit 1; }
for h in "${hosts[@]}"; do
  owner=$(stat -c %U "${h#unix://}" 2>/dev/null || echo '?')
  echo "--- $h (propietario $owner) $(docker --host "$h" version --format 'server={{.Server.Version}} arch={{.Server.Arch}}' 2>&1 | head -1)"
  docker --host "$h" ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}' 2>/dev/null \
    | awk -F'|' '{printf "  %-40s %-45s %-28s proyecto=%s servicio=%s\n",$1,$2,$3,$4,$5}'
done
echo "Candidatos G8 (nombre/proyecto con g8|finet|crm|team_8):"
for h in "${hosts[@]}"; do
  docker --host "$h" ps -a --format '{{.Names}} {{.Label "com.docker.compose.project"}}' 2>/dev/null | grep -iE 'g8|finet|crm|team_?8' | sed "s#^#  [$h] #"
done
echo "Contenedores PostgreSQL (puertos publicados):"
for h in "${hosts[@]}"; do
  docker --host "$h" ps --format '{{.Names}}|{{.Image}}|{{.Ports}}' 2>/dev/null | grep -i postgres | sed "s#^#  [$h] #"
done

if [ -z "${CB:-}" ] || [ -z "${G8_DOCKER_HOST:-}" ]; then
  echo
  echo "Defina G8_DOCKER_HOST, CB y CF con los valores observados arriba y vuelva a ejecutar para el detalle."
  exit 0
fi

d8() { docker --host "$G8_DOCKER_HOST" "$@"; }
echo
echo "== detalle de $CB / ${CF:-?} en $G8_DOCKER_HOST"
for c in "$CB" ${CF:+"$CF"}; do
  d8 inspect "$c" --format 'contenedor={{.Name}} imagen={{.Config.Image}} id={{.Image}} estado={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}} red={{.HostConfig.NetworkMode}} restart={{.HostConfig.RestartPolicy.Name}}' || continue
  d8 image inspect "$(d8 inspect "$c" --format '{{.Image}}')" --format '  revision={{index .Config.Labels "org.opencontainers.image.revision"}} arch={{.Architecture}} creada={{.Created}}'
  d8 inspect "$c" --format '  compose: proyecto={{index .Config.Labels "com.docker.compose.project"}} servicio={{index .Config.Labels "com.docker.compose.service"}} dir={{index .Config.Labels "com.docker.compose.project.working_dir"}} archivos={{index .Config.Labels "com.docker.compose.project.config_files"}}'
  d8 inspect "$c" --format '{{range .Mounts}}  montaje {{.Type}} {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}} rw={{.RW}}{{println}}{{end}}{{range $p,$b := .HostConfig.PortBindings}}  puerto {{$p}} {{$b}}{{println}}{{end}}{{range $k,$v := .NetworkSettings.Networks}}  red {{$k}} aliases={{$v.Aliases}}{{println}}{{end}}'
done
d8 inspect "$CB" --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep -qx /app/generated \
  && echo "OK /app/generated es persistente ($(d8 exec "$CB" sh -c 'find /app/generated -type f 2>/dev/null | wc -l') archivos)" \
  || echo "FAIL /app/generated NO está montado: recrear el backend perdería PDF y constancias. NO continuar."

echo "== configuración efectiva del backend (sin secretos)"
d8 exec "$CB" node -e '
const e = process.env, show = k => console.log(" ", k.padEnd(34), e[k] === undefined ? "(no definida)" : e[k] === "" ? "(vacía)" : e[k]);
const origin = k => { const v = e[k]; if (!v) return console.log(" ", k.padEnd(34), v === undefined ? "(no definida)" : "(vacía)"); try { console.log(" ", k.padEnd(34), new URL(v).origin); } catch { console.log(" ", k.padEnd(34), "formato no URL"); } };
const secret = k => console.log(" ", k.padEnd(34), e[k] ? "presente" : "AUSENTE");
try { const u = new URL(e.DATABASE_URL); console.log("  DATABASE_URL".padEnd(36), "host=" + u.hostname, "port=" + (u.port || "5432"), "db=" + u.pathname.slice(1), "user=" + decodeURIComponent(u.username)); } catch { console.log("  DATABASE_URL (no definida o no URL)"); }
["NODE_ENV", "PORT", "G1_INTEGRATION_ENABLED", "G3_INTEGRATION_ENABLED", "GEOCODING_PROVIDER", "MAIL_PROVIDER", "CONTRACT_SIGNATURE_ENABLED",
 "CONTRACT_SIGNATURE_LEGAL_APPROVED", "FACTURACION_CL_INTEGRATION_ENABLED", "FACTURACION_CL_PRODUCTION_ENABLED", "PLAN_CHANGE_PROCESSOR_ENABLED",
 "COVERAGE_TECHNICAL_PROVIDER", "TRUST_PROXY_HOPS"].forEach(show);
["G1_API_URL", "G3_API_URL", "GEOCODING_API_URL", "FRONTEND_URL", "CONTRACT_SIGNATURE_PUBLIC_URL", "TOMODAT_API_URL"].forEach(origin);
["JWT_SECRET", "G1_API_KEY", "G3_API_KEY", "G8_INTEGRATION_API_KEYS", "CONTRACT_SIGNATURE_OTP_SECRET", "TOMODAT_API_TOKEN"].forEach(secret);
try { const smtp = JSON.parse(e.SMTP_COMPANIES || "[]"); console.log("  SMTP_COMPANIES".padEnd(36), smtp.length + " empresa(s)", smtp.map(s => `empresa=${s.idEmpresa ?? s.id_empresa ?? "?"} host=${s.host ?? "?"}:${s.port ?? "?"} usuario=${s.user || s.auth?.user ? "presente" : "ausente"} clave=${s.pass || s.password || s.auth?.pass ? "presente" : "ausente"}`).join("; ")); }
catch { console.log("  SMTP_COMPANIES".padEnd(36), "no es JSON válido"); }'

echo "== accesibilidad desde la red del backend (solo GET; claves leídas dentro del contenedor, nunca impresas)"
d8 exec "$CB" node -e '
const e = process.env, t = ms => AbortSignal.timeout(ms);
async function probe(name, url, headers) {
  if (!url) return console.log(" ", name.padEnd(30), "sin URL configurada");
  try { const r = await fetch(url, { headers, signal: t(8000), redirect: "manual" }); console.log(" ", name.padEnd(30), "HTTP " + r.status); }
  catch (err) { console.log(" ", name.padEnd(30), "SIN RESPUESTA (" + (err.cause?.code || err.name) + ")"); }
}
(async () => {
  const g1 = e.G1_API_URL && new URL("/api/integraciones/tipos-equipo?id_empresa=1", e.G1_API_URL).toString();
  await probe("G1 tipos-equipo (empresa 1)", g1, { "X-API-KEY": e.G1_API_KEY || "" });
  const g3 = e.G3_API_URL && new URL("/api/integraciones/categorias-falla", e.G3_API_URL).toString();
  await probe("G3 categorias-falla", g3, { "X-API-KEY": e.G3_API_KEY || "" });
  const provider = (e.GEOCODING_PROVIDER || "").trim().toUpperCase();
  if (provider === "NOMINATIM" || provider === "HTTP") {
    const base = e.GEOCODING_API_URL ? new URL(e.GEOCODING_API_URL) : null;
    await probe("Geocodificador /status", base && new URL(base.pathname.replace(/\/(search|reverse)\/?$/, "") + "/status", base.origin).toString(), { "User-Agent": "Finet-CRM/1.0" });
  } else console.log("  Geocodificación".padEnd(32), "proveedor " + (provider || "(vacío)") + ": ubicación automática DESHABILITADA (solo manual)");
})();'
d8 exec "$CB" node -e '
const net = require("net"); let smtp = []; try { smtp = JSON.parse(process.env.SMTP_COMPANIES || "[]"); } catch {}
if (!smtp.length) console.log("  SMTP: sin empresas configuradas");
for (const s of smtp) { if (!s.host) continue; const sock = net.connect({ host: s.host, port: Number(s.port || 587), timeout: 6000 });
  sock.on("connect", () => { console.log("  SMTP " + s.host + ":" + (s.port || 587) + " acepta conexión TCP (no se autentica ni envía)"); sock.destroy(); });
  sock.on("timeout", () => { console.log("  SMTP " + s.host + " sin respuesta"); sock.destroy(); }); sock.on("error", err => console.log("  SMTP " + s.host + " error " + err.code)); }'

echo "== readiness del backend actual"
d8 exec "$CB" node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(async r=>console.log(' ',r.status,(await r.text()).slice(0,400))).catch(e=>console.log('  ERROR',e.message))"

if [ -n "${CF:-}" ]; then
  echo "== frontend actual: URL de API compilada y proxy"
  d8 exec "$CF" sh -c 'js=$(cat /usr/share/nginx/html/assets/*.js 2>/dev/null); echo "  absolutas: $(printf %s "$js" | grep -o "https\{0,1\}://[a-zA-Z0-9.:-]*/api" | sort -u | tr "\n" " ")"; echo "  relativas \"/api\": $(printf %s "$js" | grep -o "\"/api\"" | wc -l)"; grep -h "proxy_pass\|listen" /etc/nginx/conf.d/*.conf 2>/dev/null | sed "s/^/  nginx: /"'
fi

echo "== base efectiva: contenedor PostgreSQL que corresponde a DATABASE_URL"
read -r DBHOST DBPORT DBNAME < <(d8 exec "$CB" node -e 'try{const u=new URL(process.env.DATABASE_URL);console.log(u.hostname,u.port||"5432",u.pathname.slice(1))}catch{console.log("? ? ?")}')
echo "  el backend se conecta a host=$DBHOST port=$DBPORT db=$DBNAME"
for h in "${hosts[@]}"; do
  docker --host "$h" ps --format '{{.Names}}' 2>/dev/null | while read -r n; do
    img=$(docker --host "$h" inspect "$n" --format '{{.Config.Image}}'); echo "$img" | grep -qi postgres || continue
    aliases=$(docker --host "$h" inspect "$n" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$v.Aliases}} {{end}}')
    published=$(docker --host "$h" inspect "$n" --format '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}')
    match=""
    case " $n $aliases " in *" $DBHOST "*|*"[$DBHOST "*|*" $DBHOST]"*) match="coincide por nombre/alias";; esac
    case "$DBHOST" in 127.0.0.1|localhost|::1) echo " $published " | grep -q ":$DBPORT " && match="publica el puerto $DBPORT en loopback";; esac
    echo "  [$h] $n imagen=$img publica=[$published] ${match:+<= $match}"
  done
done
echo "Verifique el candidato con: PG_DOCKER_HOST=<daemon> PG_CONTAINER=<nombre> PG_USER=<rol> PG_DB=$DBNAME (01-preflight compara la identidad con la conexión del backend)."
echo "== FIN descubrimiento (sin escrituras; salida en $OUT)"
