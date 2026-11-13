# Prueba controlada en VPS G8 — rama `fix/tickets-ux-inventario-g8-20261112`

**Versión 2 (12-11-2026).** Estado: kit preparado y probado en una simulación local; **nada se ejecutó en la VPS**.
**Destinatario:** operador autorizado de la VPS G8 (sesión SSH en el servidor correcto).
**Código a desplegar:** `44c531c67482e783d07c5b9aad6d3b584a117b04`. Los commits posteriores de la rama solo agregan este documento y `scripts/vps-g8-prueba/` (sin código de aplicación).
**La fase E (recreación) requiere autorización explícita del propietario G8.** El script se niega a correr sin `CONFIRM_SHA` y sin un preflight en PASS.

## 0. Qué cambia y qué no

- Solo se recrean los contenedores `backend` y `frontend` de `finet-g8-prueba`, con imágenes construidas del SHA anterior. PostgreSQL, G1, G2, G3, sus contenedores y los volúmenes no se tocan.
- Entre `626cf4e7` (imagen citada para la VPS), `main` y el SHA a desplegar **no cambian** `backend/prisma/`, `db/`, los `package-lock.json`, los Dockerfiles ni `frontend/nginx.conf.template`. No hay migración, `db push`, seed ni dependencias nuevas.
- Cambio de contrato interno (API JWT de G8, no S2S): en vista por empresa `GET /customers` devuelve `estado: null`, `estadoGlobalDisponible: false` y `estadosServicioEmpresa`. **Backend y frontend se activan y se revierten juntos.**

## 1. Prohibido

`docker compose down`, `down -v`, `up -V/--renew-anon-volumes`, `restart` de la base, `image prune`, `volume rm`, `prisma migrate/db push`, `seed*`, `cleanup*`, `init-global`, cualquier `INSERT/UPDATE/DELETE/ALTER`, imprimir `docker inspect` completo o `compose config` (contienen secretos), y copiar a chats o tickets los archivos `*.inspect.json` y `config.*.json` del directorio de trabajo (quedan con permisos `600`).
En el smoke **no** pulsar «Generar instalación», «Consultar cierre» ni «Reintentar envío»: crean o consultan OT reales en G3.

## 2. Artefactos

| Artefacto | Valor |
|---|---|
| Imagen backend | `finet-g8-backend:tk-44c531c` · ID local `sha256:79e036fa8ad45909001e67795a2a7761e752f8b57073258876f2bd714d781877` · configuración `sha256:d53893acbaff2388b97123d275b14a26bc3db00973070614a06e46d9aa11ca4d` |
| Imagen frontend | `finet-g8-frontend:tk-44c531c` · ID local `sha256:35ffdea3b76d55b3bed28fe82944bb79bdc902075e3a08f42c8761cb02d57d6d` · configuración `sha256:5f0408421979e783b96e4211a9ce3fc50d8a0563d9ca44c724f4131451046755` |
| Etiqueta de revisión (ambas) | `org.opencontainers.image.revision=44c531c67482e783d07c5b9aad6d3b584a117b04` |
| Plataforma | `linux/amd64`; motor Prisma `linux-musl-openssl-3.0.x` |
| Frontend | `VITE_API_URL=/api` (relativo); plantilla nginx sha256 `582c78a0c13a7e21f8e8a5dcae209bcfa116ae942ef31b69409a58188ba66678` |
| Paquete | `g8-tk-44c531c-images.tar.gz` · sha256 `cefeb6cc3f9302e7a7075be81095f2a284c020cac318c9e45858576a93d945be` |

Tras `docker load` en un daemon con el almacén clásico, el ID visible es el **digest de configuración**: el ID local de Docker Desktop (containerd) es otro. La prueba de identidad es la etiqueta de revisión, que verifica `03-load-images.sh`.

Si la fase A muestra que el frontend actual tiene una URL de API absoluta o un `proxy_pass` propio, **no activar el frontend**: reconstruirlo con ese valor (`--build-arg VITE_API_URL=<valor>`) y repetir C y D.

## 3. Kit `scripts/vps-g8-prueba/`

| Script | Fase | Efecto |
|---|---|---|
| `00-common.sh` | — | Definiciones. Toma proyecto, `working_dir`, archivos Compose, `env_file` y servicios de las **etiquetas de los contenedores en marcha**; nunca los adivina. |
| `01-preflight-readonly.sh` | A | Solo lectura: imágenes por ID, montajes, redes, puertos, nombres de variables (sin valores), persistencia de `/app/generated`, host y base de las conexiones (sin credenciales), `/api/ready` (comprobación de esquema en transacción `READ ONLY`), URL de API y proxy del frontend, y huella de datos `db-antes.txt`. |
| `02-backup.sh` | B | `pg_dump -Fc` verificado con `pg_restore --list`; copia de `/app/generated` con manifiesto sha256 y **prueba de recuperación** (extrae y verifica cada hash); etiqueta `rollback-<TS>` y `docker save` verificado de las imágenes actuales; deja `rollback.env`. |
| `03-load-images.sh` | C | Verifica el sha256 del paquete, hace `docker load` y exige revisión = SHA y la misma arquitectura en las dos imágenes. |
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
# 0. Transferir por el canal SSH autorizado (scp/rsync) a ~/g8-deploy/kit-44c531c/:
#    scripts/vps-g8-prueba/* + g8-tk-44c531c-images.tar.gz + g8-tk-44c531c-images.tar.gz.sha256
cd ~/g8-deploy/kit-44c531c
export WORK=$HOME/g8-deploy/tk-44c531c-$(date +%Y%m%d-%H%M%S)
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
CONFIRM_SHA=44c531c67482e783d07c5b9aad6d3b584a117b04 bash 05-activate.sh
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
