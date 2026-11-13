# G8 — Release de los siete tickets en la VPS real (kit v4)

**Rama:** `fix/tickets-ux-inventario-g8-20261112`.

**Identidad del release:** el SHA, las imágenes y la URL de API compilada están en `release.env`, dentro del paquete `g8-release-tk-<sha7>.tar.gz`. Ningún script tiene el SHA escrito; todos lo leen de ese archivo y lo comparan con:
- las etiquetas de las imágenes;
- `CONFIRM_SHA`.

**Alcance:** solo se recrean los contenedores **backend y frontend de G8**. No se tocan:
- PostgreSQL, sus datos ni el esquema (sin migraciones ni seeds);
- G1, G2 ni G3;
- los contenedores de otros grupos;
- nginx;
- las variables de entorno.

La baja por morosidad no forma parte de este release.

## 1. Contenido del release

| Ticket o cambio | Qué cambia |
|---|---|
| TK-01 | Instalación pendiente en un único modal con el contrato exacto. CTA «Generar instalación» sin OT duplicada; «Consultar cierre» explícito. |
| TK-02/05 | Estado del cliente frente al estado del servicio por empresa; servicios filtrados por la empresa elegida por el administrador. |
| TK-04 | RUT canónico con guion y búsqueda con o sin puntos/guion. |
| TK-07 | Editor de prospecto con el patrón del editor de clientes. |
| TK-08/09 | Catálogo de tipos de equipo separado de la consulta de unidad física. |
| Geocodificación | `/coverage/geocode` informa el `motivo` (proveedor apagado, mal configurado, caído o sin resultados). La ficha permite marcar el punto en el mapa o con coordenadas. Con `MANUAL` no se ofrece «Reintentar dirección». |
| G1 | Proyección explícita de las respuestas de G1, incluidos los objetos anidados: ningún campo extra (p. ej. `dato_interno`) llega al navegador. Los equipos por servicio con la forma real de G1 (sin `id_empresa`) ya no se rechazan con 403. |

## 2. Transferencia (desde el equipo de desarrollo)

```bash
scp g8-release-tk-<sha7>.tar.gz g8-release-tk-<sha7>.tar.gz.sha256 <admin>@38.7.201.104:/root/g8-release/
```

En la VPS, como administrador:

```bash
cd /root/g8-release && sha256sum -c g8-release-tk-<sha7>.tar.gz.sha256
umask 077 && tar -xzf g8-release-tk-<sha7>.tar.gz && cd kit
sha256sum -c MANIFEST.sha256          # release.env, scripts, runbook e imágenes
cat release.env                       # anotar SHA, BACKEND_IMAGE_ID, FRONTEND_IMAGE_ID y VITE_API_URL
```

## 3. Fase 0 — descubrimiento de solo lectura (obligatoria)

```bash
sudo OUT=/root/g8-discover bash 00-discover.sh
```

La primera pasada lista:
- los daemons Docker (rootful en `/var/run/docker.sock` y rootless en `/run/user/<uid>/docker.sock`), con su propietario;
- todos los contenedores y su proyecto Compose;
- los candidatos G8;
- los contenedores PostgreSQL con sus puertos publicados.

Con lo observado, la segunda pasada da el detalle:

```bash
sudo OUT=/root/g8-discover G8_DOCKER_HOST=<daemon observado> CB=<backend G8> CF=<frontend G8> bash 00-discover.sh
```

**Registrar:**
- imagen y revisión actual;
- montajes, verificando que `/app/generated` es persistente;
- redes y puertos;
- `DATABASE_URL` (solo host, puerto, base y usuario);
- `GEOCODING_PROVIDER` efectivo;
- estado de G1, G3, SMTP y firma;
- accesibilidad desde la red del backend (G1 tipos-equipo y G3 categorias-falla, solo GET);
- URL de API del frontend actual;
- el contenedor PostgreSQL que corresponde a la conexión del backend.

**No continuar** si:
- `/app/generated` no es persistente;
- no hay un candidato PostgreSQL inequívoco;
- el frontend actual usa una URL de API distinta de `VITE_API_URL` en `release.env`. En ese caso hay que reconstruir con la URL observada (`VITE_API_URL=<url> bash build-release.sh`).

## 4. Variables del release (sin valores por defecto)

```bash
export WORK=/root/g8-deploy/tk-<sha7>-$(date +%Y%m%d-%H%M%S)
export G8_DOCKER_HOST=<daemon de G8 observado>      # p. ej. unix:///run/user/1001/docker.sock
export CB=<contenedor backend>  CF=<contenedor frontend>  EXPECTED_PROJECT=<proyecto Compose>
export PG_DOCKER_HOST=<daemon del PostgreSQL>       # si es el mismo daemon, omitir
export PG_CONTAINER=<contenedor PostgreSQL>  PG_DB=<base de DATABASE_URL>  PG_USER=<rol de DATABASE_URL u otro con lectura completa>
```

Cada script verifica que la base indicada **es la misma** que usa el backend. Para eso compara nombre de base, hora de inicio del servidor y OID, leídos por la propia conexión Prisma del backend y dentro de `PG_CONTAINER`. Si no coinciden, aborta antes de respaldar o huellar otra base. La contraseña nunca se imprime.

## 5. Fases 01 a 04 (cada una debe terminar en PASS)

```bash
bash 01-preflight-readonly.sh   # inventario, identidad de la base, readiness, URL de API del frontend, huella de datos
bash 02-backup.sh               # pg_dump verificado (pg_restore --list), PDF con prueba de restauración por hash, imágenes actuales para rollback
bash 03-load-images.sh          # sha256 + gzip, carga, revisión = SHA, IDs = release.env, arquitectura, mismas etiquetas, bundle sin D:/Git/api
bash 04-preflight-compose.sh    # sin deriva respecto de lo que corre; con el override solo cambia la imagen; dry-run solo toca CB y CF
```

- Cada fase deja `A_PASS`, `B_PASS`, `C_PASS` y `PREFLIGHT_PASS` en `$WORK` con el SHA, y la siguiente exige la anterior.
- Conservar `$WORK/rollback.env` y `$WORK/backup/` en el servidor.
- No compartir `*.inspect.json`, `config.*.json`, dumps ni `.env`.

## 6. Fase 05 — activación

Requiere las cuatro fases en PASS y la confirmación explícita del SHA de `release.env`:

```bash
CONFIRM_SHA=<SHA de release.env> bash 05-activate.sh
```

- Recrea primero el backend; espera que esté saludable y que `/api/ready` responda 2xx. Después recrea el frontend.
- Si algo falla después de tocar el backend, ejecuta `06-rollback.sh` automáticamente para **ambas** imágenes, antes de abrir el CRM.
- Al terminar corre `07-postcheck.sh tk`:
  - `0` = PASS.
  - `1` = fallo bloqueante: imagen o revisión, variables, montajes, PDF, readiness o base. Provoca rollback automático.
  - `3` = solo cambió la huella de datos en la ventana. No revierte; el operador confirma si hubo actividad legítima y, si la hubo, repite con `ALLOW_DB_DRIFT=1 bash 07-postcheck.sh tk`.
- La huella posterior a la activación queda en `$WORK/db-post-activacion.txt`. Es la línea base **antes** de cualquier prueba de QA.

## 7. Rollback manual

```bash
bash 06-rollback.sh   # imágenes anteriores en backend y frontend; mismos montajes, redes y variables; termina != 0 si algo falla
```

La base **no** se restaura. Los registros creados en la QA posterior a la activación son transacciones legítimas que se concilian por IDs y auditoría.

## 8. Prohibido en la VPS

`docker compose down` / `down -v`, `pull`, `build`, `rm`, `prune`, `-V`, `--remove-orphans`, `prisma db push`, `migrate`, seeds, cambios de nginx y cambios de variables. `00-common.sh` bloquea esos verbos y opciones de Compose.

**Activar Nominatim u otro proveedor** es una operación de configuración **separada**, con su propio snapshot y rollback; nunca se hace durante este cambio de imágenes, porque 04 exige que solo cambie la imagen. Antes de enviar domicilios reales a un proveedor externo hay que revisar privacidad y límites de uso.

## 9. Aceptación en `https://38.7.201.104:8843/`

Usar cuentas autorizadas, RUT de QA y destinatarios de correo del propio equipo. Registrar los IDs creados. No operar sobre clientes, cobros ni contratos de terceros.

| Caso | Comprobación | Evidencia |
|---|---|---|
| TK-01 | Un único modal de instalación con el contrato exacto; un segundo clic no duplica la OT. Crear OT solo con un servicio de prueba coordinado con G3. | ID de OT, status y auditoría |
| TK-02/05 | Consolidado, FiNet y Cable Mágico: estado del cliente frente al del servicio; cliente compartido de prueba. | Respuestas por empresa |
| TK-04 | RUT de QA con y sin guion y con puntos; prospecto llegado del portal G2. | Mismo prospecto |
| TK-07 | Editar, cancelar sin guardar y guardar un prospecto de QA. | Antes/después |
| Geocodificación | `GEOCODING_PROVIDER` efectivo (fase 0). Llamar `/api/coverage/geocode` y revisar `motivo`; probar una dirección de QA y la selección manual (mapa y coordenadas). | 200, motivo coherente, coordenadas |
| Cobertura | `POST /api/coverage/check` y `PATCH /api/prospects/:id/location`: zona correcta y persistencia tras recargar. | ID de prospecto |
| Comercial | Prospecto QA → factibilidad → cotización → PDF → contrato, con correo solo a un destinatario autorizado. | PDF, mensaje y auditoría |
| TK-08/09 | Catálogo, unidad física con una **serie real entregada por G1** (QA-ONT-0001 solo existía en el simulador), equipos por servicio y 403 de otra empresa. En DevTools, el JSON no debe contener `dato_interno` ni campos fuera del contrato. | JSON saneado |
| Regresión | Cliente, plan, cotizaciones, firma, pagos y facturación; G1/G2/G3 sin alteraciones. | Códigos y auditoría |

Un **HTTP 400 de G3** al cerrar una REPARACION o INSTALACION es un problema conocido de compatibilidad del webhook. Se resuelve en el PR `fix/g3-cierre-compat-instalacion-reparacion-20261113`, no en este release. Registrarlo y no confundirlo con la UI.

## 10. Abortar y revertir si

- el bundle contiene `D:/Git/api` u otra URL de API;
- la revisión de la imagen no es el SHA;
- la base no es la del backend;
- se pierden montajes o PDF;
- `/api/ready` o el login responden 5xx;
- se rompe el aislamiento FiNet / Cable Mágico;
- G1 expone campos internos;
- salen correos u OT reales no autorizados;
- falla la firma o el contrato;
- cambia algo de G1/G2/G3, de nginx o de otros grupos.

En ese caso se ejecuta `06-rollback.sh`, y se verifican `/api/ready`, el login, los PDF históricos y los estados.
