# Validación local — integración terreno G8/G3

Fecha: 2026-11-08. Base `fd24aeb169d6d227fd653032a7185db6097b62c7`, rama `Fix/integracionTerreno`. Sin commit nuevo. Alcance funcional y contratos: [informe](i4-g8-g3-integracion-terreno.md).

## Resultados efectivamente ejecutados

| Verificación | Resultado final |
|---|---|
| Tickets, clientes, HTTP multiempresa, G3, G1, S2S y RUT dirigidos | 23 suites; 528 PASS, 0 FAIL |
| Regresión backend completa | 86 suites PASS; 5 suites omitidas; 1.480 tests PASS, 0 FAIL, 9 omitidos |
| Frontend completo | 117 PASS, 0 FAIL |
| Herramientas globales, smoke con transporte simulado e higiene | 33 PASS, 0 FAIL |
| Backend build | PASS |
| Frontend TypeScript + Vite build | PASS; aviso de chunk mayor de 500 kB |
| Backend lint | PASS, sin errores |
| Frontend lint | 0 errores, 77 advertencias en Dashboard/DashboardHome; no modificados |
| Prisma generate y validate | PASS; generación de cliente local, sin conexión PostgreSQL |
| Diff check del alcance propio | PASS |
| Diff check global | Advertencia preexistente: espacios al final de línea 23, `frontend/src/features/plans/PlanZonesModal.tsx`; conservada |
| Stage | Vacío |
| PostgreSQL / proveedores reales | NO EJECUTADO |

Los 528 dirigidos son un subconjunto de los 1.480; no sumar ambos. Se añadieron 19 casos backend y 2 frontend. Los escenarios internos de cada caso prueban matrices de estados/roles/referencias; no se cuentan como pruebas PostgreSQL.

La regresión incluye pagos, consultas de deuda, Webpay, convenios, billing, emisión tributaria, S2S G2, autenticación, instalaciones, cierre G3, recuperación G1 y separación empresarial existentes. Esto demuestra regresión con mocks/loopback, no certificación de las bases o proveedores reales.

## Qué demuestran las regresiones nuevas

- El RUT compacto puede consultarse sin reescribir identidad. El RUT inválido se rechaza. Dos candidatos no se fusionan ni se toma el primero.
- Se preserva la prioridad de búsqueda por contrato numérico autorizado, aun si coincide con una grafía válida de RUT compacto.
- El cliente compartido Moroso puede solicitar soporte de su contrato/servicio legítimo; no se escribe estado financiero ni se crea una OT.
- Se aplica filtro empresarial a la consulta de candidatos y se verifica cliente/servicio/contrato antes de crear un ticket. Coincidir en RUT no autoriza acceso.
- Estados técnicos y desconocidos conservan su literal, incluida la distinción Escalado/DERIVADO_OT. No se crea una segunda fila ni se invoca G3 automáticamente.
- Categoría, prioridad, estado, diagnóstico y notas de tickets técnicos son solo lectura, también para administrador. Primero se verifica empresa; JEFE_TECNICO no adquiere el rol Soporte.
- Se condiciona la actualización CRM al estado y empresa observados; P2025 se transforma en conflicto, sin auditoría de éxito ficticia.
- La UI muestra los tickets técnicos sin controles de escritura, incluso con backend anterior. Un guardado comercial legítimo actualiza el indicador de estado sin retener una etiqueta anterior.
- EN_CURSO sigue siendo seguimiento; no activa. Se aceptan referencias coincidentes en origen_integracion y se rechazan referencias ajenas, malformadas o contradictorias.
- El 409 de consulta de cierre pendiente solo se reconoce como pendiente con detalle y correlación independientes; nunca se interpreta como evidencia de activación.
- Un RUT compacto existente sin vínculo contractual bloquea una instalación antes del tracking/POST y también antes de escrituras de activación. Un cliente compacto explícitamente vinculado conserva su estado global Moroso.

## Entorno y reproducibilidad

En este checkout existen archivos privados `.env`. No se leyeron, renombraron ni modificaron. Las pruebas se lanzaron mediante un runner local ignorado en `.codex-review/integracionTerreno-20261108/run-safe.mjs`, basado en `isolatedQaEnv()` del script de aceptación existente.

El runner descarta credenciales heredadas, utiliza URL sintética inaccesible en loopback y desactiva proveedores y pruebas DB opt-in. Precarga `scripts/qa-loopback-only.cjs` y un bloqueo de lectura de los `.env` privados del checkout. Las suites configuran sus propios mocks o servidores loopback. Prisma puede imprimir «Environment variables loaded from .env» o `Schema Env Error: QA_PRIVATE_ENV_NOT_LOADED`; la lectura privada está interceptada y no se expusieron valores. El primer mensaje no prueba carga efectiva de credenciales.

Se permitió `safe.directory` únicamente para este checkout mediante variables del proceso QA, sin modificar configuración global Git. El build Vite requirió salir del sandbox por ACL del ejecutable esbuild; mantuvo las mismas barreras de entorno/red. No se ejecutó frontend contra una URL productiva.

Comandos locales usados desde la raíz:

```powershell
node .codex-review/integracionTerreno-20261108/run-safe.mjs generate
node .codex-review/integracionTerreno-20261108/run-safe.mjs prisma
node .codex-review/integracionTerreno-20261108/run-safe.mjs targeted tickets customers common/company-response.http g3-integration g1-integration integration-auth rut
node .codex-review/integracionTerreno-20261108/run-safe.mjs backend
node .codex-review/integracionTerreno-20261108/run-safe.mjs frontend
node .codex-review/integracionTerreno-20261108/run-safe.mjs backendBuild
node .codex-review/integracionTerreno-20261108/run-safe.mjs backendLint
node .codex-review/integracionTerreno-20261108/run-safe.mjs frontendType
node .codex-review/integracionTerreno-20261108/run-safe.mjs frontendBuild
node .codex-review/integracionTerreno-20261108/run-safe.mjs frontendLint
node .codex-review/integracionTerreno-20261108/run-safe.mjs tools
```

Para reproducir fuera de este equipo: usar un checkout QA sin `.env` privados, entorno sintético con proveedores deshabilitados y barrera de red loopback. Los trabajos equivalen a `npm --prefix backend test -- --runInBand`, `npm --prefix frontend test`, builds/lint de cada workspace y `prisma generate/validate`. No sustituir por start, migrate, seed, db push ni el script de smoke real. El runner ignorado no es una dependencia productiva ni debe publicarse con datos privados.

## Incidencias durante la validación y resolución

1. Cliente Prisma generado localmente era anterior al esquema integrado: faltaban modelos de imputación de cuotas. Se regeneró desde el esquema sin modificarlo; build y suite completa quedaron aprobados.
2. El doble de persistencia de `company-response.http.spec.ts` no interpretaba relaciones `some`. Se amplió su intérprete; se conservaron todas las expectativas de aislamiento y relaciones válidas/inconsistentes.
3. El nuevo caso HTTP utilizó inicialmente una nota inferior al mínimo del DTO. Se corrigió el fixture sintético, conservando la validación real.
4. La primera etiqueta UI incluyó jerga de integración. El test de mensajes productivos lo detectó; se sustituyó por un aviso operativo y la suite completa pasó.
5. Sandbox negó acceso de esbuild y Git detectó propietario distinto dentro del proceso QA. Se resolvieron como restricciones locales, sin cambiar código productivo para evitar las pruebas.

## Archivos propios de esta intervención

```text
backend/src/common/company-response.http.spec.ts
backend/src/customers/customers.service.ts
backend/src/g3-integration/g3-integration.types.ts
backend/src/g3-integration/installation-activation.service.ts
backend/src/g3-integration/installation-activation.service.spec.ts
backend/src/g3-integration/installation-integration.service.ts
backend/src/g3-integration/installation-integration.service.spec.ts
backend/src/rut/rut.util.ts
backend/src/tickets/ticket-ownership.ts                         (nuevo)
backend/src/tickets/tickets-compatibility.spec.ts               (nuevo)
backend/src/tickets/tickets-authority.http.spec.ts
backend/src/tickets/tickets.service.ts
frontend/src/api.ts
frontend/src/features/tickets/TicketManagementModal.tsx
frontend/src/features/tickets/TicketsPanel.tsx
frontend/src/features/tickets/ticket-presentation.ts
frontend/tests/tickets-authority.test.mjs
docs/i4-g8-g3-integracion-terreno.md                            (nuevo)
docs/i4-g8-g3-integracion-terreno-validacion.md                 (nuevo)
```

Los comentarios locales previos de RUT, TicketsService y TicketsPanel permanecen y aparecerán también en el diff de esos archivos. Los otros siete archivos previamente modificados no forman parte de esta corrección: coverage-domain.service.ts, coverage.controller.ts, plans.controller.ts, plans.service.ts, tickets.controller.ts, CoverageZonesPanel.tsx y PlanZonesModal.tsx. No se incorporó nada al stage.

Se preservaron `-f`, evidencias QA, output y respaldos. Hay copia y manifiesto de los diez archivos iniciales en la carpeta ignorada de revisión. No se eliminaron ni sobrescribieron worktrees históricos.

## Garantías pendientes

No se validó concurrencia PostgreSQL real, sincronización entre bases, unicidad normalizada intergrupo ni idempotencia de tickets G3. La actualización condicional se probó con Prisma simulado; requiere QA PostgreSQL futura antes de certificar concurrencia física.

El vocabulario no demuestra por sí solo propiedad histórica de una fila. La política conservadora bloquea estados técnicos/desconocidos y mantiene las operaciones CRM existentes; el contrato definitivo necesita atribución ratificada. Activo/ACTIVO, altas/ediciones, baja/retiro, adopción idempotente, autoridad por campo y eventos técnicos siguen pendientes del acuerdo detallado en el informe.

```text
LOCAL_COMPATIBILITY_TESTS=PASS
FULL_G8_G3_INTEGRATION=NOT_CERTIFIED
NEW_COMMERCIAL_S2S_WRITES_ENABLED=false
AUTOMATIC_TICKET_HANDOFF_ENABLED=false
G2_FINANCIAL_SOURCE_MODIFIED=false
SCHEMA_MODIFIED=false
MIGRATIONS_MODIFIED=false
DATABASE_USED=false
REAL_PROVIDER_POSTS=0
VPS_MODIFIED=false
OTHER_WORKTREES_MODIFIED=false
STAGED_FILES=0
COMMIT=false
PUSH=false
DEPLOY=false
```
