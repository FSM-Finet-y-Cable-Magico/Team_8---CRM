# CRM local para pruebas de Facturación.cl

Verificado el 2026-10-03 en `feat/i3-facturacion-cl`, después de incorporar
`feature/incremento3` hasta `1af19cc96e78ad1f4c3b12dc339f2d9332a82784`.

## Arranque y alcance

El stack `finet-facturacion-local` usa una base PostgreSQL local independiente,
inicializada con `db/global/init-global.sql` y los seeds demo enumerados en el
compose. No usa `.env.railway`, una base compartida ni los contenedores del compose
anterior. Los puertos publicados se limitan a `127.0.0.1`.

- CRM: <http://localhost:5173>.
- API: <http://localhost:3000/api>.
- PostgreSQL local: `127.0.0.1:5433`, base `fsm_facturacion_local`.
- Configuración privada: `.env.facturacion-local`, ignorada por Git.

Para crear ese archivo en otra PC, desde la raíz del repositorio:

```powershell
$dbKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$jwtKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).ToLowerInvariant()
if (Test-Path -LiteralPath '.env.facturacion-local') { throw 'El archivo privado ya existe; conservarlo.' }
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env.facturacion-local'), "FACTURACION_LOCAL_DB_PASSWORD=$dbKey`nFACTURACION_LOCAL_JWT_SECRET=$jwtKey`nG3_INTEGRATION_ENABLED=false`n", [Text.UTF8Encoding]::new($false))
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml up --build -d
```

El usuario demo inicial es `admin@finet.local`. La contraseña está en la guía
existente de puesta en marcha; no corresponde a una credencial fiscal del proveedor.

Para consultar estado o apagar los servicios conservando los datos:

```powershell
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml ps
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml down
```

No usar `down -v` para un reinicio: elimina la base local.

## Recuperación de Docker en esta PC

Docker Desktop había informado un fallo al renombrar `sailor-ingest.sock`.
Se comprobó el estado y se inició mediante `docker desktop start --timeout 45`.
Después el motor respondió con versión `29.8.1` y pudo construir y ejecutar el
stack. No se borraron sockets, configuraciones, volúmenes ni distribuciones WSL.
Esto acredita la recuperación observada; no asegura que el fallo nunca reaparezca.

## Comprobación realizada

- Los tres contenedores quedaron en ejecución; PostgreSQL `healthy`.
- Frontend HTTP 200.
- `/api/health`: `application=UP`.
- `/api/ready`: `database=UP`, `global_schema=READY`, cero columnas faltantes o
  diferentes en el alcance de ese endpoint.
- Login desde el navegador con el usuario demo; dashboard con datos locales.
- Captura: [CRM local](evidencias/facturacion-cl/2026-10-03/03-crm-docker-local.jpg).

El endpoint de readiness compara tablas, columnas, tipos y nulabilidad. No es una
auditoría completa de constraints ni una prueba de comunicación con otros grupos.

## Estado de las integraciones

La regla aprobada por el usuario es una boleta por cada pago, incluidos los abonos.
El flujo objetivo registra el pago, emite la boleta, conserva folio y comprobante,
y envía el correo después de confirmar la generación. El comprobante de pago G2
y el documento tributario son registros diferentes.

El emisor real está conectado después del commit de Billing. Las migraciones nuevas se aplicaron únicamente a fsm_facturacion_local. En esta PC la configuración privada habilita solo Cable Mágico sandbox; FiNet no está habilitada. Mailpit recibe el correo local en http://localhost:8025, sin relay externo. Se generó una boleta desde un abono, se verificó su PDF y su correo local. Ver el checkpoint para la evidencia y límites.

G3 sigue sin configurar. Se registró un intento local del contrato QA 6 con estado FALLIDA_REINTENTABLE, sin idOtG3 y sin POST externo. Faltan G3_API_URL, G3_API_KEY de pruebas y habilitación. Un HTTP 201 del CRM solo acredita el seguimiento local cuando la integración está deshabilitada.

Antes de corregir la URL de trabajo, se creó en el CRM remoto un caso QA con
contrato #22, nombre `QA G8 G3 20261003 - NO INSTALAR` y observación de no despacho
ni cobro. No se remitió una orden G3. Ese registro remoto no está en esta base
local y no es evidencia del flujo local.

## Preparación de las tablas en una base QA nueva

Mantener Facturación.cl deshabilitada durante la primera inicialización. Desde la raíz del repositorio, solo para el contenedor db de este compose y una base fsm_facturacion_local nueva:

```powershell
Get-Content -Raw backend/prisma/migrations/20261003010000_i3_tax_emission_intents/migration.sql | docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d fsm_facturacion_local
Get-Content -Raw backend/prisma/migrations/20261003020000_i3_tax_payment_pipeline/migration.sql | docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d fsm_facturacion_local
Get-Content -Raw backend/prisma/migrations/20261004010000_i3_tax_smtp_delivery/migration.sql | docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d fsm_facturacion_local
Get-Content -Raw tools/facturacion-cl-sandbox/create-local-fixtures.sql | docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d fsm_facturacion_local
```

No repetir las migraciones sobre esta PC: ya fueron aplicadas. No ejecutar migrate deploy contra el DDL global o una base compartida. Las migraciones aditivas requieren coordinación del dueño del esquema antes de un despliegue compartido.

Configurar solo credenciales API de PRUEBAS y el perfil correspondiente en .env.facturacion-local según i3-facturacion-cl-integration.md. Los defaults del compose siguen deshabilitados. No copiar valores privados a .env.example ni a capturas. Para la bandeja de correo local configurar SMTP_HOST=mailpit, SMTP_PORT=1025, SMTP_SECURE=false, SMTP_STARTTLS=false, SMTP_ALLOW_INSECURE_LOCAL=true, SMTP_FROM=qa@finet.local y sin usuario/contraseña SMTP; FACTURACION_CL_DELIVERY_ENABLED controla esa etapa. La tercera migración SMTP también está aplicada en esta PC. Consultar [TLS, recuperación y pruebas](i3-smtp-automatic-email.md) antes de conectar una cuenta externa.

```powershell
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml --profile mail-qa up -d backend frontend mailpit
node tools/facturacion-cl-sandbox/verify-local-persistence.cjs
```

El último script usa PostgreSQL real y dispatcher ficticio: cero llamadas al proveedor. Comprueba la base exclusiva y elimina solo sus propios registros temporales. No genera boletas; la primera emisión sandbox debe partir del pago de QA con una referencia única, tras verificar empresa/perfil/credenciales. No repetir pagos de la evidencia para obtener nuevas capturas.

Mailpit se agregó conforme a su [documentación oficial Docker](https://mailpit.axllent.org/docs/install/docker/); SMTP no se publica al host y su interfaz web queda en loopback. Tras cambios del código montado, reiniciar backend/frontend si Docker Windows no detecta los cambios.
