# Continuidad Incremento 3 — Facturación y cobranza

Fecha de cierre local: 2026-09-29
Rama: `feature/incremento3`
HEAD preservado: `f400993a` (igual a `origin/feature/incremento3`)
Estado general: **IMPLEMENTADO_LOCAL / UNIT_TESTED / READY_FOR_GLOBAL_SCHEMA / PROBADO_RAILWAY_READ / PENDIENTE_RAILWAY_WRITE_TEST / PENDIENTE_RECONCILIACION_GLOBAL**

## 1. Estado inicial y límites de la sesión

El workstream comenzó sobre el HEAD limpio `f400993a`, con el trabajo global anterior ya integrado. Al reanudar después de la interrupción, las modificaciones Billing seguían intactas en el working tree; se inspeccionaron y continuaron sin descartarlas ni rehacerlas. Se conservaron la alineación global, health/readiness, los fixes de G1, OT numérico, multiunidad, retry inmutable y la propuesta `integracion_activacion_g1.payload_snapshot` descritos en [el informe global](i3-global-continuation-report.md).

No se reseteó la rama, no se comenzó desde `develop`, no se hicieron commits, push, merge ni deploy. No se cambió `db/global/init-global.sql`, el SQL de reconciliación, variables ni datos de Railway. Tampoco se usaron seeds o una base local como evidencia funcional.

## 2. Cobertura Billing encontrada antes de modificar

El módulo `backend/src/billing/` ya exponía:

- `GET /api/billing/overview`;
- `POST /api/billing/refresh-delinquency`;
- `POST /api/billing/notifications`;
- `PATCH /api/billing/contracts/:id/suspend`;
- `POST /api/billing/payments`;
- `GET/POST/PATCH /api/billing/zones`;
- `GET/POST /api/billing/zone-rules`.

La interfaz ya tenía una única sección Billing con resumen, mora, cortes, avisos, zonas y precios. El módulo comercial existente ya implementaba eventos, convenios y aprobación administrativa, cuotas, prórrogas, cambios de condición, cargos adicionales, Libro Control y alertas de vencimiento. `external-tax-documents` ya implementaba el registro manual de BOLETA/FACTURA externas, su unicidad, relaciones y panel; se auditó y se mantuvo, sin crear una segunda implementación.

Los defectos principales eran: ausencia de listado/detalle integral de facturas; cálculo monetario con `number`; sobrepagos permitidos; lectura del saldo fuera de la transacción; reactivación basada en presencia/estado nominal de otra factura; mora y corte sin considerar prórrogas aprobadas; mora que nunca volvía a estado activo; auditoría financiera fuera de la transacción; avisos sin validar deuda/empresa y sin evento comercial; y relaciones comerciales que podían aceptar identificadores inexistentes.

## 3. Backend agregado y corregido

### Lectura consolidada

Se agregaron:

- `GET /api/billing/invoices`, con alcance, búsqueda, estado registrado y paginación;
- `GET /api/billing/invoices/:id`, con pagos, convenio/cuotas, prórrogas, cargos del contrato, cambios de condición y eventos de la factura.

El listado calcula monto, pagado, saldo, saldo a favor, saldo exigible, vencimiento efectivo, días de atraso, estado calculado y si acepta pagos. El estado almacenado se conserva como fuente documental; el calculado sirve para operación y distingue `Pendiente`, `Parcial`, `Vencida`, `Pagada`, `Anulada` y `Sin monto` sin persistir estados inventados.

### Saldo y pagos

`invoice-balance.ts` centraliza el cálculo con `Prisma.Decimal`, suma todos los pagos y toma la última prórroga `APROBADA`. Una factura `Pagada` o `Anulada` no es cobrable aunque un registro histórico tenga una diferencia contable.

El registro de pagos ahora:

- exige monto positivo, máximo dos decimales y medio de pago no vacío;
- lee la factura y su saldo dentro de una transacción `Serializable`;
- reintenta conflictos serializables `P2034` hasta tres veces;
- rechaza factura cerrada, sin monto/saldo, sobrepago y referencia duplicada;
- registra pagos parciales sin cerrar la factura;
- marca `Pagada` solo cuando el saldo llega exactamente a cero;
- mantiene pago, cambio de factura, eventual reactivación y auditoría en una sola transacción.

La referencia `codigo_transaccion`, cuando se informa, aprovecha la unicidad física ya definida. Un pago manual sin referencia no tiene idempotencia externa y debe tratarse como una limitación operativa.

### Mora, suspensión y reactivación

La actualización de mora evalúa contratos `Activo/Moroso`, saldo real y vencimiento efectivo. Puede marcar y también limpiar `Moroso`, mantiene el alcance de empresa y omite relaciones legacy inconsistentes.

La suspensión exige una deuda con saldo cuyo atraso efectivo cumpla `BILLING_CUT_DAYS`. Actualiza contrato, cliente y servicios activos dentro de su empresa y registra auditoría en la misma transacción.

Al completar una factura, la reactivación revisa todas las demás facturas abiertas del cliente en la misma empresa. No reactiva si queda otra deuda vencida con saldo. Solo reactiva servicios suspendidos que tengan instalación completada o sean importaciones históricas admitidas por la política; un contrato firmado o una instalación inicial pendiente no se activa por cobrar una factura.

La suspensión/reactivación implementada es el estado comercial local. La ejecución técnica en red permanece **PENDIENTE_G3 / BLOQUEADO_CONTRATO** mientras no exista un contrato ratificado con G3/SmartOLT.

### Avisos y auditoría

Los avisos validan cliente, empresa, factura, saldo y vencimiento efectivo. El último aviso requiere deuda vencida. Cada aviso crea:

1. `log_notificacion`, con estado `Simulado` o `Desactivado` según configuración;
2. `evento_gestion_comercial` con `AVISO_PREVENTIVO` o `ULTIMO_AVISO_CORTE`;
3. `log_auditoria` en la misma transacción.

No se declara entrega por un proveedor externo. La plantilla se busca/crea por empresa. Para ello Prisma ahora proyecta `plantilla_notificacion.id_empresa` y su FK, ya existentes en `init-global.sql`; no se creó migración ni se cambió el contrato global.

`AuditService.record` acepta opcionalmente un cliente transaccional. Los flujos financieros críticos de Billing lo usan para que una escritura no sobreviva si falla su auditoría; el comportamiento tolerante anterior se conserva para los consumidores que no pasan transacción.

### Cobranza comercial reutilizada

Se reutilizaron las APIs existentes, sin duplicarlas:

- `POST /commercial/agreements` y aprobación administrativa;
- `POST /commercial/extensions`;
- `POST /commercial/payment-condition-changes`;
- `POST /commercial/additional-charges`;
- `POST /commercial/events`.

Se reforzó la existencia y coherencia empresa/cliente/contrato/servicio/factura de sus relaciones. El último aviso comercial respeta saldo y prórroga efectiva; no se aprueba un convenio cuya deuda haya desaparecido o cuyo monto ya supere el saldo; las consultas usan la prórroga efectiva más reciente. Los cargos admiten únicamente `REPOSICION`, `RECONEXION`, `RETIRO` y `OTRO`, se crean como `PENDIENTE_FACTURACION` y no alteran por sí mismos el saldo de la factura.

## 4. Frontend

Se extendió la sección Billing existente con `BillingInvoicesPanel`; no se creó un módulo paralelo. La interfaz ofrece:

- listado paginado y búsqueda de factura, folio o cliente;
- estado registrado frente a estado calculado;
- monto, pagos, saldo y vencimiento efectivo;
- modal de detalle con pagos, convenios/cuotas, prórrogas, cargos, cambios y eventos;
- registro de pago;
- creación y revisión de cuotas antes de crear convenio;
- prórroga, condición de pago, cargo y gestión comercial;
- aprobación de convenio solo para administrador.

Las acciones se muestran según permisos y se conectan a las APIs existentes. El build valida tipos y empaquetado. No se pudo hacer inspección visual con el navegador integrado porque el servicio de navegador no estaba disponible en esta sesión; queda pendiente una prueba manual sobre un despliegue habilitado.

## 5. Permisos y multiempresa

Se reutilizaron los permisos existentes:

|Capacidad|Permiso/roles|
|---|---|
|Ver facturación|`VIEW_BILLING`: Administrador, Comercial, Soporte|
|Gestionar pagos, mora, avisos y suspensión|`MANAGE_BILLING`: Administrador, Comercial|
|Gestionar zonas/precios|`MANAGE_PAYMENT_ZONES`: Administrador, Comercial|
|Ver Libro Control|`VIEW_CONTROL_BOOK`: Administrador, Comercial, Soporte|
|Gestionar cobranza comercial|`MANAGE_COMMERCIAL_COLLECTIONS`: Administrador, Comercial|
|Aprobar convenios|Administrador|

Las escrituras tienen defensa en controlador y servicio. Usuarios no administradores quedan forzados a `currentUser.idEmpresa`; un scope distinto se rechaza. Las facturas exigen consistencia entre empresa del contrato y empresa del cliente. Pagos, avisos, mora, suspensión, reactivación y relaciones comerciales validan el mismo límite. Un administrador puede usar alcance consolidado o seleccionar empresa.

## 6. Esquema global y Railway

Tablas canónicas utilizadas: `factura`, `pago`, `cliente`, `contrato`, `servicio_contratado`, `zona_pago`, `plan_zona_precio`, `convenio_pago`, `cuota_convenio_pago`, `prorroga_pago`, `cambio_condicion_pago`, `cargo_adicional`, `evento_gestion_comercial`, `documento_tributario_externo`, `log_notificacion` y `plantilla_notificacion`.

La introspección real del 2026-09-29T21:49:15.786Z se ejecutó con `scripts/verify-global-db.mjs` dentro de una transacción `READ ONLY`. Resultado: **FAIL / PENDIENTE_RECONCILIACION_GLOBAL**, pero con avance sustancial respecto de la lectura anterior:

|Objeto|Estado actual|
|---|---|
|Tablas|90/90 esperadas presentes|
|Columnas|876/876 esperadas presentes|
|FK|210/210 esperadas presentes|
|Objeto ausente|1 índice: `prospecto_id_cliente_key`|
|Diferencias|3 defaults; 2 nulabilidades|
|Revisión requerida|31 restricciones `CHECK` cuya expresión aún no coincide según el verificador|
|Extras conservados|`_prisma_migrations` y `integracion_activacion_g1.payload_snapshot`|

Las diferencias de nulabilidad están en `secuencia_srv.id_empresa` y `secuencia_srv.anio`; los defaults distintos en `orden_ingreso.estado`, `prestamo_externo.estado` e `integracion_cierre.estado_proceso`. Las 31 revisiones incluyen restricciones Billing/comerciales, por lo que no se asume equivalencia aunque las tablas estén presentes.

No se actualizó el reporte histórico de Railway ni se ejecutó el reconciliador, porque el humano mantiene ese flujo en paralelo. El código queda **READY_FOR_GLOBAL_SCHEMA**, pero ninguna escritura remota fue autorizada: **PENDIENTE_RAILWAY_WRITE_TEST**.

## 7. Validación ejecutada

|Clasificación|Comando|Resultado|
|---|---|---|
|UNIT_TEST|`npm.cmd test`|54 suites backend aprobadas, 450 tests aprobados; 5 suites/8 tests omitidos. 10 tests Node globales aprobados.|
|UNIT_TEST focalizado|Billing y control comercial|5 suites, 50 tests aprobados.|
|BUILD|`npm.cmd run build`|Backend y frontend aprobados; advertencia Vite por chunk de 589.75 kB.|
|LINT|`npm.cmd run lint`|0 errores; 79 advertencias preexistentes (1 backend, 78 frontend).|
|PRISMA|`npx.cmd prisma validate --schema prisma/schema.prisma`|Schema válido.|
|PRISMA_GLOBAL|`npm.cmd run db:audit:prisma-global`|58 modelos; 798 objetos modelados coinciden. La única columna `PRISMA_ONLY` sigue siendo `payload_snapshot`, propuesta ya documentada.|
|RAILWAY_READ_TEST|`node --env-file=.env.railway scripts/verify-global-db.mjs`|Lectura real exitosa; `FAIL` por 1 objeto ausente y 38 diferencias/revisiones.|
|RAILWAY_WRITE_TEST_NOT_EXECUTED|No ejecutado|Excluido durante la reconciliación humana.|

No se ejecutaron DDL, INSERT, UPDATE, DELETE, migraciones, `db push`, init, reconciliación ni seeds en Railway.

## 8. Riesgos y pendientes

- La reconciliación global debe llegar a PASS antes de pruebas de escritura o despliegue: **PENDIENTE_RECONCILIACION_GLOBAL**.
- Falta probar el ciclo completo de Billing contra Railway con una empresa y facturas de prueba controladas: **PENDIENTE_RAILWAY_WRITE_TEST**.
- No existe proveedor real de envío para avisos; hoy quedan explícitamente simulados/desactivados: **PENDIENTE_G2** si el canal pertenece a una integración externa acordada.
- No existe webhook/idempotency key obligatoria para pagos externos; el flujo implementado es registro manual y usa `codigo_transaccion` opcional.
- Las cuotas del convenio no se concilian automáticamente con pagos porque el contrato físico no relaciona `cuota_convenio_pago` con `pago`; su evolución de estado sigue siendo gestión comercial manual.
- Pueden crearse varios convenios pendientes sobre una misma deuda; aprobación vuelve a comprobar el saldo, pero no hay exclusión física entre convenios.
- Los cargos `PENDIENTE_FACTURACION` no se incorporan a una factura automáticamente; falta un proceso de facturación acordado.
- La acción técnica de corte/reactivación está **PENDIENTE_G3 / BLOQUEADO_CONTRATO**.
- CU-61 continúa **PENDIENTE_G1 / BLOQUEADO_CONTRATO** por consumo histórico P2; CU-18 y CU-84 continúan **PENDIENTE_G3 / BLOQUEADO_CONTRATO**; WiFi/SmartOLT siguen **BLOQUEADO_CONTRATO**.
- G1 se preservó sin activar `G1_INTEGRATION_ENABLED` y sin ejecutar POST. La prueba GET real sigue **PENDIENTE_G1** hasta contar con key configurada legítimamente.

## 9. Archivos cambiados

Backend:

- `backend/prisma/schema.prisma`;
- `backend/src/audit/audit.service.ts`;
- `backend/src/billing/billing.controller.ts`;
- `backend/src/billing/billing.module.ts`;
- `backend/src/billing/billing.service.ts`;
- `backend/src/billing/billing-read.service.ts`;
- `backend/src/billing/invoice-balance.ts`;
- `backend/src/billing/dto/invoice-query.dto.ts`;
- `backend/src/billing/dto/register-payment.dto.ts`;
- pruebas Billing nuevas/actualizadas;
- `backend/src/commercial/commercial-control-book.service.ts` y sus pruebas.

Frontend:

- `frontend/src/api.ts`;
- `frontend/src/features/billing/BillingPanel.tsx`;
- `frontend/src/features/billing/BillingInvoicesPanel.tsx`.

Documentación:

- `docs/i3-billing-continuation-report.md`;
- actualización acumulativa de `docs/i3-global-continuation-report.md`;
- `docs/i3-prisma-vs-global-schema.md` y `.json`, regenerados después de proyectar `plantilla_notificacion.id_empresa`.

`db/global/init-global.sql` y `db/global/reconcile-railway-to-init-global.sql` permanecen sin cambios.

## 10. POST-RECONCILIATION STATE

La sección 6 conserva la lectura histórica anterior a la corrección del contrato. Después de que el operador humano aplicó la reconciliación, el canónico incorporó `integracion_activacion_g1.payload_snapshot JSONB NULL` y eliminó el índice único inválido `prospecto_id_cliente_key`.

La verificación Railway `READ ONLY` del `2026-09-29T22:48:09.805Z` obtuvo **PASS**: 90 tablas, 877 columnas, 90 PK, 210 FK, 33 checks, 106 índices, 1.495 coincidencias y solo `_prisma_migrations` como extra permitido. Billing pasa de `READY_FOR_GLOBAL_SCHEMA / PENDIENTE_RECONCILIACION_GLOBAL` a **READY_FOR_RAILWAY_WRITE_TEST**, pero el test de escritura sigue pendiente.

Se preparó `scripts/smoke-billing-write.mjs` y no se ejecutó. Requiere `ALLOW_RAILWAY_BILLING_WRITE_TEST=1`, aborta antes de abrir conexión sin el flag, rechaza `NODE_ENV=production`, usa exclusivamente marcadores `TEST_G8_BILLING_*` y fuerza rollback de una transacción que cubre factura, pago parcial, rechazo de sobrepago, pago final, mora, prórroga, convenio/cuota, cargo e aislamiento de empresa. Los tests del gate comprueban el aborto seguro y que la salida no revele la conexión.

La UI se validó nuevamente mediante TypeScript y build de Vite. El navegador integrado continúa no disponible y el frontend no incluye un framework de pruebas de componentes, por lo que la prueba visual/manual permanece declarada como no ejecutada.

### Validación acumulada final

|Clasificación|Resultado|
|---|---|
|`UNIT_TEST`|55 suites/455 tests backend PASS; 5 suites/8 tests omitidos.|
|`GLOBAL_CONTRACT_TEST`|19 tests Node PASS, incluidos normalizador, S2S, env validator, smoke G1 y gate Billing.|
|`BUILD`|Backend Nest y frontend TypeScript/Vite PASS; advertencia Vite por chunk de 589,75 kB.|
|`LINT`|PASS con 0 errores y 78 advertencias frontend preexistentes; 0 advertencias backend.|
|`PRISMA`|`prisma validate` PASS.|
|`PRISMA_GLOBAL`|58 modelos; 799 `MATCH`, 36 `COLUMN_GLOBAL_ONLY`, 304 `OWNER_EXTERNAL`, 47 `INDEX_MISMATCH` y 65 `FK_MISMATCH`; sin `PRISMA_ONLY`.|
|`RAILWAY_READ_TEST`|PASS real a las `2026-09-29T22:48:09.805Z`; solo lectura.|
|`G1_REAL_GET_NOT_EXECUTED`|No había key legítimamente configurada; no se hizo HTTP real.|
|`RAILWAY_WRITE_NOT_EXECUTED`|El arnés Billing solo se probó mediante su gate/mocks; no se conectó ni escribió.|
|Revisión estática|`git diff --check` PASS.|
