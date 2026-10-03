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

El código actual todavía **no conecta Billing con el emisor automático**.
Facturación.cl continúa deshabilitada; el login/versión de pruebas y los tests
locales no acreditan una boleta emitida. La migración de intenciones tributarias
no se aplicó a esta base ni a Railway. No se habilitó SMTP.

G3 está sin configurar. Para una recepción real faltan `G3_API_URL`, `G3_API_KEY`
y habilitación explícita para su ambiente de pruebas. No se envió ninguna orden
desde este stack. No usar una respuesta simulada para afirmar que G3 recibió la OT.

Antes de corregir la URL de trabajo, se creó en el CRM remoto un caso QA con
contrato #22, nombre `QA G8 G3 20261003 - NO INSTALAR` y observación de no despacho
ni cobro. No se remitió una orden G3. Ese registro remoto no está en esta base
local y no es evidencia del flujo local.
