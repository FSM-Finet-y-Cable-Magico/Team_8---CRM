# Incremento 4 — P0-02: Tickets y autoridad técnica G3

Fecha de validación: 24 de octubre de 2026 (America/Santiago).
Base: `develop`, `0bb22b1fd415fa32070f12bb3c9f06f09d85e70a` (PR #55).
Rama: `fix/i4-p0-02-tickets-autoridad-g3`.

## Diagnóstico por ruta y comportamiento final

| Ruta / función | Antes | Después |
| --- | --- | --- |
| `POST /api/tickets/:id/diagnosis` / `registerDiagnosis` | Resolvía el ticket, copiaba `estadoFinalServicio` a `Cliente.estado` y volvía a actualizar una OT histórica a Completada con nuevo historial. | Resuelve únicamente el ticket y conserva el diagnóstico en su descripción. No escribe Cliente, Contrato, ServicioContratado, OrdenTrabajo ni HistorialOt. Ticket y auditoría del diagnóstico se confirman en una misma transacción. |
| `POST /api/tickets/:id/work-order` / `createWorkOrder` | Creaba OT, código, historial y escalaba el ticket mediante persistencia local. El control previo de duplicados no constituía una integración G3. | Valida existencia y acceso empresarial al ticket, registra el intento y responde HTTP 410 con `code=G3_INTEGRATION_REQUIRED`. No crea OT ni modifica el ticket, incluso ante retries concurrentes o una OT existente. |
| `PATCH /api/tickets/:id/status` / `updateStatus` | Modificaba exclusivamente el ticket; rechazaba resolver/cerrar cuando existía una OT no completada. | Mantiene esa política comercial. El mensaje ya no indica utilizar el cierre local; identifica autoridad G3 y la ratificación pendiente. |
| `PATCH /api/work-orders/:id/complete-repair` | El controlador llamaba al servicio legacy, que cerraba OT y ticket y podía activar el servicio. Era una alternativa activa al bypass desde Tickets. | El controlador usa el bloqueo de autoridad G3 existente: HTTP 410, auditoría y ninguna consulta/escritura de OT o estados comerciales. Se conservan guards y validación del DTO. |
| `GET /api/tickets`, `GET /api/work-orders` y notas técnicas | Lectura de tickets/OT históricas y gestión de notas. | Se conservan. No se migra, reconcilia ni modifica el histórico. |

`estadoFinalServicio` conserva nombre y valores del DTO (`Activo`, `En Mantencion`) por compatibilidad: representa una observación del diagnóstico, no una instrucción de cambio financiero ni de estado del servicio.

### Reglas y trazabilidad

- Clientes Activo, Moroso y Suspendido mantienen su estado global. También se conservan contratos y servicios de ambas empresas en clientes compartidos.
- Con una OT no completada, diagnóstico resolutivo y transición a Resuelto/Cerrado continúan bloqueados. Se pueden registrar observaciones, clasificar, priorizar y avanzar el seguimiento comercial permitido sin cerrar la OT.
- Sin OT, o con OT ya completada, el diagnóstico puede resolver el ticket sin modificar el histórico técnico.
- Se conservan causa raíz, problema, acciones, observaciones y notas previas en la descripción del ticket. La auditoría incluye estado anterior/nuevo, causa raíz y estado observado.
- Un fallo al persistir la auditoría del diagnóstico aborta también la actualización del ticket. Esto usa el soporte transaccional existente de `AuditService`, sin modificar dicho servicio.
- El rechazo de creación valida el ámbito del ticket antes de consultar cualquier dato técnico. El rechazo global de cierre de reparación no consulta el identificador de OT y no permite inferir su existencia o empresa.
- Administradores conservan gestión consolidada del ticket, pero tampoco pueden suplir a G3 creando o cerrando OT locales.

## Consumidores y compatibilidad

Se inspeccionaron `TicketsController`, `TicketsPanel`, `WorkOrdersController`, `WorkOrdersPanel`, sus llamadas reales y las pruebas existentes. Los cambios observables son intencionales:

- Tickets deja de ofrecer agenda, técnico y creación de OT local; muestra la dependencia pendiente con G3 y mantiene la consulta de OT asociada.
- El diagnóstico explica que solo resuelve el ticket y no cambia Cliente, Contrato o Servicio. Conserva el payload anterior.
- El panel de OT conserva tabla y detalle histórico, pero elimina el formulario y la llamada de cierre de reparación. Ya no promete que un cierre local resuelva el ticket.
- Clasificación, prioridad, notas y seguimiento comercial conservan sus rutas y payloads. Los consumidores React conservan sus props públicas.

No se modifican endpoints/payloads S2S, adaptadores, webhook, idempotencia, activación de instalaciones, sincronización G1 ni contratos de G2/G3. PR #51–55 se conservan. La OT real #53 no se consulta ni reconcilia.

El método interno legacy `WorkOrdersService.completeRepair` se conserva, igual que otras implementaciones históricas, pero deja de tener una ruta HTTP que lo invoque. La búsqueda de consumidores confirma que solo lo usan sus pruebas históricas. No reexponerlo como alternativa al bloqueo. La cancelación de instalaciones y los otros flujos ratificados no se modifican en esta intervención; este documento no declara eliminadas todas las escrituras legacy del repositorio.

## Dependencias de G3 que requieren ratificación

La matriz local `docs/i3-g3-fsm-integration.md` identifica reparación/soporte como `PENDIENTE_CONTRATO`. No existe allí un acuerdo que autorice reutilizar el endpoint de instalaciones.

Antes de habilitar derivación o recepción de cierre de reparación deben acordarse entre grupos:

1. Ruta, autenticación y ámbito de empresa para reparación/soporte.
2. Correlación ticket, cliente, servicio, contrato y OT; deduplicación e idempotencia.
3. Estados y resultado del cierre, consulta/reintento, errores y recuperación.
4. Política comercial ante OT cancelada, incompleta o histórica; consecuencias autorizadas sobre el ticket. Un resultado técnico no autoriza borrar deuda ni suspensión.

La ejecución de reparaciones desde CRM permanece **bloqueada por contrato pendiente**. El operador puede conservar el seguimiento en Tickets; ese seguimiento no demuestra que G3 haya recibido una solicitud. No se implementó un endpoint inventado, un cierre simulado ni una reparación histórica.

**CU-75 y CU-76 no se declaran completamente integrados.** La derivación y el cierre de reparaciones siguen pendientes de ratificación con G3; las pruebas locales de P0-02 no constituyen certificación E2E.

## Pruebas y resultados

Se añadieron **39 pruebas backend HTTP con persistencia simulada** y **6 pruebas frontend sobre los componentes reales**. Las pruebas HTTP usan controladores, servicios, guards de rol y AuditService reales; simulan JWT y Prisma, incluida confirmación/rollback de la transacción. No importan AppModule ni usan credenciales, bases o clientes externos.

Cobertura: ambas empresas, cliente compartido, estados Activo/Moroso/Suspendido, observación técnica Activo/En Mantencion, OT ausente/completada/pendiente, causa raíz y notas, auditoría y rollback, rechazos de empresa/rol/ID, administrador, retries concurrentes, consulta histórica y ausencia de escrituras financieras o técnicas. Frontend prueba el payload de diagnóstico, deshabilitación del cierre con OT pendiente, notas/escalamiento, lectura histórica y ausencia de botones/llamadas de creación/cierre local.

| Validación ejecutada | Baseline | Resultado P0-02 |
| --- | --- | --- |
| Dirigidas P0-01, PR #53/#54/#55, G1/G2/G3 + P0-02 | 543 aprobadas | **582 aprobadas, 27 suites** |
| Órdenes y autoridad de dominio, ejecución adicional | — | **29 aprobadas, 3 suites** |
| Backend disponible, sin `integration.spec.ts` | 1086 aprobadas y 3 fallidas | **1125 aprobadas y 3 fallidas**, 1128 total; 75 suites aprobadas y 3 fallidas |
| Frontend | 35 aprobadas | **41 aprobadas** |
| Build backend/frontend | Aprobados | **Aprobados** |
| Lint backend | Sin errores | **Sin errores** |
| Lint frontend | 78 advertencias | **0 errores, 78 advertencias** |
| `git diff --check` | Aprobado | **Aprobado** |

La regresión completa no está verde. Se reprodujeron por nombre los mismos fallos:

- `billing.service.spec.ts`: último aviso con prórroga y suspensión con prórroga; fixtures con fecha fija `2026-10-10`, ya vencida.
- `external-tax-documents.boundaries.spec.ts`: espera `Registrar metadata`, pero la interfaz ofrece `Registrar documento`.
- Adicionalmente, la suite `mail.service.spec.ts` no arranca por fallo de OpenSSL al generar certificados TLS en Windows. No se cuenta como un cuarto caso fallido.

No se modificaron esas suites ni sus módulos. Continúa pendiente ejecutar las pruebas PostgreSQL de integración en una base QA aislada y autorizada. No se afirma validación de producción ni E2E intergrupal. El build Vite mantiene la advertencia conocida por un bundle mayor de 500 kB.

Comandos ejecutados (en Windows con `npm.cmd`):

```text
npm --prefix backend test -- --runInBand --silent tickets-authority.http.spec.ts
npm --prefix backend test -- --runInBand --silent company-response services.service.spec.ts requests.service.spec.ts customers.service.spec.ts companies.service.spec.ts customer-lifecycle.spec.ts prospects.service.spec.ts contracts.service.spec.ts g3-integration g1-integration g2-integration tickets-authority
npm --prefix backend test -- --runInBand --silent work-orders domain-ownership
npm --prefix backend test -- --runInBand --silent --testPathIgnorePatterns=integration.spec.ts
npm --prefix frontend test -- --run
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix frontend run lint
git diff --check
```

## Alcance y evaluación

Archivos: `tickets.service.ts`, `work-orders.controller.ts`, `TicketsPanel.tsx`, `WorkOrdersPanel.tsx`, `tickets-authority.http.spec.ts`, `tickets-authority.test.mjs` y este documento.

**LISTO_PARA_PR para la corrección local P0-02**, sujeto a revisión de los rechazos HTTP intencionales y de las limitaciones documentadas. No equivale a reparación G3 integrada ni a cierre del Incremento 4.

`develop` se sincronizó exclusivamente por fast-forward y se creó una rama normal en el mismo checkout. Se preservan `-f`, `output/`, respaldos e históricos. No se ejecutan migraciones, seeds, pagos, Railway, tráfico a G1/G2/G3, cambios productivos, commit, push ni despliegue. No se crea un merge commit. La única consulta remota de preparación es el fetch Git solicitado.
