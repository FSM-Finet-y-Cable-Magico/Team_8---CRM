# G8: consolidación de la baja por morosidad con `main` y el PR #81

**Fecha:** 13-11-2026 · **Rama:** `feat/g8-baja-morosidad-consolidada-20261113`, creada desde `origin/main` `d5fb0714` en un worktree limpio.

**Fuentes comparadas (no se reescribió ninguna):**

| Referencia | SHA | Base (merge-base con main) | Commits propios |
|---|---|---|---|
| `origin/main` | `d5fb0714` | — | Incluye los 7 tickets, Nominatim, cotizaciones, contratos, firma y filtrado G1 (PR #86/#87), ya desplegado. |
| Rama actual `feat/g8-baja-morosidad-g1-g3-20261113` | `632afae0` | `1db94534` | 10 (incluye la Fase 1 `f9a03409`). |
| PR #81 `integrate/p0b-jean-claude-20261112` | `c3486103` | `b4439871` | 14. |

**Método:**
- `merge-base` y diferencias de tres puntos de cada rama contra `main`.
- Comparación de blobs de cada archivo en las tres referencias.
- Lectura de los commits y comparación funcional de rutas, DTO, contratos y casos de prueba.
- Validación con SQL real en una PostgreSQL efímera que contiene el esquema global completo.

**Nada se ejecutó en la VPS ni en `finet_global_validacion`.** Los interruptores siguen apagados por defecto: `G3_WITHDRAWAL_DISPATCH_ENABLED`, `WITHDRAWAL_FINALIZE_ENABLED` y `WITHDRAWAL_TRACKING_ENABLED`.

## 1. Matriz de diferencias y decisiones

| Funcionalidad | Rama actual (632afae) | PR #81 (c3486103) | main (d5fb0714) | Decisión | Riesgo de regresión | Pruebas |
|---|---|---|---|---|---|---|
| Formulario «Iniciar baja y retiro» en el Libro de Control (`ControlBookWithdrawal.tsx`) | No existe; solo hay API. | Formulario con contexto precargado, observación ≥ 10, confirmación, doble clic y respuesta de otro servicio descartada. Integrado en `ControlBookDrawer`. | No existe. | **Adaptar.** Se porta el formulario al backend consolidado. La elegibilidad agrega `contexto` (solo lectura) con la dirección de retiro, el DTO exige `confirmacion: true` y el mensaje indica si la orden técnica quedó creada o pendiente. Sin estilos nuevos. | Bajo: la acción solo aparece con un servicio suspendido en el plan elegido y permiso de gestión. | `control-book-withdrawal.test.mjs` (11), `withdrawal-and-returning-ui.test.mjs` (4), `control-book-record.test.mjs`, dispatch spec «elegibilidad para el formulario» (2). |
| Servicio de retiro (`service-withdrawal.service.ts` frente a `withdrawal-workflow.service.ts`) | `WithdrawalWorkflowService`: inicio atómico, despacho idempotente, seguimiento, cancelación, recepción y finalización. `ServiceWithdrawalService` queda para la gestión manual (y el PATCH no cancela retiros gestionados con G3). | Todo en `ServiceWithdrawalService`; finalize sin contrato G3 ratificado. | Gestión manual de solicitudes. | **Conservar la rama actual.** Se descarta la implementación del PR #81. | — | Specs de dispatch, closure y finalize de la rama actual. |
| Columna pública `solicitud_retiro_servicio.estado_despacho_tecnico` | Escribía `PENDIENTE_ENVIO_G3`, `ENVIADA_G3`, `ENVIO_G3_PENDIENTE`, `REVISION_G3`, `COMPLETADA_G3` y `CANCELADA`. | Siempre `BLOQUEADO_CONTRATO_G3`. | CHECK global: **solo** `BLOQUEADO_CONTRATO_G3`. | **Corregir con el criterio del PR #81.** La columna no cambia y el estado vive en `g8_retiros.solicitud_g3`. **Defecto bloqueante:** en la base real cada inicio fallaba (500 con rollback). | Alto si no se corregía; nulo tras el cambio. | `withdrawal-boundaries.spec.ts` lee los CHECK de `init-global.sql`. La integración en PostgreSQL efímera inserta la fila real y el valor antiguo se rechaza. |
| Permisos de `finalize` (baja efectiva) | Administrador, Comercial o Soporte. | Solo Administrador. | — | **Recuperar del PR #81:** solo Administrador. Las demás rutas no cambian. | Bajo. | `withdrawal-boundaries.spec.ts` (permisos por ruta). |
| Baja directa (`services.service.ts › deactivate`) | No la impedía (solo con una solicitud activa). | `MOROSITY_WITHDRAWAL_REQUIRED` para servicio suspendido con deuda exigible vencida. | Solo bloquea con una solicitud activa. | **Recuperar del PR #81.** | Bajo: servicio activo, deuda pagada, prórroga, convenio o ausencia de documentos conservan la baja administrativa. | `service-retirement-safety.spec.ts` (+9). |
| Excliente al terminar la última relación (baja directa) | Solo dentro de `finalize`; la vista derivada mostraba el prospecto vinculado. | `ensureReturningProspect` en `deactivate`, marcando `clasificacionComercial = EXCLIENTE`. | — | **Adaptar:** `deactivate` llama a `ensureFormerCustomerProspect` (criterio FINET 13-11). Reutiliza el prospecto vinculado sin escribir, o crea uno en «Fuera pipeline». No marca `clasificacionComercial`. | Medio-bajo: agrega escritura (prospecto y auditoría) a una baja no morosa; un fallo revierte la baja. | `service-retirement-safety.spec.ts` (+5). |
| Deuda (`customer-debt.ts`, `overdue-debt.ts`) y guarda de contratación | `overdue-debt.ts` (idéntico al PR #81). La etiqueta del excliente usaba una regla propia (solo `idCliente`). | `customer-debt.ts` compartido por guarda y etiqueta (cliente + alias de RUT). | Guarda con su propia consulta (misma regla que `customer-debt`). | **Recuperar `customer-debt.ts` del PR #81.** La guarda (comportamiento idéntico) y la etiqueta del excliente lo usan. | Bajo. Antes la etiqueta podía decir «sin deuda» a quien la guarda bloquea. | `returning-contract-debt.spec.ts` (PR #81, sin cambios), `former-customer-debt.spec.ts` (4), prospects spec. |
| `returning-customer.ts`: excliente en Prospectos | Vista derivada sin estados ni columnas; reutiliza sin reescribir; etiqueta calculada. | Marca `clasificacionComercial`/`disponibleRemarketing` y filtra por esa marca. | — | **Conservar la rama actual** (criterio FINET 13-11 posterior al PR #81). Se descarta `customer-lifecycle.ts` del PR #81. | — | prospects spec, finalize spec, `prospects-search.test.mjs`. |
| Prospectos, factibilidad y estados por empresa | Listado con exclientes por empresa, `excliente` en la API. | Equivalente con la marca persistida. | RUT canónico (TK-04), estados por empresa (TK-02/05), Nominatim. | **Integrar ambos lados.** Único conflicto: `prospects-search.test.mjs`, donde se conservan los dos casos. | Bajo. | prospects spec, `prospects-search.test.mjs`. |
| Ticket «Baja de servicio» | Se crea en el inicio y se cierra solo dentro de un `finalize` exitoso; categoría por nombre. | Se crea en el inicio; categoría por nombre. | TK-01..09 sin cambios en esta lógica. | **Conservar la rama actual.** Se agrega el caso del PR #81 «otro ambiente, otro ID». | Bajo. | `withdrawal-ticket-close.spec.ts`, `withdrawal-ticket-create.spec.ts` (5). |
| Pago durante el retiro | `finalize`: decisión comercial, sin baja ni reactivación. `dispatch`: no envía si se regularizó. | Política «pago por etapa» (mismo criterio). | **`registerPayment` reactivaba el servicio suspendido aunque tuviera retiro activo.** | **Corregir (nuevo):** el pago y la factura se registran igual, pero no se reactiva el servicio con retiro activo ni se pasa a Activo el contrato o cliente moroso por ese pago. | Medio: toca la reactivación por pago (no el registro del pago). La respuesta, incluida la de G2, no cambia. | billing spec (+3), `g2-shared-finance.http.spec.ts` (17). |
| Contratos G3: payload OT BAJA, respuestas, reintentos, cancelación, GET | Contrastado con G3 `8a8e5dd0`/`fe9ad2a`; snapshot y hash; backoff de 6 intentos. | Contrato propuesto, no ratificado (`clave = id_ot:fecha`, `cierre_aprobado`). | — | **Conservar la rama actual.** Se descarta el contrato del PR #81. | — | `g3-withdrawal-contract.spec.ts`, dispatch spec. |
| Cierre G3 (webhook) BAJA, INSTALACION y REPARACION | Handler BAJA propio; el webhook nunca aplica la baja. Fase 1 (`f9a0340`): DTO acepta los 9 campos compartidos vigentes. | Sin la Fase 1. | Sin la Fase 1 (los cierres REPARACION/INSTALACION reales pueden dar 400). | **Conservar.** La Fase 1 es aislable en un PR pequeño (§3). | Bajo. | `g3-closure.http.spec.ts`, `g3-closure-contract.spec.ts`. |
| Recepción G1 | Contrato real G1 `2131b7f5` (envoltura, `estado_recepcion`, `estado_g1` null en NO_RECIBIDO), validador estricto y versiones inmutables. | Contrato anterior que rechazaba campos reales. | Filtrado/proyección G1 (8b672013); `getEquipmentByService` acepta ítems sin `id_empresa`. | **Conservar la rama actual.** Con `main`, la verificación previa a `finalize` de equipos aún asociados en G1 queda operativa (antes respondía 403 y fallaba cerrada). La recepción devuelve al navegador solo un resumen. | Bajo. | `withdrawal-evidence.spec.ts`, closure spec, `g1-projection.spec.ts`. |
| Migración 002 (`g8_retiros`) | Revisada: snapshot, trace, cierre, recepción insert-only, CHECK; verify con `to_regnamespace`; grants sin DELETE. | Versión anterior (verify fallaba sin esquema, V7 con falso positivo). | — | **Conservar la rama actual.** `grants.sql` sin rol ahora termina con error (antes `\quit 1` salía con 0). | — | `withdrawal-boundaries.spec.ts` y validación efímera (§2). |
| Migración 003 (excepción por equipos no recuperados) | No existe. | Propuesta. | — | **No incorporar.** La excepción sigue deshabilitada por política. | — | El test exige que la 003 no exista. |
| Seguimiento automático | Cada 5 min, solo GET, apagado por defecto. | No existe. | — | Conservar. | — | `withdrawal-tracking.processor.spec.ts`. |
| Documentación | Informe de fases 1-5. | Informes de cierre, contrato G3/G1, revisión de la 002, pendientes QA y capturas. | — | Se conserva el informe actual, actualizado con la base efectiva. Los documentos del PR #81 quedan como referencia en el PR (superados por los contratos reales). | — | — |

**Tests del PR #81 sin portar y su cobertura en la rama consolidada:**

| Test del PR #81 | Por qué no se porta | Cobertura actual |
|---|---|---|
| `service-withdrawal-flow.spec.ts` | API anterior. | Specs de dispatch, closure y finalize, más `withdrawal-ticket-create`. |
| `withdrawal-closure.spec.ts` | Reglas del contrato anterior y excepción 003. | `withdrawal-evidence.spec.ts` y closure spec. |
| `g1-reception-contract.spec.ts` | Contrato G1 anterior. | Contrato real en `withdrawal-evidence.spec.ts`. |
| `returning-customer.spec.ts` | Marca persistida. | Vista derivada en el prospects spec y en finalize. |

**Revisión caso por caso:** no queda ningún comportamiento válido del PR #81 sin integrar.

## 2. Base de datos (Fase 4)

- **Base efectiva de G8 en la VPS:** `finet-postgres-global` / `finet_global_validacion`, confirmada con la conexión real de Prisma y PostgreSQL. **No** es `crm_g8_prueba`. Ver el informe §6.2.
- **Validación en PostgreSQL 16 efímera:** contenedor `g8moro-consolidacion` en `127.0.0.1:18452`, base `g8moro_consolidacion`, ya eliminado. Se cargó el esquema global **completo** de `db/global/init-global.sql` con filas sintéticas.

| Paso | Resultado |
|---|---|
| `verify.sql` antes | OK sin esquema. Huellas V6 registradas (cliente 2, contrato 1, servicio 1, prospecto 1). |
| `002_service_withdrawal.sql` dos veces | OK e idempotente (segunda pasada: «already exists, skipping»). |
| `grants.sql` con `g8_app_test` | OK. Sin rol: antes salía con 0; tras la corrección sale con 3 y no concede nada. |
| `verify.sql` después y al final | 3 tablas, PK/UNIQUE/CHECK, 0 FK, nada para PUBLIC, V7 = 0. **Huellas V6 idénticas** antes y al final. |
| Rol de aplicación real | DELETE, UPDATE de evidencia, TRUNCATE, CREATE y DROP en `g8_retiros`: **denegados**. Sin permisos explícitos tampoco lee `public`. |
| Spec de integración como rol de aplicación | 8 de 8, todo con rollback (0 filas al terminar). Incluye la fila pública real que crea el inicio y el rechazo del valor de despacho antiguo por el CHECK global. |

## 3. PR separado de la Fase 1 (REPARACION/INSTALACION)

`f9a03409` es un único commit (5 archivos, sin migraciones), aislable con seguridad:
- su padre `1db94534` está en `develop` y se integra sin conflictos;
- ya está en `origin` (forma parte de `632afae0`);
- es ancestro de esta rama, así que si se integra primero, este PR se reduce solo, sin duplicar cambios.

## 4. Criterios FINET del 13-11-2026 (segunda instrucción) aplicados

| Criterio | Implementación | Pruebas |
|---|---|---|
| Bloquear la reactivación manual de un servicio con retiro activo hasta que la solicitud se cancele o se resuelva, sin alterar reparaciones de otros servicios. | `common/active-withdrawal.ts`. `PATCH /services/:id` a Activo responde 409 `SERVICE_WITHDRAWAL_ACTIVE` con auditoría de rechazo. El cierre de reparación con estado final Activo responde 409 dentro de la transacción, sin escrituras; puede cerrarse con otro estado final. La misma condición rige el pago y la baja directa. | `work-orders.service.spec.ts` (+3), `service-retirement-safety.spec.ts` (+1), billing (+3). |
| Excliente a quien terminó sus relaciones operativas en esa empresa, incluso con baja directa legítima; nunca a quien conserva otro servicio o contrato operativo. | Vista derivada `formerCustomerInCompanyWhere` + `ensureFormerCustomerProspect` en `finalize` y en `deactivate`. | prospects spec, `service-retirement-safety.spec.ts`, finalize spec. |
| Clasificación derivada, sin estados nuevos ni clientes duplicados. | No hay columnas ni estados nuevos. El prospecto vinculado se reutiliza sin escribirlo; solo se crea uno (estado existente «Fuera pipeline») si falta. Nunca se crea ni modifica un cliente. | Ídem. |
| Consulta de solo lectura que cuente los exclientes históricos por empresa. | `db/g8/queries/exclientes-historicos.readonly.sql`: READ ONLY + ROLLBACK, solo conteos por empresa. | Control estático en `withdrawal-boundaries.spec.ts` y comparación con la condición de la aplicación en PostgreSQL efímera (6 escenarios). |

## 5. Riesgos residuales

- **Datos históricos:** la vista de excliente también muestra a quien terminó sus relaciones antes de esta rama. Hay que ejecutar la consulta de §4 sobre la base efectiva (solo lectura, por quien tenga acceso) antes de activar.
- La QA E2E real con G3/G1 sigue pendiente (gates del informe §8).
