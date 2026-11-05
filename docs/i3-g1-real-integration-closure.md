# Cierre de integración real G8 → G1

Fecha de actualización: 2026-10-01. Rama de trabajo: `feature/incremento3`. Esta evidencia no autoriza deploy, cambios de variables Railway ni nuevas escrituras en G1.

## Resultado final

El smoke real sobre Railway quedó aprobado para el alcance G8 → G1 y para la lógica de conciliación interna de G1:

- `G1_PUBLIC_URL=PASS`
- `G1_X_API_KEY=PASS`
- `G1_COMPANY_SCOPE=PASS`
- `G1_GET_TYPES=PASS`
- `G1_GET_UNIT=PASS`
- `G1_GET_SERVICE_EQUIPMENT=PASS`
- `G1_ACTIVATION=PASS`
- `G1_IDEMPOTENCY=PASS`
- `G1_PENDING_CLOSURE_SEMANTICS=PASS`
- `G1_ACTIVATION_CLOSURE_RECONCILIATION=PASS`
- `G1_ACTIVE_ASSIGNMENT=PASS`
- `G8_TO_G1_REAL_RAILWAY=PASS`
- `G1_RECONCILIATION_LOGIC=PASS`
- `FULL_REAL_G3_TO_G1_CROSS_GROUP_E2E=PENDING`

El último estado es deliberadamente pendiente: el cierre técnico usado en este smoke fue simulado por G1 mediante su webhook. No se atribuye ese evento a G3 ni se declara probado el recorrido completo con G3 real.

## Alcance contractual confirmado

El flujo vigente es exclusivamente **G8 → G1**. G1 puede consultar el health público de G8, pero no consume endpoints de negocio G8. No se implementó `/api/integrations/g1/status`, callback ni otra operación inbound. La infraestructura inbound preexistente queda inactiva con `G8_INTEGRATION_API_KEYS=[]`.

Base URL pública G1: `https://backend-production-6ada.up.railway.app`. El cliente recibe únicamente el origen y agrega una sola vez `/api/integraciones/...`; una URL configurada con `/api` se rechaza para impedir duplicaciones.

## Evidencia real comunicada

Datos coordinados del smoke:

- `id_empresa=1`
- `numero_serie=QA-ONT-F-0001`
- `id_ot=900001`
- `id_cliente=1`
- `id_servicio=900001`
- `id_contrato=900001`
- `event_id=smoke-g8-8f9f25a04a404a8f9ed5ff3a16f68bf0`

| Paso | Resultado real | Clasificación |
|---|---|---|
| GET tipos de equipo | Catálogo real para empresa 1 | `PASS` |
| GET unidad por serie | Unidad QA retornada dentro del scope | `PASS` |
| POST activación inicial | `success=true`, `duplicado=false`, `equipos_asociados=0` | `PASS / PENDIENTE_CIERRE` |
| Retry exacto | Mismo `event_id` y payload; `duplicado=true` | `IDEMPOTENCY_PASS` |
| Cierre técnico | G1 simuló mediante su webhook el cierre de OT 900001 para empresa 1 | `G1_SIMULATED_CLOSURE` |
| GET equipos posterior | Incluye `QA-ONT-F-0001`, estado `Instalado en cliente`, OT 900001 y fecha de instalación | `PASS` |
| GET unidad posterior | `asignacion_actual` referencia cliente 1, servicio 900001, contrato 900001 y OT 900001 | `PASS` |

La primera respuesta con `equipos_asociados=0` fue correcta: G1 había aceptado el evento y esperaba el cierre técnico. Después del cierre simulado por G1, las dos lecturas confirmaron la asociación activa. Codex no ejecutó estos requests y no debe ejecutarse otro POST real durante esta etapa.

El evento ya aceptado no debe reutilizarse con un payload distinto.

## Semántica del tracking G8

Una respuesta HTTP 2xx demuestra transporte y aceptación del request, pero no basta por sí sola para marcar el tracking G8 como completado:

- si `equipos_asociados` coincide con todas las series solicitadas, el tracking puede quedar `COMPLETADA`;
- si devuelve cero para un request con equipos, queda `PENDIENTE_SINCRONIZACION_G1` con código `G1_EQUIPMENT_ASSOCIATION_PENDING`;
- si falta el conteo, queda pendiente sin afirmar una asociación;
- correlaciones inválidas, conteos inválidos o asociaciones parciales incoherentes quedan en `ERROR_G1`.

El estado pendiente frente a cero asociaciones no contradice el smoke final. Protege el intervalo válido `PENDIENTE_CIERRE` hasta que G1 procese el segundo evento. La conciliación final de este smoke se comprobó mediante GET posteriores; no se inventa que la respuesta inicial hubiera asociado el equipo.

## Adaptador y seguridad

`HttpG1InventoryClient`:

- exige un origen HTTPS sin path, query, fragmento ni credenciales; HTTP solo se admite en loopback local;
- evita duplicar `/api`;
- envía la API key literal únicamente en `X-API-KEY`, desde backend;
- exige IDs PostgreSQL positivos (`1..2147483647`) antes de abrir la conexión;
- usa `AbortController`, timeout entero de `1..60000` ms y `redirect: error`;
- exige envelope `success=true` con `data`;
- valida `id_empresa` en tipos, unidad y equipos;
- valida las correlaciones `event_id` e `id_servicio` cuando G1 las devuelve;
- normaliza `400`, `401`, `403`, `404`, `409`, `429` y `5xx` sin propagar el body remoto ni secretos;
- no consulta ni escribe inventario físico local como fallback.

Configuración prevista:

```dotenv
G1_API_URL=https://backend-production-6ada.up.railway.app
G1_API_KEY=<secret administrado por Railway>
G1_REQUEST_TIMEOUT_MS=8000
G1_INTEGRATION_ENABLED=false
G8_INTEGRATION_API_KEYS=[]
```

La key real no se copió a Git, frontend, variables `VITE_*`, documentación, fixtures ni logs. El flag permanece en `false` hasta probar el E2E con G3 real y completar la revisión operativa del deploy.

## Validación local

- Tests específicos G1: 3 suites y 64 tests aprobados.
- Backend completo: 56 suites y 476 tests aprobados; 5 suites y 8 tests opcionales omitidos por sus gates.
- Herramientas globales locales: 22/22; runtime frontend: 3/3.
- Build backend/frontend y Prisma generate/validate: aprobados.
- Lint: cero errores; 78 advertencias frontend preexistentes.
- `git diff --check`: aprobado.
- Auditor de secretos: reporte redactado, sin exponer valores.
