# F3 — Imputación manual de pagos a cuotas: implementación y QA

04-11-2026. Rama `fix/i4-cierre-funcional-final`; base `79b5bbcd9d1ebbf46d051212161ed712f7842fbb`.
Autorización expresa del propietario: implementación manual, explícita y auditada,
con migración solo en desarrollo/PostgreSQL QA aislado. Sustituye el bloqueo de
decisión comercial anterior; no habilita asignación automática ni regularización masiva.
Diseño previo: [modelo y límites](i4-f3-imputaciones-diseno.md).

## Modelo y política implementados

- `operacion_imputacion_cuota`: empresa, pago, factura, convenio, operador,
  auditoría obligatoria, clave idempotente por empresa, hash, tipo, motivo y fecha.
- `imputacion_cuota`: operación, cuota, importe Decimal(12,2) y referencia a la
  aplicación original para compensaciones. Relación muchos a muchos mediante filas.
- No se crean ni modifican pagos, facturas, estados globales de cliente,
  contratos, servicios, emisiones tributarias, mensajes ni eventos G1/G2/G3.
- El saldo del pago considera aplicaciones y compensaciones de **todos** los
  convenios de su factura. La identidad compartida no permite cruzar contratos
  o empresas. Se valida la cadena convenio→factura→contrato→cliente y el servicio
  cuando está asociado; no se autoriza por empresa principal del cliente ni RUT.
- Solo `APROBADO` admite nuevas operaciones. No se completa ni cancela el
  convenio automáticamente. Los registros inconsistentes requieren revisión.
- `PARCIAL` se deriva del importe neto; físicamente conserva `PENDIENTE` o
  `VENCIDA` existente. Solo saldo cero produce `PAGADA`. `fechaPago` de cuota
  corresponde al último pago que aún contribuye al importe cubierto, no a la
  fecha de conciliación. La fecha y el monto originales de Pago no cambian.
- Históricos `PAGADA`/con fecha de pago sin ledger y cuotas canceladas quedan
  en `REQUIERE_REVISION`. No se deduce pago de cuota de una factura sin deuda.
- Reversa total o parcial = operación positiva compensatoria ligada a su
  aplicación original. No borra filas ni devuelve el pago bancario.

## Atomicidad, idempotencia y concurrencia

Validaciones, auditoría, cabecera, detalles y actualización de cuotas se ejecutan
en una transacción Serializable (`maxWait=10000`, `timeout=20000`). Locks de pago
y cuotas ordenadas por ID; revalidación de saldos dentro de la misma transacción.
Hasta tres intentos por conflicto; no se usan bloqueos en memoria como garantía.

El QA detectó `P2010`, SQLSTATE `40001`, al competir por `SELECT ... FOR UPDATE`.
Se corrigió el reintento de toda la transacción para `P2034`, colisión única
`P2002` y `P2010` exclusivamente con `40001`/`40P01`. Otros errores SQL se propagan.
Agotar los intentos devuelve 409, conservando la clave para reintento explícito.

Hash canónico: operación, convenio, pago, referencia original, motivo normalizado
y cuotas ordenadas con montos exactos. Misma clave/distribución retorna la
operación persistida (`duplicado=true`); contenido incompatible devuelve 409.
Orden de cuotas y `3500` frente a `3500.00` no cambian la distribución. Una
reversa repetida no vuelve a liberar saldo. Auditoría fallida revierte todo.

## API adicional y permisos

Prefijo normal de API del proyecto + estas rutas; sin cambiar contratos S2S:

|Método y ruta|Permiso|Resultado|
|---|---|---|
|GET `/commercial/agreements/:id/allocations`|Administrador, Comercial, Soporte|Detalle exacto, saldos, pagos existentes, historial; empresa restringida salvo administrador consolidado|
|POST `/commercial/agreements/:id/allocations`|Administrador|Imputación explícita y auditoría atómicas|
|POST `/commercial/agreements/:id/allocations/:allocationId/reverse`|Administrador|Compensación parcial/total de la aplicación indicada|

POST de aplicación: `{idPago, clave, motivo, cuotas:[{idCuota, monto:"3500.00"}]}`.
POST de reversa: `{clave, motivo, monto:"1000.00"}`. Montos son strings decimales
de hasta dos decimales, nunca float inferido del navegador. Empresa, operador,
auditoría, factura y convenio se resuelven/verifican en backend. Campos adicionales
no permitidos son rechazados por la validación HTTP existente.

## UI y evidencia ejecutada

Libro de Control → historial → Contactos, avisos y acuerdos → convenio →
**Ver cuotas e imputar pagos existentes**. La factura pagada sigue accesible en
el historial. Un convenio sin empresa verificable no ofrece el panel.

1. Revisar cuotas, vencimientos, monto, imputado, saldo y estado.
2. Seleccionar pago existente e introducir importes de una o varias cuotas.
   Se sugiere el vencimiento más antiguo sin preseleccionar ni ejecutar.
3. Escribir motivo, pulsar **Revisar operación**, revisar distribución y confirmar.
4. Ver historial, operador y referencia de auditoría. Se refresca también el
   historial padre para no mantener cuotas obsoletas junto al resultado confirmado.
5. Para compensar, **Preparar reversa**, indicar importe/motivo y confirmar.

La confirmación queda congelada durante envío y conserva su clave/payload tras
error incierto. Volver a consultar permite revisar el ledger antes de preparar
otra operación. Respuestas tardías de otra empresa no contaminan el panel.
Solo el backend decide `puedeImputar`; los roles de consulta no tienen botones de escritura.

Evidencia de UI: siete pruebas React ejecutadas con render e interacción real
de componentes (`frontend/tests/installment-allocations.test.mjs`): selección
explícita, confirmación, precisión, errores, reintento, lectura/revisión histórica,
reversa y respuesta tardía. **No se ejecutó aceptación visual en navegador ni
se fabricaron capturas**. Coordinar las dos líneas de integración de
`ControlBookHistory.tsx` con el responsable UI; no se cambia Clientes/Tickets.

## PostgreSQL real: antes/después

PostgreSQL **18.6**, dos clusters nuevos identificados por UUID y marcador propio,
loopback, credenciales aleatorias efímeras, datos sintéticos. URL externa/.env no
aceptados. Cluster detenido y eliminado tras verificar propiedad. Cero llamadas
externas y cero escrituras compartidas. El catálogo completo hace MATCH contra
el canónico en los dos modos: instalación nueva y actualización del esquema anterior.

Reproducción $7.000, dos pagos G2 de $3.500 y dos cuotas de $3.500:

|Momento|Factura|Pagos|Cuota 1|Cuota 2|Auditorías de imputación|
|---|---|---|---|---|---|
|Después de registrar pagos, antes de imputar|Pagada|2, $7.000|Pendiente|Pendiente|0|
|Después de ambas confirmaciones manuales|Pagada|Los mismos 2, $7.000|Pagada, $3.500|Pagada, $3.500|2|
|Después de repetir pago G2 y clave de aplicación|Sin cambios|Sin duplicación|Sin duplicación|Sin cambios|Sin duplicación|

26 escenarios PASS (13 grupos de comprobaciones en cada modo). Correspondencia
con los 20 escenarios exigidos, usando los sufijos del harness:

|N.º|Escenario exigido|Prueba PostgreSQL (ambos modos)|
|---|---|---|
|1|Pago cubre cuota completa|`7000_two_3500_explicit_only_g2_and_replay`|
|2|Dos pagos cubren una cuota|`partial_two_payments_one_quota_exact_decimals`|
|3|Pago entre varias cuotas|`one_payment_many_quotas_authorized_advance`|
|4|Imputación parcial|`partial_two_payments_one_quota_exact_decimals`|
|5|Adelanto autorizado|`one_payment_many_quotas_authorized_advance` (vencimiento 2099)|
|6|Pago insuficiente|`insufficient_overallocation_invalid_amounts_and_conflicting_key`|
|7|Sobreimputación rechazada|El anterior y `same_invoice_multiple_agreements_share_payment_balance`|
|8|Idempotencia|Caso $7.000 y `audit_failure_rolls_back_and_replay_survives_service_restart`|
|9|Clave con contenido distinto|`insufficient_overallocation_invalid_amounts_and_conflicting_key`|
|10|Concurrencia|`concurrent_operators_independent_connections_same_payment` y `concurrent_different_payments_same_quota_and_same_key`|
|11|Reversa total/parcial|`compensating_partial_full_repeated_and_concurrent_reverse`|
|12|Reversa repetida|El anterior, incluida reversa concurrente|
|13|Empresa ajena|`company_scope_shared_identity_permissions_and_wrong_invoice`|
|14|Identidad compartida|El anterior; estado global Moroso y empresa principal preservados|
|15|Convenio sin aprobación|`unapproved_inconsistent_relations_and_legacy_paid_rejected`|
|16|Pago de otra factura|`company_scope_shared_identity_permissions_and_wrong_invoice`|
|17|Pago G2 existente|Caso $7.000 con `registerIntegrationPayment` real y replay de código|
|18|Factura pagada y cuotas pendientes|Caso $7.000 antes/después manual|
|19|Históricos preservados|`untouched_history_global_financial_states_and_fk_integrity` y rechazo de histórico sin ledger|
|20|Nueva base/upgrade|`migration_preserves_existing_financial_rows`, además rollback deliberado del DDL|

Se verifica además rollback de auditoría aun cuando el INSERT se ejecutó antes
de la falla simulada, FK huérfana rechazada, estados contractuales Suspendido
intactos, e igualdad entre operaciones y auditorías financieras persistidas.

## Regresión y reproducción

- Backend: **1.441 PASS, 9 omitidas**, 85 suites aprobadas; 19 pruebas nuevas de
  API/permisos/invariantes/reintentos incluidas. Cero fallos.
- Frontend: **68 PASS**, incluidas las siete nuevas. Cero fallos.
- Herramientas de esquema/higiene: **33 PASS**.
- Build backend/frontend y Prisma validate/generate aprobados.
- Lint: cero errores; 78 advertencias frontend preexistentes. Build frontend
  conserva advertencia de tamaño de chunk, sin error de compilación.
- SQL QA adicional: tributario/G2 **17 PASS**, geografía F1 **3 PASS**, historial
  F2 **4 PASS**, métricas CU47/F4 **9 PASS**. Sin proveedores reales.
- Recuperación P0-05 G3/G1: **8 PASS**, incluidas conexiones independientes,
  reinicio, pérdida de ACK y respuesta tardía. G1 es un servidor HTTP local
  simulado. Se ejecutó el harness existente cambiando únicamente la ruta de
  salida en memoria hacia `.codex-review/f3-p005-*.json`; la evidencia histórica
  versionada permanece intacta. Total PostgreSQL de esta intervención: **67 PASS**.
- La reproducción histórica tributaria sigue dejando cuotas pendientes **sin
  imputación explícita**, como exige ahora la política. Su etiqueta histórica
  `BLOCKED_BUSINESS_DECISION` no certifica ni invalida la implementación F3 nueva.
- Proyección Prisma: 63 modelos, 36 filas nuevas MATCH. Las diferencias previas
  de proyección (53 índices y 65 FK) no aumentan; el verificador físico completo
  sí hace PASS sobre PostgreSQL QA. No usar `db push` para eliminar diferencias.

Desde la raíz, con dependencias ya instaladas y PostgreSQL 18 local:

```powershell
$env:DATABASE_URL='postgresql://qa:qa@127.0.0.1:1/qa' # solo validate; no conexión
.\node_modules\.bin\prisma.cmd validate --schema backend/prisma/schema.prisma
.\node_modules\.bin\prisma.cmd generate --schema backend/prisma/schema.prisma
npm.cmd --prefix backend run build
node scripts/i4-installment-allocation-qa.cjs 'C:/Program Files/PostgreSQL/18/bin'
npm.cmd --prefix backend test -- --runInBand installment-allocation.spec.ts
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
npm.cmd run lint
npm.cmd run test:global-tools
git diff --check
```

La regresión backend de esta ejecución se lanzó con
`node --require ../scripts/qa-loopback-only.cjs ../node_modules/jest/bin/jest.js --runInBand`
desde `backend`, sin credenciales externas. Evidencia saneada local, no publicada:
`.codex-review/f3-backend-full.json`, `f3-frontend-full.log`, `f3-tools.log`,
`f3-projection.json` y `f3-installment-qa-cf609ae1-bfc7-4d0e-b50d-9f28284b236b.json`.
El harness guarda hashes del código/modelo/migración y resultados por escenario.

## Migración propuesta y operación futura

Archivo: `backend/prisma/migrations/20261104090000_i4_manual_installment_allocation/migration.sql`.
SHA-256: `e6157bb54b6973b00effb4cb8b1e377714c8debb93425402e5fa40d84ed38bf1`.
Canónico SHA-256: `0472cdc09051404b5c3c41de30de02d9c8859eb212cb2c02b8307c160da70f50`.
Contrato: **96 tablas / 982 columnas / 96 PK / 230 FK / 63 CHECK / 132 índices**.
Delta: 2 tablas, 17 columnas, 2 PK, 9 FK, 5 CHECK, 8 índices; ninguna columna
financiera existente cambia. No backfill, seed, UPDATE/DELETE/TRUNCATE/DROP.

Orden futuro, **no ejecutado en entornos compartidos**:

1. Propietario/DBA aprueban esquema y ventana. Coordinar ownership G8 con grupos
   de la base compartida; no afecta payloads ni ownership funcional G1/G2/G3.
2. Respaldo verificable y prueba de restauración. Catálogo READ ONLY fresco,
   SHA exacto e historial `_prisma_migrations` reconciliado; revisar objetos
   parciales. `IF NOT EXISTS` no prueba compatibilidad de un objeto preexistente.
3. Operador aplica únicamente migración aprobada sobre el objetivo confirmado.
   No ejecutar canónico completo, `db push`, seeds ni `migrate deploy` a ciegas.
4. Los nuevos FK requieren locks en tablas referenciadas; pueden esperar o
   bloquear escrituras brevemente. Migración transaccional, lock timeout 5 s y
   statement timeout 30 s: si no puede completarse, rollback y nueva ventana.
5. Verificador global READ ONLY, integridad FK/PK/índices/check/default y hashes.
6. Backend compatible y después frontend; health/ready, roles y smoke QA manual
   autorizado por ambas empresas. Backend antiguo tolera tablas adicionales;
   backend nuevo necesita el esquema nuevo (readiness también).
7. Rollback lógico: detener nuevas imputaciones y volver al backend anterior
   conservando ledger y estados ya confirmados. No borrar tablas ni auditorías,
   no revertir pagos bancarios. Un error de aplicación se compensa mediante
   reversa autorizada; no reparaciones SQL silenciosas.

## Alcance, riesgos y cierre

Archivos funcionales nuevos: DTO/controlador/servicio/spec de imputaciones,
componente React y sus tests, harness PostgreSQL. Integraciones puntuales:
`commercial.module.ts`, `ControlBookHistory.tsx`. Modelo/canónico/migración,
health derivado, hash/conteos, reportes Prisma y documentación completan el cambio.
G2, Facturación.cl, SMTP, G1/G3, F1/F2/F4 y CU47 no cambian funcionalmente.

Revisión de PR: **GO**. Diff checks aprobados y escaneo heurístico/manual de los
22 archivos F3 sin credenciales operativas detectadas. El único ejemplo de URL
es sintético, loopback, puerto 1, utilizado para validate sin conexión. No se
incluyen `.env`, respaldos, dumps, `output/`, `-f` ni evidencias privadas.
Este escaneo de los cambios no certifica todo el historial Git ni valida secretos
contra proveedores. Los artefactos de pruebas permanecen ignorados localmente.
Despliegue: **NO-GO**; faltan aprobación/aplicación de migración compartida,
aceptación visual del operador y ventana coordinada. No se certifican proveedores
reales ni una base productiva. Nueve pruebas backend permanecen omitidas.
No se ejecutó regularización histórica masiva, migración externa, merge ni deploy.

## Archivos y commits de implementación

|Grupo|Archivos|
|---|---|
|Persistencia|`backend/prisma/schema.prisma`; `backend/prisma/migrations/20261104090000_i4_manual_installment_allocation/migration.sql`; `db/global/init-global.sql`|
|Contrato derivado|`backend/src/health/global-columns.generated.ts`; `scripts/global-schema.mjs`; `scripts/global-schema.test.mjs`; `docs/i3-prisma-vs-global-schema.json`; `docs/i3-prisma-vs-global-schema.md`; `db/global/README.md`|
|Backend|`backend/src/commercial/commercial.module.ts`; `installment-allocation.controller.ts`, `installment-allocation.dto.ts`, `installment-allocation.service.ts`, `installment-allocation.spec.ts` dentro del mismo directorio|
|Frontend|`frontend/src/features/commercial/ControlBookHistory.tsx`; `frontend/src/features/commercial/InstallmentAllocationsPanel.tsx`; `frontend/tests/installment-allocations.test.mjs`|
|QA|`scripts/i4-installment-allocation-qa.cjs`|
|Trazabilidad|`docs/i4-f3-imputaciones-diseno.md`; `docs/i4-f3-imputaciones-validacion.md`; `docs/i4-cierre-funcional-f3-convenios.md`; `docs/i4-convenios-decision-comercial.md`|

Commits locales de implementación, sin merge: diseño `4d8a66f7`, persistencia
`fcee4fc2`, backend `49e623d3`, interfaz `07105826`. El commit posterior de QA y
documentación incluye este informe; su SHA se informa en la entrega final.
