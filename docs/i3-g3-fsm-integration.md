# Incremento 3 - Etapa 3: integración G8 CRM ↔ G3 FSM

## Ownership y alcance P0

G8 conserva Prospecto, Plan, factibilidad comercial, Contrato, Cliente, ServicioContratado, cobranza, solicitudes y lifecycle comercial. G3 conserva orden de trabajo, técnico, agenda, dirección operativa, ejecución en terreno, evidencias y cierre técnico. Una solicitud aceptada por G3 no crea un Cliente en G8: el Cliente, la dirección definitiva y el servicio activo aparecen únicamente al procesar un cierre `COMPLETADA` válido.

No se implementaron G1, Facturación.cl, WhatsApp, SmartOLT escritura, comandos WiFi, TV IP, TOMODAT directo, import confirm ni cambios de Railway.

## Contrato HTTP oficial utilizado

| Operación | Endpoint G3 | Uso G8 |
| --- | --- | --- |
| Crear instalación | `POST /api/integraciones/instalaciones` | Solicitud y reintento idempotente |
| Consultar OT | `GET /api/integraciones/ordenes/{id}` | Detalle y estado actual |
| Consultar cierre | `GET /api/integraciones/ordenes/{id}/cierre` | Reconciliación manual |

El adaptador `HttpG3IntegrationClient` es el único punto que usa HTTP. Envía `X-API-KEY`, aplica `G3_REQUEST_TIMEOUT_MS`, bloquea HTTP remoto sin TLS y nunca entrega la API key al frontend ni la registra. La integración se habilita explícitamente con `G3_INTEGRATION_ENABLED=true`; URL o key ausentes producen `INTEGRACION_G3_NO_CONFIGURADA` y jamás una OT local de fallback.

Variables documentadas solo en `backend/.env.example`:

```dotenv
G3_API_URL=
G3_API_KEY=
G3_REQUEST_TIMEOUT_MS=8000
G3_INTEGRATION_ENABLED=false
```

## Payload de instalación

El casing HTTP permanece en `snake_case`:

```json
{
  "request_id": "uuid",
  "trace_id": "uuid-v4",
  "id_empresa": 1,
  "id_prospecto": 10,
  "id_contrato": 20,
  "id_plan": 7,
  "rut": "12345678-5",
  "persona": { "nombre_completo": "Persona Demo", "telefono": "+56912345678" },
  "direccion": { "direccion_completa": "Calle Demo 123", "comuna": "Valparaíso" }
}
```

`id_prospecto` se omite cuando no existe. Antes del envío se valida contrato firmado, plan, empresa, factibilidad del prospecto, RUT con DV, teléfono móvil chileno E.164, nombre, dirección y comuna. La dirección es un snapshot persistido en el outbox; una edición posterior no altera el payload histórico.

`request_id` se genera una sola vez y se reutiliza junto con el mismo payload en cada retry. `trace_id` es UUID v4 y permanece asociado a esa solicitud. G8 calcula SHA-256 sobre JSON ordenado para detectar mutaciones locales; no intenta reproducir el hash interno de G3.

## Tracking e idempotencia

`IntegracionInstalacionG3` guarda empresa, correlaciones comerciales, referencias externas, `requestId` único, `traceId`, estado de integración, estado OT, estado original desconocido, intentos, error saneado, hash, snapshot y fechas. No replica agenda, evidencia ni una OT técnica completa.

Estados de integración G8: `PENDIENTE_ENVIO`, `ENVIADA`, `EN_SEGUIMIENTO`, `COMPLETADA`, `FALLIDA_REINTENTABLE` y `FALLIDA_DEFINITIVA`.

`IntegracionEventoEntrante` funciona como inbox. Su unicidad por tracking y tipo de evento deduplica webhook y reconciliación; un hash diferente para el mismo evento terminal se rechaza como conflicto. No se inventó un `event_id` de G3.

## Estados técnicos

| Estado G3 | Comportamiento G8 |
| --- | --- |
| `PENDIENTE` | Conserva lifecycle pendiente y permite consulta |
| `ASIGNADA` | Conserva lifecycle pendiente; muestra asignación recibida en detalle |
| `EN_CURSO` | Conserva lifecycle pendiente |
| `COMPLETADA` | Solo con OT de instalación y resultado técnico válido ejecuta activación transaccional |
| `CANCELADA` | No crea Cliente ni activa Servicio; mantiene Prospecto y Contrato para gestión comercial |
| `PENDIENTE_CLIENTE_AUSENTE` | No activa ni cancela; muestra seguimiento. No existe endpoint ratificado de reprogramación |
| Desconocido | Presenta `EN_SEGUIMIENTO`, conserva `estadoOriginalG3`, audita y no activa/cancela |

## API G8 y flujo

| Método | Ruta G8 | Control |
| --- | --- | --- |
| POST | `/api/integrations/g3/installations` | JWT, rol de instalación y scope de empresa |
| POST | `/api/integrations/g3/installations/:id/retry` | Mismo `request_id` y snapshot |
| GET | `/api/integrations/g3/installations/:id` | Consulta detalle G3 tolerante a opcionales |
| GET | `/api/integrations/g3/prospects/:id/installation` | Último tracking del prospecto |
| GET | `/api/integrations/g3/contracts/:id/installation` | Último tracking del contrato |
| POST | `/api/integrations/g3/installations/:id/reconcile` | GET de cierre y processor común |
| POST | `/api/integrations/g3/events/work-order-closed` | Guard G3 cerrado por defecto |

`InstallationIntegrationService` persiste primero, confirma la transacción, llama G3 y luego persiste el resultado. Los errores 400, 401, 403, 404 y 409 se clasifican; 429, 5xx y timeout son reintentables según la operación. Un timeout conserva la misma clave idempotente.

El detalle devuelve solo campos opcionales conocidos: id/código, tipo, estado, fecha, técnico, dirección, persona, teléfono y resultado. No se transforma un campo inexistente en dato ficticio.

## Cierre, reconciliación y lifecycle

Webhook y GET de cierre pasan por el mismo `G3ClosureProcessor`. La correlación prefiere `request_id`; si falta, usa id/código externo y rechaza ambigüedad. Las correlaciones opcionales recibidas se comparan con empresa, prospecto, contrato, plan y trace del tracking.

La autenticación entrante todavía no fue ratificada. El endpoint usa `G3WebhookGuard` con un `G3WebhookAuthenticator` sustituible y su implementación productiva falla cerrada con `PENDIENTE_CONTRATO_AUTENTICACION_WEBHOOK`. Las pruebas inyectan autenticación simulada. No se creó un secreto o header entrante incompatible.

Para `COMPLETADA`, una transacción local bloquea el tracking, deduplica el evento y llama `InstallationActivationService`. Este servicio consulta `service-activation.policy.ts` con intención `INSTALLATION_COMPLETION`, resuelve o crea una sola vez Cliente, DirecciónServicio y ServicioContratado, asocia Contrato, registra `fechaActivacion` y lleva el pipeline a `Servicio Activo`. No hay HTTP dentro de esa transacción.

## WorkOrders legacy y matriz de migración

Las lecturas y cierres históricos permanecen disponibles y el frontend los etiqueta `LEGACY_LOCAL`. Las rutas antiguas de creación de instalación se conservan para no romper consumidores, pero sus controladores delegan al orquestador G3 e ignoran los campos locales de agenda; no crean `OrdenTrabajo`.

| Ruta local actual | Consumidor | Función | Nuevo destino | Estado |
| --- | --- | --- | --- | --- |
| `ProspectsService.createInstallOrder` / `POST /prospects/:id/install-orders` | formulario de prospecto histórico | Crear instalación de prospecto | `InstallationIntegrationService.requestInstallation` → G3 | `REEMPLAZADO_G3`; método de servicio queda sin ruta directa para compatibilidad de tests |
| `ServicesService.createInstallOrder` / `POST /services/:id/install-order` | ficha de servicio histórica | Crear instalación de servicio | `InstallationIntegrationService.requestInstallation` → G3 | `REEMPLAZADO_G3`; método local queda deprecado sin consumidor principal |
| `POST /contracts/:id/prepare-installation` | ficha contractual | Preparar instalación | `InstallationIntegrationService.requestInstallation` → G3 | `REEMPLAZADO_G3` |
| `TicketsService.createWorkOrder` | gestión de tickets | Crear visita de reparación | Sin endpoint G3 P0 ratificado | `PENDIENTE_CONTRATO`; no se amplió |
| `WorkOrdersService.completeInstallation` | OT existentes | Cerrar instalación local existente | Conservado para datos previos | `HISTÓRICO` / `READ_ONLY` para nuevas creaciones |
| `WorkOrdersService.completeRepair` | tickets y OT existentes | Cerrar reparación local | Sin contrato G3 de reparación | `PENDIENTE_CONTRATO`; compatibilidad histórica |
| `GET /work-orders` | panel de OT | Consulta de registros locales | Continúa como histórico con fuente `LEGACY_LOCAL` | `HISTÓRICO` / `READ_ONLY` |
| Disponibilidad local de técnicos | formularios anteriores | Agenda propia de G8 | G3 es dueño de agenda | `DEPRECAR_POST_INTEGRACION`; ya no se usa en la UX principal |

## Multiempresa, logging y auditoría

G8 valida empresa en usuario, tracking, Prospecto, Contrato, Plan, Servicio y respuesta G3. Una correlación cruzada se rechaza. Los logs contienen request/trace, ids de correlación, HTTP, duración y resultado; no contienen API key ni payload completo con PII. `LogAuditoria` registra solicitud, retry, aceptación, consulta, cierre/reconciliación, activación, cancelación, cliente ausente y estado desconocido.

## CU-84: retiro de servicio

`ServicioRetiroSolicitud` implementa persistencia real en G8 con motivo, fecha, estado, responsable, Servicio obligatorio, Contrato opcional validado y auditoría. Registrar la solicitud no elimina ni da de baja el servicio.

La gestión usa `GET /api/service-withdrawals`, `POST /api/service-withdrawals` y `PATCH /api/service-withdrawals/:id`, protegidos por JWT, roles de solicitudes y scope de empresa. La ficha de solicitudes registra el retiro estructurado con servicio, fecha y motivo.

El acuerdo G3 inspeccionado cubre instalaciones y no define un endpoint de retiro. Por eso cada solicitud queda con `estadoDespachoTecnico=BLOQUEADO_CONTRATO_G3`; no se crea OT local ni se simula una llamada externa. Estado de CU-84: `PARCIAL_BLOQUEADO_G3`.

Propuesta para ratificación futura, sin implementación: acordar un endpoint S2S, auth y scope de empresa, payload con `request_id`, `trace_id`, `id_empresa`, `id_servicio`, `id_contrato` opcional, motivo y dirección/equipos a retirar; definir idempotencia, estados, cierre y reconciliación antes de programarlo.

## P1 y compatibilidad

- Cobertura/TOMODAT mediante G3: P1; se conserva la abstracción de Etapa 1 sin ampliarla.
- SmartOLT escritura, suspensión, reactivación y WiFi: P1; no hay credenciales SmartOLT en G8.
- Reparaciones y retiros técnicos: pendientes de contratos G3 ratificados.
- Monitoreo ONT/demo: `LEGACY / READ COMPATIBILITY`; no se amplió.

## Pruebas

Las suites G3 usan fakes y mocks locales, nunca infraestructura real. Cubren payload/casing, UUID, idempotencia y retry, respuestas 200/201/400/401/403/404/409/429/5xx/timeout, seis estados y desconocidos, activación única, webhook/reconciliación cruzados, correlación multiempresa, seguridad cerrada, redirección legacy y CU-84. Las suites históricas de WorkOrders continúan validando lectura y cierres locales compatibles con Etapa 0B.
