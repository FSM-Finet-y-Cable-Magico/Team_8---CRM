# Cierre intergrupos del Incremento 3 — G8 ↔ G3 y G8 ↔ G2

Fecha técnica: 2026-10-01. Estado: **IMPLEMENTADO LOCALMENTE / MIGRACIÓN PENDIENTE DE APROBACIÓN / SIN TRÁFICO EXTERNO**.

## G3

### Contrato G8 → G3

El payload definitivo de `POST /api/integraciones/instalaciones` ubica el RUT exclusivamente en `persona.rut`. No se envía una copia en la raíz:

```json
{
  "request_id": "<id estable>",
  "trace_id": "<traza estable>",
  "id_empresa": 1,
  "id_prospecto": 10,
  "id_contrato": 20,
  "id_plan": 7,
  "persona": {
    "rut": "12345678-5",
    "nombre_completo": "Persona Demo",
    "telefono": "+56912345678",
    "email": "persona@example.invalid"
  },
  "direccion": {
    "direccion_completa": "Calle Demo 123",
    "comuna": "Valparaíso"
  }
}
```

El snapshot y su SHA-256 se calculan sobre esta forma. Un retry vuelve a usar el mismo `request_id`, `trace_id`, hash y snapshot; no reconstruye el cuerpo desde datos comerciales que hayan cambiado.

### Cierre G3 → G8

La ruta externa canónica es:

```text
POST /api/integraciones/fsm/ordenes/:id_ot/cierre
X-API-KEY: <key literal entregada a G3>
```

La ruta anterior `POST /api/integrations/g3/events/work-order-closed` permanece como alias compatible. Ambas usan `IntegrationApiKeyGuard` y una sola instancia de `G3ClosureProcessor`; no hay autenticador paralelo.

El principal debe tener `group=G3` y scope para `body.id_empresa`; la configuración final permite empresas `[1,2]`. El cuerpo exige `id_ot`, `request_id`, `trace_id`, `id_empresa`, `id_prospecto`, `id_contrato`, `id_plan`, `equipos_instalados` y `equipos_retirados`. El `id_ot` del cuerpo debe coincidir con la ruta y todas las correlaciones deben coincidir con el tracking.

La decisión final es **approval-only**. G3 únicamente llama el webhook después de aprobar y llevar la OT a `COMPLETADA`. El cuerpo no incluye `estado`; una recepción válida implica `COMPLETADA`. Los cambios internos previos a la aprobación no se notifican a G8 y la reconciliación expone únicamente cierres completados. La idempotencia usa un evento terminal único por tracking: un retry idéntico no repite Cliente, Servicio ni G1, mientras un contenido diferente produce conflicto.

```text
G3_CLOSE_MODE=APPROVAL_ONLY
G3_CLOSE_EXPECTED_STATE=COMPLETADA
G3_RECHAZADA_EXTERNAL_STATE=false
G3_EN_CURSO_EXTERNAL_NOTIFICATION=false
G3_PENDING_APPROVAL_EXTERNAL_NOTIFICATION=false
G3_EXPLICIT_STATE_FIELD_REQUIRED=false
G3_COMPANY_SCOPE=[1,2]
```

### Configuración permanente de API keys

`G8_INTEGRATION_API_KEYS` es un JSON array. G8 almacena SHA-256, grupo y empresas; nunca la key literal:

```json
[
  {
    "keyId": "g3-prod-2026-01",
    "group": "G3",
    "sha256": "<64 caracteres hexadecimales minúsculos>",
    "companies": [1, 2],
    "active": true
  },
  {
    "keyId": "g2-prod-2026-01",
    "group": "G2",
    "sha256": "<64 caracteres hexadecimales minúsculos>",
    "companies": [1, 2],
    "active": true
  }
]
```

Cada grupo recibe su propia key literal por un canal seguro. El hash se calcula sobre los bytes UTF-8 exactos, sin espacios ni salto de línea agregado. No se configuró esta variable en Railway durante la etapa.

Después del deploy coordinado, G8 entregará a G3 `CIERRE_WEBHOOK_G8_URL=https://team8-crm-production-3be0.up.railway.app/api/integraciones/fsm/ordenes/:id_ot/cierre` y `CIERRE_WEBHOOK_G8_KEY=<canal privado>`. Esta referencia prepara la configuración futura y no afirma que el backend local ya esté publicado.

### Smoke pendiente

La consulta Railway en transacción `READ ONLY` no encontró un caso seguro de empresa 1 que combine Prospecto, Contrato firmado, Plan de la misma empresa, factibilidad y datos suficientes sin Cliente/Servicio activo incorrectamente creado. Tampoco existen snapshots abiertos en `integracion_instalacion_g3`. Por ello no hay IDs candidatos que reportar; falta crear o identificar un caso comercial coherente y obtener autorización humana antes del POST real. `REAL_EXTERNAL_POSTS=0`.

`solicitud_instalacion_integracion` ya está en el contrato canónico con su definición física confirmada. Esta etapa no volvió a modificar esa tabla.

## Respuestas contractuales a G2

1. **Abonado e identidad Portal.** Abonado es la denominación comercial de Cliente. No existe ni se requiere `codigo_abonado`, y no se reutiliza `contrato.numero_contrato_externo` para ese fin. La identidad Portal se resuelve mediante `id_empresa + RUT normalizado`; después pueden usarse internamente `id_cliente`, `id_contrato` e `id_factura`.
2. **Saldo.** `invoice-balance.ts` sigue siendo la única fuente de cálculo. El saldo no se materializa como otra columna. G2 consume la fachada S2S y no reconstruye mora, pagos ni prórrogas.
3. **Vencimiento.** `Contrato.diaVencimiento` mapea `contrato.dia_vencimiento`; `Factura.fechaLimitePago` mapea `factura.fecha_limite_pago`. La fecha efectiva puede considerar una prórroga aprobada mediante el mismo cálculo de billing.
4. **Pago confirmado.** `Pago.monto`, `Pago.fechaPago` y `Pago.codigoTransaccion` permanecen. Se agrega `pago.codigo_autorizacion VARCHAR(100) NULL` para compatibilidad histórica. El endpoint S2S exige fecha, monto, código de autorización y código de transacción único. `codigo_transaccion` es la identidad idempotente: retry exacto responde como duplicado y contenido incompatible produce `409`.
5. **Plan elegido en Prospecto.** Se agrega `prospecto.id_plan_interes INTEGER NULL`, FK a `plan.id_plan` e índice por empresa/plan. La aplicación exige Plan activo de la misma empresa. Registra la preferencia inicial y no se sobrescribe cuando `Contrato.id_plan` final cambia.
6. **Activación Portal.** G2 es owner de sesiones y de `cliente.password_portal_hash`. Identifica al candidato por empresa y RUT normalizado, pero debe verificar un segundo factor de posesión mediante su mecanismo Portal antes de establecer el hash. G8 no almacena OTP ni añade otro sistema de autenticación Portal.
7. **Categoría WiFi.** El literal final es exactamente `CAMBIO_CREDENCIALES_WIFI`. La migración inserta el catálogo si falta y crea unicidad por nombre después de abortar si existen duplicados. Railway no tenía categorías al realizar la consulta READ ONLY.
8. **Ticket y Servicio.** `ticket.id_servicio` ya existe y su FK canónica apunta a `servicio_contratado(id_servicio)`. El receptor WiFi valida Ticket, empresa, cliente, categoría y Servicio coherentes.
9. **Resultado WiFi G2 → G8.** Se implementa `POST /api/integrations/g2/tickets/:idTicket/wifi-result`, con principal `group=G2`, scope por `body.id_empresa`, `request_id` idempotente y resultado saneado. `APLICADO` deja Ticket `Resuelto`; `REQUIERE_ATENCION_MANUAL` y `ERROR_TECNICO` lo dejan `Escalado`. Mientras el cambio de G3 requiera intervención manual, G2 envía `REQUIERE_ATENCION_MANUAL`, nunca `APLICADO`. No acepta contraseñas, plaintext/ciphertext, llaves privadas, token SmartOLT ni credenciales técnicas.
   El historial mínimo permanente es `integracion_resultado_wifi_g2`; no duplica Ticket y además escribe auditoría.
10. **Comprobante.** Se conserva `pago.comprobante_pdf_url` y se agrega `pago.comprobante_estado` con `PENDIENTE | GENERADO | FALLIDO`. `GET /api/integrations/g2/payments/:id/comprobante?id_empresa=1` valida Pago, Factura, Cliente y empresa. Para pendiente/fallido devuelve metadata sin archivo; para generado devuelve `redirect_url` únicamente si es HTTPS segura. No usa rutas locales, filesystem efímero ni archivos ficticios.

### Endpoints S2S G2

Todos usan `X-API-KEY`, `G8_INTEGRATION_API_KEYS`, principal `G2` y scope obligatorio:

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/integrations/g2/invoices?id_empresa=1&rut=11111111-1` | facturas del Cliente identificado por empresa y RUT normalizado; también admite `id_cliente` o `id_contrato` exacto |
| `GET` | `/api/integrations/g2/invoices/:id?id_empresa=1` | detalle con la misma lógica de balance |
| `POST` | `/api/integrations/g2/payments` | pago confirmado e idempotente |
| `GET` | `/api/integrations/g2/payments/:id/comprobante?id_empresa=1` | estado/URL segura del comprobante |
| `POST` | `/api/integrations/g2/tickets/:idTicket/wifi-result` | resultado técnico saneado e idempotente |

Los endpoints JWT de `/api/billing/invoices` continúan para usuarios humanos. La fachada G2 llama los mismos servicios internos y no duplica `invoice-balance`.

`CargoAdicional` de tipo `RECONEXION` en `PENDIENTE_FACTURACION` y con `afecta_saldo=false` no forma parte del saldo exigible. Solo repercute cuando se incorpora a una Factura; G2 no debe sumarlo por separado.

`solicitud_contrasena_wifi` pertenece a G2 como tabla legacy transitoria y no recibe lógica nueva. `solicitud_clave_wifi` conserva owner desconocido: no se atribuye a G2, no se elimina y no se modifica.

La frontera posterior al pago es: G2 confirma en su Portal/pasarela; G8 registra y confirma el Pago; después del commit, otro workstream podrá emitir el DTE con Facturacion.cl y enviarlo por SMTP. Un fallo tributario o SMTP no revierte el Pago. El comprobante de pago no es un DTE y G2 no recibe credenciales de Facturacion.cl ni SMTP.

## Cambios de schema pendientes de aprobación G2/G8

La migración preparada es `backend/prisma/migrations/20261001120000_i3_g2_intergroup_contract/migration.sql`. Agrega:

- `prospecto.id_plan_interes`, FK e índice;
- `pago.codigo_autorizacion` nullable;
- `pago.comprobante_estado` con backfill compatible, default y CHECK;
- unicidad de `categoria_falla.nombre` e inserción del literal WiFi;
- `integracion_resultado_wifi_g2`, dos FK, CHECK, unique e índices.

La auditoría READ ONLY encontró cero pagos históricos; aun así `codigo_autorizacion` permanece nullable para no imponer una precondición retroactiva. Las cuatro propiedades son obligatorias en el DTO S2S nuevo. La migración no se aplicó.

Contrato canónico propuesto: SHA-256 `6f3c9afdfc8693730a26a4f7f3dc58e81e0046ee74136daef077e39bce8ab20e`; 92 tablas, 910 columnas, 92 PK, 214 FK, 35 checks y 114 índices explícitos.

La verificación Railway `READ ONLY` posterior confirmó el delta exacto esperado: 1.522 `MATCH`, 13 `MISSING_COLUMN`, 1 `MISSING_TABLE`, 3 `MISSING_FK`, 5 `MISSING_INDEX` y 4 `REQUIRES_REVIEW` correspondientes a PK, secuencia y checks de la tabla/columnas nuevas. Son 26 `CONTRACT_DIFFERENCE` de la propuesta aún no aplicada. Además permanecen 1 `TECHNICAL_ALLOWED_EXTRA` y los mismos 5 `UNOWNED_EXTRA`; estado global `FAIL`. No se introdujeron excepciones.

Los cinco `UNOWNED_EXTRA` preexistentes permanecen separados y bloqueados: `lista_negra.nivel`, `log_notificacion.id_ot`, `log_notificacion_id_ot_fkey`, `log_notificacion_estado_envio_fecha_envio_idx` y `solicitud_clave_wifi`. Ninguno se incorporó, eliminó o exceptuó.

## Bloqueos de release

- aprobación coordinada G2/G8 y aplicación controlada de la migración;
- provisión posterior de las claves G2/G3 hasheadas en Railway;
- candidato comercial seguro y autorización humana para el smoke real G8 → G3;
- smoke real G3 → G8 con cierre `COMPLETADA`;
- resolución de los cinco `UNOWNED_EXTRA`;
- smoke S2S G2 posterior a la migración y configuración.

## Validaciones ejecutadas

- backend completo: 57 suites y 497 tests aprobados; 5 suites/8 tests opcionales omitidos;
- foco G2/G3/billing/Prospecto/Ticket: 12 suites y 121 tests aprobados antes del cierre amplio;
- herramientas globales: 22/22 tests aprobados;
- runtime frontend: 3/3 tests aprobados;
- build backend/frontend: aprobado; Vite conserva su advertencia conocida de chunk mayor a 500 kB;
- lint: 0 errores y 78 advertencias frontend preexistentes;
- Prisma generate y validate: aprobados;
- auditor Prisma/global: 59 modelos, 822 `MATCH`, 35 `COLUMN_GLOBAL_ONLY`, 325 `OWNER_EXTERNAL`, 50 `INDEX_MISMATCH`, 65 `FK_MISMATCH`;
- verificador Railway: conexión READ ONLY aprobada y `FAIL` esperado por 26 diferencias nuevas más cinco extras sin dueño;
- Docker: no utilizado en esta etapa; no era necesario para estas verificaciones.

No se ejecutaron DDL/DML, deploy, commit, push, merge ni POST externos durante esta etapa.

El paquete operativo posterior, con auditoría exacta de la migración, orden obligatorio, checklist, rollback lógico, scripts de smoke y evaluación de dumps, está en [i3-intergroup-predeploy-package.md](i3-intergroup-predeploy-package.md).
