# Activación de la integración S2S con G2 (Portal del Cliente)

Lista de pasos para encender en producción los endpoints `/api/integrations/g2/*` y para probarlos antes en local.
Rama de origen: `feat/g2-alineacion-contrato`. Contrato de referencia: respuesta complementaria de G8 del 02-10-2026 y respuesta de G2 del 08-10-2026.

G2 mantiene sus llamadas apagadas hasta recibir la confirmación del paso 6.

## Endpoints

| Endpoint | Uso de G2 | Estado |
|---|---|---|
| `GET invoices?id_empresa=&id_cliente=` (o `id_contrato`, o `rut`) | Saldo del cliente y avisos | Lo llama hoy (apagado) |
| `POST tickets/{idTicket}/wifi-result` | Resultado del cambio de clave WiFi | Lo llama hoy (apagado) |
| `GET payments/{id}/tax-document?id_empresa=` | Descarga de boleta (CU-52) | Aún sin código en G2 |
| `POST payments` | Pago confirmado por pasarela | Aún sin código en G2 |
| `GET invoices/{id}?id_empresa=` | Detalle de factura | No lo usa |
| `GET payments/{id}/comprobante?id_empresa=` | Comprobante de pago | No lo usa |

Todos exigen `X-API-KEY` y son servidor a servidor.

## 1. Decisiones que deben estar cerradas

- [ ] Regla de estados de `wifi-result`: transición directa desde `Abierto`/`En progreso`/`Escalado`; 409 si el ticket está `Resuelto`, `Cerrado` o en otro estado. G2 la aprobó el 08-10; falta la confirmación de G8.
- [ ] Una factura sin monto se entrega con `saldoExigible: 0` y `aceptaPagos: false`.
- [ ] Quién informa `APLICADO` cuando el técnico de G3 termina. G2 nunca lo envía: hoy ningún ticket WiFi llega a `Resuelto` por esta vía.
- [ ] Si el enlace de descarga de Facturacion.cl caduca. Si es permanente, G2 prefiere que G8 entregue el archivo y no el enlace.
- [ ] Si `request_id` de `POST payments` debe quedar guardado. Hoy se acepta y se devuelve, pero no se persiste.

## 2. Smoke local

No usa Railway. Requiere Docker Desktop encendido.

1. Crear la base local desechable (aplica el esquema y todas las migraciones en `127.0.0.1:55432`):

   ```powershell
   $env:FINET_LOCAL_DB_PASSWORD = '<contraseña local de 16 caracteres o más>'
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-local-db.ps1
   ```

2. Cargar los datos de prueba. Antes de ejecutar, confirmar que el host es `127.0.0.1`:

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres:$($env:FINET_LOCAL_DB_PASSWORD)@127.0.0.1:55432/fsm_i3_baseline_test?schema=public"
   npx prisma db execute --file scripts/g2/seed-g2-local.sql --schema backend/prisma/schema.prisma
   ```

   El seed se niega a correr si la base no se llama `fsm_i3_baseline_test` o `fsm_db`.

3. Configurar la key de prueba (inventada, solo local) y levantar el backend en la misma terminal:

   ```powershell
   $hash = node -e "console.log(require('crypto').createHash('sha256').update('g2-smoke-local-key').digest('hex'))"
   $env:G8_INTEGRATION_API_KEYS = '[{"keyId":"g2-smoke","group":"G2","sha256":"' + $hash + '","companies":[1,2],"active":true}]'
   npm run dev:backend
   ```

   Si el puerto 3000 ya está ocupado (por ejemplo, por el stack de `docker-compose.yml`), definir antes `$env:PORT = '3100'` y cambiar `@base` en el archivo `.http`.

4. Abrir `docs/g2/smoke-g2.http` (extensión REST Client de VS Code) y ejecutar las 18 llamadas en orden. Cada una indica el resultado esperado.

   Ejecutado el 08-10-2026 contra la base local: las 18 llamadas respondieron lo esperado.

5. Al terminar: `docker rm -f finet-crm-i3-baseline-db` y cerrar la terminal para descartar las variables.

## 3. Antes de migrar Railway

- [x] `ticket.id_servicio` y la tabla `servicio_contratado` existen en Railway (consulta de solo lectura del 08-10-2026). No se verificó la FK `fk_ticket_id_servicio`.
- [ ] Ejecutar `scripts/preflight-i3-g2-migration-readonly.ps1`: objetos de G2 ausentes, migración no aplicada y cero nombres duplicados en `categoria_falla`.
- [ ] Revisar las migraciones pendientes. Ya no es una sola: `prisma migrate deploy` aplicará las seis.

  | Migración | Observación |
  |---|---|
  | `20261001120000_i3_g2_intergroup_contract` | Aditiva. Aborta si `categoria_falla` tiene nombres duplicados |
  | `20261003010000_i3_tax_emission_intents` | Tablas propias de G8 |
  | `20261003020000_i3_tax_payment_pipeline` | Reemplaza constraints de `tax_emission_intent` (tabla propia) |
  | `20261004010000_i3_tax_smtp_delivery` | Tablas propias de G8 |
  | `20261004020000_i3_whatsapp_notifications` | Toca `log_notificacion`, donde G2 escribe: ensancha `estado_envio` a `VARCHAR(30)` y agrega columnas con null o default |
  | `20261004030000_i3_mail_simulated_delivery` | Tablas propias de G8 |

- [ ] Avisar a G2 antes de aplicar (acuerdo v2.0 §13.1), en especial el cambio sobre `log_notificacion`.
- [ ] Respaldo de Railway.

## 4. Migración y despliegue

- [ ] Aplicar con `prisma migrate deploy`. Nunca `db push` ni `migrate dev`.
- [ ] `scripts/verify-global-db-readonly.ps1` sin diferencias de contrato.
- [ ] Desplegar el backend. `health` y `ready` en verde.
- [ ] Mantener `BILLING_NOTIFICATION_MODE=disabled` y `WHATSAPP_PROVIDER=disabled`: los avisos de pago y de corte los envía G2 (ratificación final §4).

## 5. Key de G2

- [ ] Generar una key aleatoria y guardar en `G8_INTEGRATION_API_KEYS` solo su SHA-256 en minúsculas:

  ```json
  [{ "keyId": "g2-prod-2026-01", "group": "G2", "sha256": "<64 hex>", "companies": [1, 2], "active": true }]
  ```

- [ ] `companies` con números. Con `["1","2"]` la entrada se descarta completa y G2 recibe 401 en todo, sin ningún mensaje que lo explique. Lo mismo ocurre si el JSON queda mal formado.
- [ ] Entregar la key literal a G2 por canal privado. No va en el repositorio, en el chat ni en variables `VITE_*`.

## 6. Smoke coordinado y confirmación a G2

- [ ] Smoke con registros de prueba acordados con G2 (`scripts/smoke-i3-intergroups.ps1`).
- [ ] Confirmar a G2: `MIGRACION_APLICADA`, `VERIFICADOR_SCHEMA_OK`, `BACKEND_NUEVO_DESPLEGADO`, `HEALTH_OK`, `READY_OK`, `KEY_G2_CONFIGURADA`, `SMOKE_G2_OK`.

## Lo que G2 debe saber

- `invoices` responde `{ "items": [...] }` en la raíz. Sin `page` ni `page_size` entrega todas las facturas del cliente o contrato.
- `wifi-result` acepta el body del §12 (`request_id`, `trace_id`, `id_empresa`, `resultado`, `detalle_saneado`). Responde 201. El reenvío idéntico responde 201 con `duplicate: true`; el mismo `request_id` con otro contenido, 409.
- El estado del ticket se compara sin distinguir mayúsculas: `abierto` y `Abierto` valen igual.
- `detalle_saneado` se rechaza con 400 si contiene las palabras `password`, `contraseña`, `ciphertext`, `plaintext` o algo con forma de token.
- `tax-document` agrega el campo `motivo`: `DATOS_INCOMPLETOS`, `EMISION_NO_HABILITADA` o `null`. Mientras la emisión real no esté habilitada responde siempre `estado: "PENDIENTE"`: los documentos de sandbox no se entregan.
- `fecha_emision` de `tax-document` es la fecha de envío a Facturacion.cl.
- `POST payments`: la identidad idempotente es `codigo_transaccion`; `request_id` es opcional. Un pago total reactiva los servicios suspendidos del cliente y dispara la emisión tributaria.
- `GET comprobante` responde `PENDIENTE` para todo pago de G2: ningún proceso genera ese comprobante.

## Pendiente fuera de esta rama

- Emisión real con Facturacion.cl: hoy solo sandbox.
- Envío del documento tributario por WhatsApp: no implementado.
- Proceso que incorpore el recargo de reconexión a una factura: no encontrado en el código.
- Acceso de lectura a Railway para G2: lo pidieron el 08-10.
