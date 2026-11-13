# Prueba controlada en VPS G8 — rama `fix/tickets-ux-inventario-g8-20261112`

> **OBSOLETO (13-11-2026).** Este runbook y el kit v3 (SHA fijo 9e063480, imágenes tk-9e06348) no deben usarse. El release vigente usa el kit v4: [vps-release-tickets-g8-20261113.md](vps-release-tickets-g8-20261113.md).

**Versión 3 (12-11-2026).** Estado: kit preparado y probado en una simulación local; la rama se validó en navegador sobre una QA aislada (§6). **Nada se ejecutó en la VPS**.
**Destinatario:** operador autorizado de la VPS G8 (sesión SSH en el servidor correcto).
**Código a desplegar:** `9e06348019e16e5fe40a6e09a2d7171d552169f5`: los 7 tickets más la corrección TK-02 de servicios por empresa que encontró la validación en navegador. Los commits posteriores de la rama solo tocan este documento y `scripts/vps-g8-prueba/`, sin código de aplicación.
**La fase E (recreación) requiere autorización explícita del propietario G8.** El script se niega a correr sin `CONFIRM_SHA` y sin un preflight en PASS.

## 0. Qué cambia y qué no

- Solo se recrean los contenedores `backend` y `frontend` de `finet-g8-prueba`, con imágenes construidas del SHA anterior. PostgreSQL, G1, G2, G3, sus contenedores y los volúmenes no se tocan.
- Entre `626cf4e7` (imagen citada para la VPS), `main` y `9e063480` **no cambian** `backend/prisma/`, `db/`, los `package-lock.json`, los Dockerfiles ni `frontend/nginx.conf.template`. No hay migración, `db push`, seed ni dependencias nuevas.
- Cambios de contrato interno (API JWT de G8, no S2S):
  - En vista por empresa, `GET /customers` devuelve `estado: null`, `estadoGlobalDisponible: false` y `estadosServicioEmpresa`.
  - `GET /services/customer/:id` acepta un `scope` opcional, que solo filtra para el administrador.

  **Backend y frontend se activan y se revierten juntos.**

## 1. Prohibido

`docker compose down`, `down -v`, `up -V/--renew-anon-volumes`, `restart` de la base, `image prune`, `volume rm`, `prisma migrate/db push`, `seed*`, `cleanup*`, `init-global`, cualquier `INSERT/UPDATE/DELETE/ALTER`, imprimir `docker inspect` completo o `compose config` (contienen secretos), y copiar a chats o tickets los archivos `*.inspect.json` y `config.*.json` del directorio de trabajo (quedan con permisos `600`).
En el smoke **no** pulsar «Generar instalación», «Consultar cierre» ni «Reintentar envío»: crean o consultan OT reales en G3.

## 2. Artefactos

| Artefacto | Valor |
|---|---|
| Imagen backend | `finet-g8-backend:tk-9e06348` · ID local `sha256:1e4a702036e87224a42af15e94ccbbe9880c9d98672ab0691dd77da3a5ddae90` · configuración `sha256:9cc40bb2046d2e4062bc2dd921ac9b093743a5f5c4da5d2391ad772054a9cba0` |
| Imagen frontend | `finet-g8-frontend:tk-9e06348` · ID local `sha256:5553a6a817a15ced507bcc4a1601225ea498901c3e369807a229492772a19680` · configuración `sha256:872395b3fa210efb7e0b36ad92b7b54d13f2c75c05844eee45a1cd52c67896ca` |
| Etiqueta de revisión (ambas) | `org.opencontainers.image.revision=9e06348019e16e5fe40a6e09a2d7171d552169f5` |
| Plataforma | `linux/amd64`; motor Prisma `linux-musl-openssl-3.0.x` |
| Frontend | `VITE_API_URL=/api` (relativo; etiqueta `cl.finet.g8.vite-api-url`); bundle sin rutas de unidad Windows (lo verifica `03`) |
| Paquete | `g8-tk-9e06348-images.tar.gz` · sha256 `32be9b95aa4bb2d9682f9980dbacf7f109d7fec14361422d4d86cfc7e29b5c98` |

**Imágenes anteriores descartadas:** `tk-44c531c`. Su frontend quedó defectuoso: Git Bash convirtió `--build-arg VITE_API_URL=/api` en `D:/Git/api` y el login fallaba con «Unsupported protocol D:». La prueba en navegador lo detectó. Al construir desde Git Bash en Windows hay que exportar `MSYS_NO_PATHCONV=1`; `03-load-images.sh` ahora rechaza un bundle con rutas de unidad.

Tras `docker load` en un daemon con el almacén clásico, el ID visible es el **digest de configuración**: el ID local de Docker Desktop (containerd) es otro. La prueba de identidad es la etiqueta de revisión, que verifica `03-load-images.sh`.

Si la fase A muestra que el frontend actual tiene una URL de API absoluta o un `proxy_pass` propio, **no activar el frontend**: reconstruirlo con ese valor (`--build-arg VITE_API_URL=<valor>`) y repetir C y D.

## 3. Kit `scripts/vps-g8-prueba/`

| Script | Fase | Efecto |
|---|---|---|
| `00-common.sh` | — | Definiciones. Toma proyecto, `working_dir`, archivos Compose, `env_file` y servicios de las **etiquetas de los contenedores en marcha**; nunca los adivina. |
| `01-preflight-readonly.sh` | A | Solo lectura: imágenes por ID, montajes, redes, puertos, nombres de variables (sin valores), persistencia de `/app/generated`, host y base de las conexiones (sin credenciales), `/api/ready` (comprobación de esquema en transacción `READ ONLY`), URL de API y proxy del frontend, y huella de datos `db-antes.txt`. |
| `02-backup.sh` | B | `pg_dump -Fc` verificado con `pg_restore --list`; copia de `/app/generated` con manifiesto sha256 y **prueba de recuperación** (extrae y verifica cada hash); etiqueta `rollback-<TS>` y `docker save` verificado de las imágenes actuales; deja `rollback.env`. |
| `03-load-images.sh` | C | (1) Integridad: sha256 y gzip del paquete, luego `docker load`. (2) Revisión = SHA y misma arquitectura que el daemon, en las dos imágenes. (3) Compatibilidad: backend y frontend deben compartir revisión, origen, rama y fecha del commit. (4) URL de API: la etiqueta `vite-api-url` debe ser igual a `EXPECTED_VITE_API_URL` (por defecto `/api`, valor observado en la fase A) y el bundle no puede contener rutas de unidad Windows ni URL absolutas de API distintas. Se probó con la imagen válida y con dos negativos (`D:/Git/api` y una URL absoluta). |
| `04-preflight-compose.sh` | D | Crea los overrides fuera de Git y compara con `compare.py` los **contenedores en marcha** contra lo que Compose crearía: (1) sin override, para descartar diferencias acumuladas; (2) con override, donde solo puede cambiar la imagen; (3) con override de rollback. Luego ejecuta `up --dry-run`. Si todo pasa, deja `PREFLIGHT_PASS`. |
| `compare.py` | D | Imagen; variables efectivas (ENV de la imagen nueva + `environment`/`env_file` resueltos, comparados por igualdad **sin imprimir valores**); montajes por destino, tipo, origen y solo-lectura (incluidos volúmenes con nombre y `secrets`); redes; puertos; `Cmd/Entrypoint/WorkingDir/User`; `restart`; `ExposedPorts`; healthcheck. Exige que `/app/generated` siga montado. |
| `05-activate.sh` | E | **Bloqueado** sin `CONFIRM_SHA` y `PREFLIGHT_PASS`. `up -d --no-deps --no-build --pull never`: primero backend (espera salud y `/api/ready`) y después frontend; termina con `07`. |
| `06-rollback.sh` | R | Vuelve a las imágenes `rollback-<TS>` (o las recupera del `docker save` verificado), con los mismos montajes, redes y variables; termina con `07`. |
| `07-postcheck.sh` | E/R | Imagen y revisión, nombres de variables, montajes idénticos a la fase A, `/api/ready`, PDF preexistentes por sha256 y huella de datos idéntica a `db-antes.txt`. |
| `db-fingerprint.sql` | A/E/R | `BEGIN READ ONLY`: conteo + md5 de `prospecto`, `cotizacion`, `contrato`, `cliente`, `servicio_contratado`, `integracion_instalacion_g3` y `orden_trabajo`; verifica las columnas que leen los cambios TK-02/TK-04. |

**Prueba local del kit** (Docker Desktop, proyecto simulado `g8kit-test` con PostgreSQL desechable, backend y frontend reales, e imágenes «anteriores» distintas):
- Ciclo A→B→C→D→E→post-check→rollback→post-check: todo **PASS**.
- Negativos del preflight: variable con otro valor (FAIL, sin imprimir el valor), volumen de PDF eliminado (FAIL), volumen de PDF con otro nombre (FAIL), activación sin `CONFIRM_SHA` (bloqueada, exit 2).
- La prueba corrigió cuatro defectos del kit antes de entregarlo:
  1. un volumen con nombre ausente se clasificaba como anónimo;
  2. faltaba esperar `/api/ready` tras recrear;
  3. una línea vacía en la lista de variables daba un falso aviso;
  4. el formato de los manifiestos sha256 no se normalizaba.

## 4. Procedimiento en la VPS

```bash
# 0. Transferir por el canal SSH autorizado (scp/rsync) a ~/g8-deploy/kit-9e06348/:
#    scripts/vps-g8-prueba/* + g8-tk-9e06348-images.tar.gz + g8-tk-9e06348-images.tar.gz.sha256
cd ~/g8-deploy/kit-9e06348
export WORK=$HOME/g8-deploy/tk-9e06348-$(date +%Y%m%d-%H%M%S)
# Opcionales si difieren: G8_DOCKER_HOST (por defecto unix:///run/user/1000/docker.sock),
# PG_CONTAINER, PG_USER, PG_DB, CB, CF, EXPECTED_PROJECT.

bash 01-preflight-readonly.sh     # A — revisar 01-preflight.txt
bash 02-backup.sh                 # B — exige OK de recuperación de PDF y de imágenes
bash 03-load-images.sh            # C — exige "OK ambas imágenes son de la revisión ..."
bash 04-preflight-compose.sh      # D — exige "RESULTADO PREFLIGHT: PASS"
```

**Detenerse** si la fase A informa `FAIL /app/generated NO está montado`, si `/api/ready` no responde o informa `database: DOWN`, si el frontend actual usa una URL absoluta o un `proxy_pass` propio (ver §2), si algún paso de B falla, o si D no termina en PASS. Para la compatibilidad de esquema, registrar en A `global_schema`, `missing_columns` y `different_columns`: la imagen nueva usa el mismo esquema que la actual, así que esos valores deben repetirse después de E. Además `columnas_requeridas` debe ser `0`.

Entregar para la autorización: `01-preflight.txt`, `02-backup.txt`, `03-load.txt`, `04-preflight-compose.txt` y `rollback.env`. Son salidas saneadas; los JSON y `backup/` no se comparten.

### Activación (solo con autorización explícita)

```bash
CONFIRM_SHA=9e06348019e16e5fe40a6e09a2d7171d552169f5 bash 05-activate.sh
```

### Rollback

```bash
bash 06-rollback.sh
```

El rollback revierte **ambos** servicios. No restaura el dump, no hace `DROP` ni deshace esquema: la rama no cambia esquema ni datos. Los datos creados entre la activación y el rollback se conservan.

## 5. Smoke funcional (después de E; Desktop 1440×900 y móvil 390×844)

| Ticket | Comprobación | No hacer |
|---|---|---|
| TK-01 | Clientes → «Ver pendientes de activación» → Gestionar: la instalación aparece en el mismo modal; sin tracking se ve «Generar instalación» y el aviso «No activa el servicio»; con tracking se ve la OT existente sin opción de generar otra; no existe «Opciones de instalación»; el icono de refresco solo consulta (GET). Con un rol sin permiso, el botón aparece deshabilitado y con aviso. | Pulsar «Generar instalación» / «Consultar cierre» |
| TK-02/05 | Consolidado: columna «Estado del cliente». Cada empresa: «Estado del servicio en esta empresa». Nunca «Restringido por empresa» ni «Estado global no compartido». El filtro solo ofrece valores reales. El cliente compartido muestra el mismo RUT, nombre y contacto en ambas empresas. | Cambiar estados |
| TK-04 | Un prospecto web con RUT sin guion se ve `cuerpo-DV`; `123456785`, `12345678-5` y `12.345.678-5` encuentran el mismo; un DV inválido se ve tal cual. | Editar RUT |
| TK-07 | El lápiz del prospecto abre un diseño equivalente al editor de clientes; cancelar no guarda; con contrato, el editor sigue bloqueado. | Guardar salvo en un prospecto QA autorizado |
| TK-08/09 | «Catálogo de tipos de equipo» con el aviso de que no es stock; «Consultar unidad física» con una serie autorizada muestra la ficha en el panel; los faltantes dicen «No informado»; cambiar de empresa limpia la ficha. | — |
| Integridad | Firma y PDF históricos accesibles; cotizaciones y contratos con los mismos conteos; Tickets y facturación sin cambios; consola del navegador sin errores nuevos. | — |

**Abortar y ejecutar `06-rollback.sh`** si falla el login, `07` informa FAIL en montajes o PDF, la huella de datos cambia sin operaciones legítimas de usuarios en la ventana, se pierde el aislamiento por empresa, fallan la firma, los contratos o los pagos, o G3 recibe solicitudes no autorizadas. Coordinar una ventana sin uso concurrente del CRM de prueba. La prueba en VPS es validación de aceptación; no autoriza merge.

## 6. Validación en navegador sobre QA aislada (12-11-2026)

**Entorno**
- Proyecto Docker `g8tk-qa-local`, con nombres, volúmenes, puertos (`127.0.0.1:18480/18441`) y credenciales propios y aleatorios.
- PostgreSQL desechable con `db/init`, las migraciones del repo y `db/seed-crm-local.sql` (datos ficticios), más fixtures por ticket.
- Imágenes `tk-9e06348`.
- Backend en una red sin salida a internet; G1 y G3 reemplazados por un simulador local en `127.0.0.1` del mismo contenedor.
- Correo, firma, facturación y WhatsApp desactivados.

**Resultado:** Edge 157 (Playwright), escritorio 1440×900 y móvil 390×844: 90 comprobaciones, 0 FAIL.

**Errores de consola:** solo recursos externos bloqueados a propósito (fuentes y teselas OSM) y los 404/403/503 esperados de las búsquedas negativas de inventario.

**Hallazgos corregidos durante la validación**
- Frontend `tk-44c531c` defectuoso (ver §2).
- En vista de empresa, el administrador veía servicios de otras empresas en la ficha del cliente (commit `9e063480`). Para los demás roles el aislamiento ya era correcto.

**Diferencias de la ruta local** (no afectan a la VPS): `db/init` difiere del esquema global (`/api/ready` informa `DEGRADED`); además faltaba `orden_trabajo.cierre_equipos` y los nombres de empresa no coincidían con el seed. Se ajustaron solo en la base desechable.
