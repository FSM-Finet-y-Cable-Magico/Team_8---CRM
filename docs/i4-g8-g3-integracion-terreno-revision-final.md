# Revisión complementaria — candidato integración terreno

Fecha: 2026-11-08. Rama `Fix/integracionTerreno`; HEAD sin cambios: `fd24aeb169d6d227fd653032a7185db6097b62c7`. No se creó commit ni se publicó la rama.

Complementa el [contrato propuesto e informe inicial](i4-g8-g3-integracion-terreno.md) y la [validación anterior](i4-g8-g3-integracion-terreno-validacion.md). Esos documentos y sus evidencias se conservan como registros de la primera intervención; los resultados finales de esta revisión figuran aquí.

## 1. OT finalizada: defecto confirmado y corrección

Antes, `TicketsService.list()` calculaba `hasOpenWorkOrder` con `estado !== 'Completada'` y `assertNoPendingWorkOrderForClosure()` buscaba el mismo literal negativo. Una OT G3 `COMPLETADA` resultaba abierta y bloqueaba diagnóstico, resolución y cierre comercial del ticket. La interfaz repetía la comparación: incluso con el indicador backend corregido, seguía bloqueando y podía seleccionar una OT finalizada en lugar de otra realmente pendiente.

Se añadió una equivalencia de lectura exacta, limitada a `Completada` y `COMPLETADA`. Backend comparte el criterio entre el indicador y el filtro de cierre (`notIn`); frontend aplica los mismos dos valores al seleccionar la OT y comprobar pendientes. No se cambia ningún estado almacenado ni payload.

| Estado OT recibido | Indicador / bloqueo de finalización | Efecto automático |
|---|---|---|
| Completada o COMPLETADA | No bloquea por esa OT | Ninguno |
| EN_CURSO, Pendiente, ASIGNADA | Bloquea | Ninguno |
| CANCELADA | Bloquea: cancelación no acredita ejecución completada | Ninguno |
| PENDIENTE_APROBACION, desconocido, grafías no ratificadas | Bloquea conservadoramente | Ninguno |
| Varias OT, una no completada | Bloquea aunque las otras estén finalizadas | Ninguno |

`hasOpenWorkOrder` conserva su función histórica de bloqueo por falta de finalización acreditada; no convierte una cancelación en una OT ejecutándose. No se redefine el modelo técnico de G3.

Una lectura no resuelve tickets, no activa clientes/contratos/servicios y no confirma una instalación. La acción humana autorizada sobre un ticket CRM conserva sus reglas y escribe solo ticket/auditoría. Un ticket técnico o desconocido sigue solo lectura aunque todas sus OT estén COMPLETADA. Un bloqueo backend explícito sigue prevaleciendo en la interfaz.

Pruebas HTTP: ambas empresas, diagnóstico/Resuelto/Cerrado, identidad compartida Moroso, OT original intacta, cero escrituras por GET, otra OT EN_CURSO/cancelada/desconocida y bloqueo de ticket RESUELTO técnico. Se conservan las pruebas de rollback de auditoría y de OT legacy Completada.

El modelo Prisma declara `OrdenTrabajo.estado` no nullable; no se cambió esa definición. La consulta se verificó mediante pruebas con intérprete de predicados Prisma, no contra un catálogo PostgreSQL real.

## 2. Vocabulario no demuestra propiedad

El archivo conserva su nombre histórico `ticket-ownership.ts`, pero la función interna se llama ahora `ticketStateCompatibility()`. Sus comentarios explicitan que el vocabulario no identifica autor, origen o propietario, ni otorga permisos. No se añadió un campo que afirme propiedad confirmada.

La respuesta mantiene `estado` original, `vocabularioEstado`, `estadoPresentacion` y `soloLecturaTecnica`. Vocabulario G8 significa únicamente coincidencia con los literales CRM existentes. La autorización sigue dependiendo de guardas/roles, empresa y relaciones; no surge del nombre de un estado. No se habilitaron operaciones nuevas por esa clasificación.

Se conserva la restricción sobre ABIERTO, EN_PROGRESO, DERIVADO_OT, RESUELTO y valores desconocidos, también para administradores y origen CRM. No se traduce DERIVADO_OT a Escalado para escribir. Resolver o cerrar una reparación FSM por G8 continúa sin contrato ratificado.

La atribución definitiva de tickets compartidos requiere el contrato durable de adopción/correlación descrito en el informe inicial. Esta revisión no lo sustituye por una heurística ni habilita la derivación automática.

## 3. RUT histórico y duplicados

Se confirmó un defecto del candidato previo: aceptaba como entrada un RUT con puntos, pero solo consultaba almacenamiento con guion y compacto. Una fila histórica con puntos podía quedar fuera de la detección.

`rutLookupVariants()` conserva la validación de DV y la normalización G8. Para consultas añade las grafías convencionales con puntos, con/sin guion y K/k. Ejemplo sintético:

```text
12345670-K     12345670K     12.345.670-K     12.345.670K
12345670-k     12345670k     12.345.670-k     12.345.670k
```

También admite cuerpos de siete dígitos y conserva sus dígitos originales. No elimina ceros iniciales, no reescribe filas, no modifica RUT de contratos ni genera equivalencias con otra identidad. No se promete reconocer distribuciones arbitrarias de puntos o espacios históricos fuera de estas grafías.

Las búsquedas existentes de clientes y tickets incorporan las variantes mediante el helper, manteniendo filtros empresariales y conflicto por múltiples candidatos. En instalación y activación se sustituyó el bucle de consultas `findUnique` por una única comprobación de existencia `findFirst`, con `in` y comparación insensible a mayúsculas. No se utiliza esa primera fila para asociar al cliente: cualquier coincidencia sin vínculo contractual explícito bloquea, sin devolver sus datos.

Esto evita multiplicar consultas al ampliar variantes y conserva el vínculo por PK/contrato como autoridad. Un cliente ya vinculado con RUT histórico válido puede activar solo su servicio objetivo sin reescribir identidad, empresa principal ni estado financiero global. No se altera el snapshot original de la solicitud.

Pruebas nuevas: equivalencia con puntos/K, DV inválido, ambigüedad entre dos filas, bloqueo antes de tracking/POST, bloqueo dentro de activación sin escrituras y cliente explícitamente vinculado con RUT punteado/K en estado global Suspendido.

Limitación conservada: la unicidad textual no impide altas concurrentes con distintas grafías entre aplicaciones. Requiere ratificación y, si procede, una restricción normalizada aprobada. No se ejecutó ni preparó una reparación de identidades históricas ni una migración por esta revisión.

## 4. Instalación y finanzas preservadas

EN_CURSO sigue siendo exclusivamente seguimiento. No se cambiaron los estados aceptados por el procesador de cierre, correlaciones, hashes/snapshots, idempotencia, autorización multiempresa, separación de técnicos, recuperación poscierre ni contrato S2S G1/G2/G3. Se repitieron sus suites.

No se modificó código ni fixtures de G1, G2, Webpay, pagos, billing, convenios o emisión tributaria. Las pruebas de estos módulos forman parte de la regresión completa. No se creó una bandeja comercial ni se habilitaron altas, ediciones, bajas o derivaciones S2S pendientes de ratificación.

## 5. Resultados reales

Antes de cambiar producción se añadieron regresiones: 47 PASS y 2 FAIL backend dirigidos; 117 PASS y 2 FAIL frontend. Los fallos demostraron OT COMPLETADA considerada abierta, variantes históricas omitidas y dos manifestaciones del problema de OT en la UI. Son defectos del candidato anterior detectados por pruebas nuevas, no fallos históricos de otros módulos.

| Validación final | Resultado |
|---|---|
| Dirigidos: Tickets, clientes, HTTP multiempresa, G3, G1, S2S, RUT | 536 PASS, 0 FAIL; 23 suites |
| Backend completo | 1.488 PASS, 0 FAIL, 9 omitidas; 86 suites aprobadas y 5 omitidas |
| Frontend completo | 120 PASS, 0 FAIL |
| Herramientas e higiene | 33 PASS, 0 FAIL |
| Backend build | PASS |
| Frontend TypeScript / Vite build | PASS |
| Lint backend | PASS |
| Lint frontend | 0 errores; 77 advertencias en archivos no modificados |
| Prisma validate | PASS; sin conexión a DB |
| Diff propio | Sin problemas de espacios |
| Diff global | Conserva espacios preexistentes en PlanZonesModal.tsx:23 |

Se añadieron 8 pruebas backend y 3 frontend respecto de la intervención anterior. Los 536 dirigidos son subconjunto de los 1.488, no un resultado adicional acumulable. No se quitaron ni relajaron las validaciones anteriores; los dobles se adaptaron a `findFirst` de existencia y `notIn` de estados.

Advertencias preexistentes: las 77 de lint frontend, chunk Vite mayor de 500 kB y el espacio en blanco de PlanZonesModal. El aviso `QA_PRIVATE_ENV_NOT_LOADED` corresponde al bloqueo deliberado de lectura privada del harness, no a una conexión real fallida. No quedó un fallo de prueba o build nuevo ni preexistente en las suites efectivamente ejecutadas. Las 9 pruebas omitidas no están certificadas.

## 6. Ejecución reproducible y evidencias

Runner y resultados nuevos: `.codex-review/integracionTerreno-revision-20261108/`. Copia del runner seguro anterior, conservando sus variables sintéticas, proveedores deshabilitados, bloqueo de `.env` privado y sockets restringidos a loopback. No se inició una aplicación contra credenciales operativas. Build Vite ejecutado con esas mismas barreras y permiso local para esbuild fuera del sandbox por sus ACL.

```powershell
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs targeted tickets customers common/company-response.http g3-integration g1-integration integration-auth rut
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs backend
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs frontend
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs backendBuild
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs frontendType
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs frontendBuild
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs backendLint
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs frontendLint
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs prisma
node .codex-review/integracionTerreno-revision-20261108/run-safe.mjs tools
```

Se conservan `red-targeted.json`, `red-targeted.log`, `red-frontend.log`, informes finales y hashes en esa carpeta nueva. No se sobrescribieron los resultados de `.codex-review/integracionTerreno-20261108/` ni las evidencias de output/docs existentes. Los runners locales ignorados no son dependencias del producto.

## 7. Alcance exacto de esta revisión

```text
backend/src/tickets/ticket-work-order-state.ts                 nuevo
backend/src/tickets/ticket-ownership.ts
backend/src/tickets/tickets.service.ts
backend/src/tickets/tickets-authority.http.spec.ts
backend/src/tickets/tickets-compatibility.spec.ts
backend/src/rut/rut.util.ts
backend/src/rut/rut.util.spec.ts
backend/src/g3-integration/installation-activation.service.ts
backend/src/g3-integration/installation-activation.service.spec.ts
backend/src/g3-integration/installation-integration.service.ts
backend/src/g3-integration/installation-integration.service.spec.ts
frontend/src/features/tickets/ticket-presentation.ts
frontend/src/features/tickets/TicketManagementModal.tsx
frontend/tests/tickets-authority.test.mjs
docs/i4-g8-g3-integracion-terreno-revision-final.md             nuevo
```

Inventario inicial: `git status --porcelain --untracked-files=all` devolvió 90 rutas pendientes, un conteo desglosado distinto de las 74 mencionadas. Se registraron sus hashes antes de editar. Los cambios ajenos al listado permanecen intactos; no se limpió ni ocultó el estado existente. Los comentarios de trazabilidad anteriores se mantienen. Stage vacío, HEAD y worktrees históricos sin cambios.

Artefactos de revisión nuevos, fuera del stage:

- `g8-g3-review-incremental.patch`: únicamente esta revisión respecto del candidato recibido, con sus comentarios previos como contexto.
- `g8-g3-candidate-revised.patch`: candidato completo respecto de HEAD, limitado al alcance de integración; excluye los siete archivos de comentarios ajenos identificados en el informe anterior.
- `final-review-evidence.json`: hashes, resultados y comprobación de preservación. Se verifica que ambos patches correspondan al contenido actual sin aplicarlos.

## 8. Recomendación

Candidato de compatibilidad apto para revisión de integración de código. No constituye certificación de sincronización compartida o aceptación del contrato comercial/técnico futuro. Mantener las ratificaciones del informe inicial: Activo/ACTIVO, autorización comercial, atribución/correlación durable de tickets y reparación/retiro.

No se usó PostgreSQL, VPS, Railway ni proveedores reales; no se ejecutaron migraciones, commits, push o despliegues. La concurrencia física y los flujos intergrupo pendientes requieren QA autorizada posterior. No se declara producción lista ni se integra automáticamente.
