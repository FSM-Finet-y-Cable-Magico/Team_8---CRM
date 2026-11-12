# Prueba controlada en VPS G8 — rama `fix/tickets-ux-inventario-g8-20261112`

**Fecha:** 12-11-2026 · **Estado:** PREPARADO, NO EJECUTADO. Ningún comando de esta guía se ejecutó en la VPS.
**Destinatario:** operador autorizado de la VPS G8 (sesión SSH en el servidor correcto).
**Requisito para ejecutar la fase E:** autorización humana explícita del propietario G8 para este SHA.

## 0. Qué se despliega y qué no

- Rama derivada de `origin/main` `1db945341b6df6d8369d2aeddff5c4af343a3383`, sin merge, sin PR #81 ni baja por morosidad.
- Commits: TK-01, TK-02/TK-05, TK-04, TK-08/TK-09 (+ ajuste de spec), TK-07 y este documento. El SHA a construir es el `HEAD` publicado de la rama (se informa en la entrega). Las imágenes se construyen **desde ese SHA exacto**.
- **Sin cambios** en `backend/prisma/`, `db/`, `package-lock.json` ni Dockerfiles: no requiere migración, `db push`, seed ni dependencias nuevas. Si alguna verificación muestra lo contrario, **ABORTAR**.
- Cambio de contrato interno backend→frontend (solo API JWT de G8, no S2S): en vista por empresa `GET /customers` devuelve `estado: null`, `estadoGlobalDisponible: false` y `estadosServicioEmpresa: string[]` en lugar del marcador `'Restringido por empresa'`. Consolidado devuelve `estadoGlobalDisponible: true`.
  - **Backend y frontend se despliegan y revierten juntos.** Frontend antiguo + backend nuevo muestra «Sin dato» en vista empresa; frontend nuevo + backend antiguo mostraría el marcador antiguo como estado.
- Solo se recrean `backend` y `frontend` de `finet-g8-prueba`. PostgreSQL, G1, G2, G3 y sus contenedores no se tocan.

## 1. Prohibido en todo el procedimiento

`docker compose down`, `down -v`, `restart` de la base, `docker image prune`, `docker volume rm`, `prisma migrate deploy`, `prisma db push`, `npm run seed*`, `cleanup*`, `db:bootstrap:local`, `init-global`, cualquier `UPDATE/DELETE/ALTER` en PostgreSQL, imprimir `docker inspect ... .Config.Env`, `docker compose config` sin `--quiet` o sin filtrar `environment`, y copiar secretos al chat o a tickets.

En el smoke **no** pulsar «Generar instalación», «Consultar cierre» ni «Reintentar envío» salvo con un contrato QA designado y coordinado con G3 (crean/consultan OT reales).

## 2. Fase A — Inventario solo lectura en la VPS

```bash
hostname; whoami; pwd
d8() { docker --host unix:///run/user/1000/docker.sock "$@"; }
TS=$(date +%Y%m%d-%H%M%S)
WORK="$HOME/g8-deploy/tk-$TS"; mkdir -p "$WORK" && chmod 700 "$WORK"

d8 version --format 'server={{.Server.Version}} arch={{.Server.Arch}}'
d8 ps --filter 'name=finet-g8-prueba' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

for c in finet-g8-prueba-backend-1 finet-g8-prueba-frontend-1; do
  d8 inspect "$c" --format '{{.Name}} | cfg={{.Config.Image}} | id={{.Image}} | {{.State.Status}} | health={{if .State.Health}}{{.State.Health.Status}}{{end}}'
  d8 inspect "$c" --format 'project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}}'
  d8 inspect "$c" --format 'workdir={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
  d8 inspect "$c" --format 'files={{index .Config.Labels "com.docker.compose.project.config_files"}}'
  d8 inspect "$c" --format 'envfiles={{index .Config.Labels "com.docker.compose.project.environment_file"}}'
  d8 inspect "$c" --format '{{range .Mounts}}mount {{.Type}} {{.Name}} {{.Source}} -> {{.Destination}} rw={{.RW}}{{println}}{{end}}'
  d8 inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}net {{$k}}{{println}}{{end}}{{range $p,$b := .HostConfig.PortBindings}}port {{$p}} {{$b}}{{println}}{{end}}restart={{.HostConfig.RestartPolicy.Name}}'
  # Solo NOMBRES de variables y un hash de los valores: nunca los valores.
  d8 inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort > "$WORK/$c.env-names.txt"
  d8 inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | sort | sha256sum | cut -c1-16 > "$WORK/$c.env-hash.txt"
done
```

Registrar en `$WORK/estado-inicial.txt` (sin secretos): nombre e **ID inmutable** de cada imagen, proyecto, servicio, `working_dir`, lista exacta de `config_files` y `environment_file`, mounts, redes, puertos y arquitectura.

**Parar** si: el proyecto no es `finet-g8-prueba`, el servidor o usuario no son los esperados, algún contenedor no está `running/healthy`, o `/app/generated` no está montado como volumen persistente.

URL de API incrustada en el frontend actual (el build nuevo debe usar la misma):

```bash
d8 exec finet-g8-prueba-frontend-1 sh -c 'grep -ho "https\?://[a-zA-Z0-9.:-]*/api" /usr/share/nginx/html/assets/*.js | sort -u'
# Sin resultado => el bundle usa "/api" relativo detrás del proxy actual (VITE_API_URL vacío o /api).
```

Línea base de datos **solo lectura** (conteos y hashes, sin RUT ni PII en pantalla). Verificar antes qué daemon aloja `finet-postgres-global` (`docker ps` o `d8 ps`) y usar el mismo:

```bash
docker exec finet-postgres-global psql -X -v ON_ERROR_STOP=1 -U finet_db_admin -d finet_global_validacion -At -c "
BEGIN READ ONLY;
SELECT 'prospecto', count(*), md5(coalesce(string_agg(id_prospecto||':'||coalesce(estado_pipeline,'')||':'||coalesce(rut,''), '|' ORDER BY id_prospecto),'')) FROM public.prospecto
UNION ALL SELECT 'cotizacion', count(*), md5(coalesce(string_agg(id_cotizacion::text, '|' ORDER BY id_cotizacion),'')) FROM public.cotizacion
UNION ALL SELECT 'contrato', count(*), md5(coalesce(string_agg(id_contrato||':'||coalesce(estado,''), '|' ORDER BY id_contrato),'')) FROM public.contrato
UNION ALL SELECT 'cliente', count(*), md5(coalesce(string_agg(id_cliente||':'||estado||':'||coalesce(rut,''), '|' ORDER BY id_cliente),'')) FROM public.cliente
UNION ALL SELECT 'servicio_contratado', count(*), md5(coalesce(string_agg(id_servicio||':'||estado_operativo, '|' ORDER BY id_servicio),'')) FROM public.servicio_contratado
UNION ALL SELECT 'integracion_instalacion_g3', count(*), md5(coalesce(string_agg(id_integracion::text, '|' ORDER BY id_integracion),'')) FROM public.integracion_instalacion_g3;
COMMIT;" | tee "$WORK/db-antes.txt"
```

Si algún nombre de tabla/columna no coincide con la base real, ajustar solo la consulta de lectura; no crear objetos.

## 3. Fase B — Respaldos nuevos y verificados (antes de recrear)

```bash
BK="$WORK/backup"; mkdir -p "$BK" && chmod 700 "$BK"

# 1) Dump consistente (formato custom) y verificación de que es legible.
docker exec finet-postgres-global pg_dump -U finet_db_admin -d finet_global_validacion -Fc > "$BK/finet_global_validacion-$TS.dump"
test -s "$BK/finet_global_validacion-$TS.dump" && docker exec -i finet-postgres-global pg_restore --list < "$BK/finet_global_validacion-$TS.dump" | head -5

# 2) PDFs/constancias del volumen /app/generated (copia desde el contenedor en marcha).
d8 cp finet-g8-prueba-backend-1:/app/generated "$BK/generated"
( cd "$BK/generated" && find . -type f | sort | xargs -r sha256sum ) > "$BK/generated.sha256"
wc -l "$BK/generated.sha256"
tar -C "$BK" -czf "$BK/generated-$TS.tar.gz" generated && tar -tzf "$BK/generated-$TS.tar.gz" | wc -l

# 3) Proteger las imágenes actuales para rollback (usar los IDs de la fase A).
d8 tag <ID_IMAGEN_BACKEND_ACTUAL>  finet-g8-backend:rollback-$TS
d8 tag <ID_IMAGEN_FRONTEND_ACTUAL> finet-g8-frontend:rollback-$TS
d8 image inspect finet-g8-backend:rollback-$TS finet-g8-frontend:rollback-$TS --format '{{.Id}}'
```

**Parar** si el dump está vacío o `pg_restore --list` falla, si el número de archivos de `generated` es 0 cuando la instancia tiene PDF históricos, o si los tags de rollback no apuntan a los IDs de la fase A. Los respaldos antiguos no reemplazan esta toma.

## 4. Fase C — Construcción de imágenes del mismo SHA (equipo de desarrollo)

En una máquina con Docker y desde una **exportación limpia** del SHA aprobado (no desde un checkout con cambios):

```bash
SHA=<SHA_COMPLETO_APROBADO>; SHA7=${SHA:0:7}; ARCH=linux/<arch de la fase A, p. ej. amd64>
API_URL=<valor observado en la fase A; vacío si el bundle usa /api relativo>
SRC=$(mktemp -d); git archive "$SHA" | tar -x -C "$SRC"

docker build --platform "$ARCH" --target prod \
  --label org.opencontainers.image.revision="$SHA" --label org.opencontainers.image.source=fix/tickets-ux-inventario-g8-20261112 \
  -t finet-g8-backend:tk-$SHA7 "$SRC/backend"
docker build --platform "$ARCH" --target prod --build-arg VITE_API_URL="$API_URL" \
  --label org.opencontainers.image.revision="$SHA" --label org.opencontainers.image.source=fix/tickets-ux-inventario-g8-20261112 \
  -t finet-g8-frontend:tk-$SHA7 "$SRC/frontend"

docker save finet-g8-backend:tk-$SHA7 finet-g8-frontend:tk-$SHA7 | gzip > g8-tk-$SHA7.tar.gz
sha256sum g8-tk-$SHA7.tar.gz > g8-tk-$SHA7.tar.gz.sha256
```

Transferir ambos archivos a `$WORK/` por el canal SSH ya autorizado (p. ej. `scp`) y en la VPS:

```bash
cd "$WORK" && sha256sum -c g8-tk-$SHA7.tar.gz.sha256
gunzip -c g8-tk-$SHA7.tar.gz | d8 load
for i in finet-g8-backend:tk-$SHA7 finet-g8-frontend:tk-$SHA7; do
  d8 image inspect "$i" --format '{{.Id}} {{.Architecture}} rev={{index .Config.Labels "org.opencontainers.image.revision"}}'
done
```

**Parar** si la revisión de alguna imagen no es exactamente `$SHA`, si las dos difieren entre sí o si la arquitectura no coincide con el daemon. No se usa registro externo salvo que el equipo ya tenga uno autenticado y aprobado.

## 5. Fase D — Override fuera de Git y preflight comparativo

Usar **los archivos exactos de las etiquetas** de la fase A (`config_files`, `environment_file`, `working_dir`). Si backend y frontend tienen listas distintas, mantener dos arreglos.

```bash
PROJECT=finet-g8-prueba
WD=<working_dir de la fase A>
BACK=(-f <archivo1> -f <archivo2> ...)   # config_files del backend, en el mismo orden
C=(-f <archivo1> ...)                     # config_files del frontend
ENVF=(--env-file <environment_file si la etiqueta lo informa>)
OV="$WORK/override.tk-$SHA7.yaml"
cat > "$OV" <<EOF
services:
  <servicio_backend_de_la_etiqueta>:
    image: finet-g8-backend:tk-$SHA7
  <servicio_frontend_de_la_etiqueta>:
    image: finet-g8-frontend:tk-$SHA7
EOF
RB="$WORK/override.rollback-$TS.yaml"
sed -e "s#finet-g8-backend:tk-$SHA7#finet-g8-backend:rollback-$TS#" -e "s#finet-g8-frontend:tk-$SHA7#finet-g8-frontend:rollback-$TS#" "$OV" > "$RB"

cc() { d8 compose -p "$PROJECT" --project-directory "$WD" "${ENVF[@]}" "$@"; }
cc "${BACK[@]}" -f "$OV" config --quiet && cc "${C[@]}" -f "$OV" config --quiet && cc "${BACK[@]}" -f "$RB" config --quiet

# Estructura sin environment: la única diferencia esperada es la línea image.
strip='del(.services[].environment)'
diff <(cc "${BACK[@]}" config --format json | jq -S "$strip") <(cc "${BACK[@]}" -f "$OV" config --format json | jq -S "$strip")
diff <(cc "${C[@]}"    config --format json | jq -S "$strip") <(cc "${C[@]}"    -f "$OV" config --format json | jq -S "$strip")
# Environment idéntico (solo hashes).
for f in "" "-f $OV"; do cc "${BACK[@]}" $f config --format json | jq -S '.services[].environment' | sha256sum | cut -c1-16; done

# Plan de Compose: solo deben recrearse los dos servicios G8.
cc "${BACK[@]}" -f "$OV" up --dry-run -d --no-deps --no-build --pull never <servicio_backend>
cc "${C[@]}"    -f "$OV" up --dry-run -d --no-deps --no-build --pull never <servicio_frontend>
```

**Parar** si `diff` muestra algo distinto de `image`, si los hashes de environment difieren, si el dry-run planea recrear otro servicio, red o volumen, o si un volumen nuevo/vacío quedaría montado sobre `/app/generated`. (Si `jq` no existe en la VPS, usar `python3 -c` equivalente; no imprimir `environment`.) Si el `config` actual difiere de lo que corre (archivos cambiados desde el último `up`), detenerse y revisar antes: el `up` aplicaría también esos cambios.

## 6. Fase E — Recreación (requiere autorización explícita)

```bash
cc "${BACK[@]}" -f "$OV" up -d --no-deps --no-build --pull never <servicio_backend>
# Esperar healthy del backend antes de seguir:
d8 inspect finet-g8-prueba-backend-1 --format '{{.Config.Image}} {{.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
d8 logs --since 5m finet-g8-prueba-backend-1 2>&1 | grep -Ei 'error|migrat|prisma' | head -20   # revisar que no haya secretos antes de compartir

cc "${C[@]}" -f "$OV" up -d --no-deps --no-build --pull never <servicio_frontend>
d8 ps --filter 'name=finet-g8-prueba' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
for c in finet-g8-prueba-backend-1 finet-g8-prueba-frontend-1; do
  d8 inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort | diff - "$WORK/$c.env-names.txt" && echo "$c env-names OK"
  d8 inspect "$c" --format '{{range .Mounts}}mount {{.Type}} {{.Name}} -> {{.Destination}}{{println}}{{end}}'
done
```

El hash de valores de entorno puede variar solo por variables propias de la imagen (`PATH`, `NODE_VERSION`, `NGINX_VERSION`); los **nombres** deben coincidir y los mounts deben ser los mismos de la fase A.

## 7. Fase F — Smoke y puertas de salida

Técnico: backend `healthy`, `GET /api/health` 200, frontend `/health` 200, login correcto, mismos mounts, `d8 cp finet-g8-prueba-backend-1:/app/generated` con el mismo `sha256` de la fase B para archivos preexistentes, y repetir la consulta de la fase A: **conteos y hashes idénticos** en `prospecto`, `cotizacion`, `contrato`, `cliente`, `servicio_contratado` e `integracion_instalacion_g3` (el login escribe `log_auditoria`, que no se compara).

Funcional por ticket (Desktop y móvil, sin escrituras salvo las autorizadas):

| Ticket | Comprobación |
|---|---|
| TK-01 | Clientes → «Ver pendientes de activación» → Gestionar: en el mismo modal aparece el estado de instalación; sin tracking se ve «Generar instalación» (no pulsar); con tracking se ve la OT existente; no aparece «Opciones de instalación»; el icono de refresco solo consulta. Rol sin permiso: botón bloqueado con aviso. |
| TK-02/05 | Consolidado vs. cada empresa: columna «Estado del cliente» vs. «Estado del servicio en esta empresa»; nunca «Restringido por empresa» ni «Estado global no compartido»; filtro con solo valores reales; mismo RUT/nombre/contacto del cliente compartido en ambas empresas. |
| TK-04 | Prospecto de origen web con RUT sin guion se ve `cuerpo-DV`; buscar con `123456785`, `12345678-5` y `12.345.678-5` encuentra el mismo; un RUT con DV inválido se ve tal cual. |
| TK-07 | Lápiz de prospecto: diseño equivalente al editor de clientes; cancelar no guarda; con contrato el editor sigue bloqueado. Guardar solo con prospecto QA autorizado. |
| TK-08/09 | Inventario: «Catálogo de tipos de equipo» con aclaración de que no es stock; «Consultar unidad física» con una serie autorizada muestra la ficha en el panel; faltantes «No informado»; cambiar de empresa limpia la ficha. |
| Integridad | Firma/PDF históricos accesibles, cotizaciones y contratos con los mismos conteos, Tickets y facturación sin cambios. |

**Abortar y revertir** si falla el login, cambia algún hash de la fase A, faltan PDF, se pierde aislamiento por empresa, deja de funcionar firma/contratos/pagos, caen integraciones o G3 recibe solicitudes no autorizadas. HTTP 200 por sí solo no acredita el arreglo.

## 8. Rollback (solo imágenes G8; sin tocar la base)

```bash
cc "${BACK[@]}" -f "$RB" up -d --no-deps --no-build --pull never <servicio_backend>
cc "${C[@]}"    -f "$RB" up -d --no-deps --no-build --pull never <servicio_frontend>
d8 ps --filter 'name=finet-g8-prueba' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Revertir **ambos** servicios juntos (ver §0). No restaurar el dump, no ejecutar `DROP` ni deshacer esquema por un rollback de UI: la rama no cambia esquema ni datos. Si entre el despliegue y el rollback se registraron datos nuevos, conservarlos; ambas versiones leen el mismo esquema.

## 9. Evidencia a entregar

SHA, IDs y etiquetas de las dos imágenes nuevas y de las de rollback, salida sanitizada de las fases A/D/E, `db-antes.txt` vs. `db-despues.txt`, cantidad y hash de `generated`, capturas por ticket (Desktop/móvil) y lista de desviaciones. La prueba en VPS es validación de aceptación; no autoriza merge a `main`/`develop`.
