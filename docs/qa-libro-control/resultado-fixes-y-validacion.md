# Resultado local — Clientes, Libro de Control y veto contractual

Fecha: 2026-11-11. **Implementación local comprobada con mocks; no certificación E2E.**

Rama: `feat/ux-ui-libro-control`.
HEAD conservado: `123b4ede52b71167f31fe77dc04ad68abadadd62`.
Índice vacío. Sin commit, push, PR ni cambio de rama.
Diagnóstico previo: [diagnostico-estatico.md](diagnostico-estatico.md).

## Política 2 implementada

Se bloquean nuevas contrataciones y TODAS las firmas pendientes, manuales o
electrónicas, ante saldo exigible impago **en la empresa del contrato**.

Entradas protegidas:

1. `POST /api/contracts` → `ContractsService.createCustomerContract`.
2. `POST /api/prospects/:id/contracts` → `ProspectsService.contractPlan`, tanto
   creación como reutilización de un contrato pendiente.
3. `PATCH /api/contracts/:id/confirm-signature` → `markContractSigned`.
4. Firma por correo → `ESignatureService.sign` → el mismo `markContractSigned`.
5. `PATCH /api/contracts/:id/digital-contract/sign-status`, cuando se pretende
   registrar `Firmado manualmente` sobre un documento todavía no firmado.

El inventario estático de `contrato.create/upsert` confirmó solamente las dos
entradas de creación anteriores en código de aplicación. No se modificaron DTO,
rutas ni roles; las respuestas de rechazo son un cambio de negocio autorizado.

### Cálculo, identidad y aislamiento

- Se reutiliza `invoiceBalance`, la regla existente del Libro de Control.
- Solo pagos persistidos reducen el saldo; no se alteran pagos ni facturas.
- `Pagada` y `Anulada` no generan exigibilidad. Se conserva el documento original.
- Las prórrogas aprobadas afectan el vencimiento efectivo, **no perdonan el capital**.
- Un convenio, pago parcial o vencimiento futuro no elimina por sí solo el saldo
  pendiente que el modelo existente considera exigible.
- No se compensan arbitrariamente facturas usando sobrepagos de otra factura.
- Documentos abiertos sin monto requieren revisión financiera; no se asumen pagados.
- Consulta acotada por `Contrato.idEmpresa`, sin usar la empresa principal de un
  cliente compartido como autoridad financiera.
- La búsqueda por variantes de RUT sirve únicamente para impedir elusión del veto
  con otro prospecto. No crea clientes, no une identidades, no reasigna empresa y
  no otorga acceso a contratos. Usa los formatos ya validados por `rutLookupVariants`.
- No se incluyen RUT, importes o datos personales en el error ni en su auditoría.

### Transacciones, rechazo y firmas legales

La validación ocurre dentro de la transacción de escritura con aislamiento
`Serializable`. La firma electrónica ya tenía ese aislamiento y sus reintentos.
Se conservan los bloqueos de contrato/prospecto existentes. Un conflicto de
serialización/deadlock reconocido se devuelve como HTTP 409; errores SQL ajenos no
se reclasifican como deuda ni como concurrencia.

Un veto revierte la transacción comercial y después persiste una auditoría de
negativa en **otra transacción estricta**. Guardarla en la transacción rechazada
la eliminaría con el rollback. Si esta segunda auditoría falla, el fallo se propaga;
no se informa una operación exitosa ni se persisten cambios comerciales.
Existe una ventana de caída entre rollback y auditoría: puede faltar la constancia
de un rechazo si el proceso muere allí. No se afirma entrega exactamente una vez
de auditorías de intentos, ni se introduce un outbox sin autorización de esquema.

Los reintentos de contratos/documentos ya firmados conservan sus evidencias y no
reevalúan retroactivamente deuda para alterar una firma histórica. Los pendientes
anteriores a la baja se conservan íntegros y solo se bloquea su avance.
Tras regularización total, una nueva solicitud explícita puede continuar: no hay
firma, instalación, activación ni contrato automático por pagar.

## Matriz LC-01 a LC-08

| ID | Estado al cerrar este ciclo | Evidencia y límite |
|---|---|---|
| LC-01 | Corrección parcial segura; QA pendiente | `ServicesService.update` rechaza Baja por PATCH genérico. `deactivate` conserva la baja administrativa, revalida bajo bloqueo y atomiza servicio/contrato/cliente/auditoría. Impide usar esa ruta para una solicitud activa MOROSIDAD. `CustomerServiceActions` ofrece solicitud explícita por morosidad al servicio suspendido; no anuncia retiro ni baja técnica. |
| LC-02 | Solicitud local corregida; despacho limitado por integración | `ServiceWithdrawalService.create/update`: bloqueo del servicio padre, relación contractual exacta, una solicitud activa, reintento idéntico reutilizado, cambio incompatible HTTP 409 y auditoría en la misma transacción. Para MOROSIDAD exige suspensión, observación, deuda vencida y aviso previo del mismo ámbito. Auditoría enlaza `idAviso`. No crea ticket/OT. |
| LC-03 | BLOQUEADO por contrato G3 | No existe receptor ratificado de cierre técnico de retiro. No se reutilizan cierres de instalación/reparación ni se acepta CERRADA manual como prueba técnica. No se libera inventario. |
| LC-04 | Diagnóstico confirmado; vista completa NO implementada | `activeProspectWhere` todavía excluye identidades con idCliente. No se modificó el filtro para producir una clasificación sin evidencia fiable de motivo/cierre y de todos los trámites por empresa. No se clonó ni desvinculó identidad. Clientes sigue permitiendo consultar estados no activos; métricas activas no se ampliaron. Requiere siguiente entrega específica. |
| LC-05 | CORREGIDO LOCAL | `contract-debt.guard`, creación cliente/prospecto, firma común y firma documental. Pruebas de saldo parcial/total, cerradas, prórrogas, alias, negativas y preservación histórica. Concurrencia real pendiente de PostgreSQL. |
| LC-06 | CORREGIDO LOCAL | Etiqueta `Registrar gestión de cobranza`; enum CONTACTO_CLIENTE y API intactos. El registro del evento y su auditoría ahora comparten transacción. |
| LC-07 | Implementación previa conservada; ampliación pendiente | La recuperación exacta de factura por ID si sale de filtros después de pago ya existía y se conserva. No se añadieron enlaces nuevos Clientes↔Libro ni se certificó persistencia visual de navegación. Pendiente QA y trabajo específico de contexto entre módulos. |
| LC-08 | Verificado con mocks; QA pendiente | `updateProfile` no se modificó. Conserva campos permitidos y auditoría transaccional. Se añadió prueba de no-op sin escrituras/auditoría duplicada; regresión existente de ámbito empresarial aprobada. |

### Límite importante de la baja administrativa

No se ha convertido todo servicio suspendido ni toda baja en MOROSIDAD. La UI
ofrece una acción cuyo motivo es explícito y el backend exige sus precondiciones.
La ruta administrativa sigue existiendo por compatibilidad. El veto en esa ruta
cubre solicitudes activas con motivo MOROSIDAD y el PATCH genérico ya no puede
eludirla. **No existe todavía una política ratificada que permita clasificar toda
baja administrativa sin solicitud previa como retiro técnico por deuda**. No se
afirma cerrado ese bypass semántico ni el flujo completo LC-01/03/04.
El formulario general de solicitudes conserva motivos distintos de morosidad.

## Archivos modificados y motivo

### Código existente (9)

- `backend/src/commercial/commercial-control-book.service.ts`: pasar estado real de
  factura al cálculo y atomizar eventos de cobranza con auditoría.
- `backend/src/commercial/commercial-status.service.ts`: documentos cerrados sin
  saldo exigible ficticio, conservando monto y pagos históricos.
- `backend/src/contracts/contracts.service.ts`: veto transaccional en alta,
  confirmación y etiqueta documental de firma pendiente.
- `backend/src/contracts/e-signature.service.ts`: auditoría estricta del veto tras
  rollback; no enviar documento firmado después de rechazo.
- `backend/src/g3-integration/service-withdrawal.service.ts`: validación, exclusión,
  reintentos, auditoría y prohibición de cierre manual sin contrato técnico.
- `backend/src/prospects/prospects.service.ts`: veto por identidad histórica antes
  de crear/actualizar contratación pendiente.
- `backend/src/services/services.service.ts`: proteger PATCH, solicitudes MOROSIDAD
  activas y atomicidad de la baja administrativa ya existente.
- `frontend/src/features/commercial/control-book-model.ts`: etiqueta de cobranza.
- `frontend/src/features/customers/CustomerServiceActions.tsx`: solicitud explícita
  de retiro por morosidad, sin convertir una suspensión en baja técnica.

### Pruebas existentes ampliadas (8)

- `backend/src/commercial/commercial-control-book.service.spec.ts`.
- `backend/src/commercial/commercial-status.service.spec.ts`.
- `backend/src/contracts/contracts.service.spec.ts`.
- `backend/src/customers/customers.service.spec.ts`.
- `backend/src/g3-integration/service-withdrawal.service.spec.ts`.
- `backend/src/prospects/prospects-quote-flow.spec.ts`.
- `backend/src/prospects/prospects.service.spec.ts`.
- `frontend/tests/control-book-model.test.mjs`.

### Archivos nuevos (6)

- `backend/src/contracts/contract-debt.guard.ts`: control compartido y negativa auditada.
- `backend/src/contracts/contract-debt.guard.spec.ts`: reglas financieras y aislamiento.
- `backend/src/services/service-retirement-safety.spec.ts`: separación de autoridades,
  rollback, ámbito y múltiples servicios con mocks.
- `frontend/tests/customer-retirement-safety.test.mjs`: interacción React real con API
  simulada; solicitud, error, permisos y baja administrativa separada.
- `docs/qa-libro-control/diagnostico-estatico.md`.
- `docs/qa-libro-control/resultado-fixes-y-validacion.md` (este informe).

Excluidos: seed QA preexistente, `.env`, respaldos, `output/`, node_modules,
artefactos de build y `tmp/lc-safe-backend-regression*.json` (evidencia local).
`git diff --stat`: 17 archivos tracked, 346 inserciones y 66 eliminaciones;
los seis archivos nuevos enumerados arriba se muestran por separado como untracked.
La seed conserva SHA-256
`55160310072a08858820c762531d879c017da7259156e05c94b7c188e5aa7f3c`.
Durante la comprobación final apareció también `db/finet_seed_libro_clientes_qa_v2.sql`.
No estaba en el snapshot inicial, no lo creó Codex y se conserva sin lectura,
edición ni ejecución; queda excluido del candidato junto a la seed original.
No hay cambios de manifiestos, locks, Prisma, migraciones ni SQL canónico.

## Validación ejecutada

| Validación | Resultado real |
|---|---|
| Pruebas dirigidas (10 suites, antes del último refuerzo de auditoría) | 225 PASS, 0 FAIL |
| Regresión backend segura final | **93 suites, 1.760 PASS, 0 FAIL** |
| Frontend completo con API simulada | **179 PASS, 0 FAIL** |
| Backend build final | PASS |
| Frontend TypeScript + Vite build | PASS; advertencia de chunk grande preexistente |
| Backend lint final | PASS, sin errores/advertencias |
| Frontend lint | 0 errores, 78 advertencias en archivos sin modificar |
| Prisma generate/validate | PASS offline sobre copia temporal de los mismos modelos, salida solo a node_modules |
| `git diff --check` | PASS |
| Índice | Vacío |

Comandos principales, ejecutados desde este worktree:

```powershell
npm.cmd ci --offline --ignore-scripts --no-audit --no-fund
node node_modules/jest/bin/jest.js --config backend/jest.config.js --runInBand '--testPathIgnorePatterns=integration.spec.ts|mail.service.spec.ts|prisma-tax-intent.store.spec.ts' --json --outputFile=tmp/lc-safe-backend-regression-final.json
npm.cmd --prefix frontend test
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend run lint
git diff --check
```

Se restauraron solo las versiones ya fijadas en el lockfile desde caché. No se
añadieron librerías ni se cambiaron dependencias. `npm.ps1` está restringido por la
política local; se utilizó `npm.cmd`. El primer intento de Prisma no encontró el
motor e intentó obtener su checksum, sin éxito. Se resolvió usando los binarios
locales existentes **solo en lectura**, copia temporal del schema fuera del repo,
URL sintética inaccesible y sin cargar `.env` para la ejecución offline. No hubo
conexión a base. Vite requirió ejecución fuera del sandbox por un error ACL de
esbuild; la compilación posterior aprobó sin iniciar servidor.

La regresión excluye deliberadamente suites de integración PostgreSQL, la suite
SMTP que levanta sockets y la suite mixta con opt-in PostgreSQL de tax intent.
No equivale a backend completo con DB/Mailpit. Los logs de fallo PDF inducido son
parte de pruebas existentes de recuperación; las suites finalizaron aprobadas.

## Flujo conservado y pruebas manuales pendientes

Suspendido → aviso en Libro → solicitud MOROSIDAD → **bloqueo de despacho/cierre**.
El servicio permanece suspendido. Cancelar solicitud no reactiva servicio ni perdona
deuda. Tras regularizar, contratar/firmar exige una nueva acción autorizada.
El salto a baja técnica y posterior vista de excliente **no está habilitado**.

| Caso | Evidencia local / siguiente validación por operador |
|---|---|
| T01 | Solicitud con deuda y aviso conserva suspensión; validar aviso/UI en QA. |
| T02 | Reintentos/concurrencia modelados con una solicitud y auditoría; verificar dos conexiones PostgreSQL. No se crean tickets/OT. |
| T03 | CERRADA manual rechazada y solicitud MOROSIDAD activa no permite baja administrativa. |
| T04 | Cierre técnico real de retiro PENDIENTE G3; solo baja administrativa existente probada con mocks. |
| T05 | Rollback modelado ante fallo de auditoría de solicitud/baja/firma. Verificar persistencia real en QA. |
| T06 | Vista Excliente con deuda e historial PENDIENTE; no desvincular ni clonar. |
| T07–T09 | Veto backend, parcial/convenio/prórroga y desbloqueo tras regularizar probados; falta UI/DB. |
| T10 | Facturas Pagada/Anulada visibles sin exigibilidad ficticia, pruebas de cálculo/cartera. |
| T11 | Otro servicio activo conserva cliente/contrato; verificar cuentas multiempresa en QA. |
| T12–T13 | Ámbito, alias y rechazo de empresa ajena cubiertos por mocks; no equivalen a autorización por RUT. |
| T14 | Recuperación por idFactura existente conservada; ejecutar pago sintético con filtro activo y navegar al volver. |
| T15 | Edición de perfil y no-op probados; validación HTTP/visual y rollback real pendientes. |
| T16 | Regresión segura G1/G2/G3, pagos y firmas aprobada con mocks. Contratos S2S sin cambios; E2E y Mailpit pendientes. |
| T17 | Baja administrativa por otro motivo preservada, sin etiquetar todo como MOROSIDAD. |
| T18 | Cancelación explícita no baja/reactiva; validar regularización previa al retiro con política autorizada. |

## Siguiente etapa delimitada

1. Ratificar con Terreno el contrato de retiro: tipo de OT/evento, autorización,
   correlación empresa/servicio/contrato/solicitud, evidencia, fecha, hash, reintento
   y cancelación. No reutilizar el endpoint de cierre de instalación ni tocar G1.
2. Definir la prueba de motivo/fecha para bajas administrativas/históricas sin
   solicitud estructurada. No inferir MOROSIDAD de un texto libre.
3. Implementar la vista de excliente sobre la identidad original: ausencia de todas
   las relaciones operativas/trámites **en esa empresa**, deuda derivada con el mismo
   helper, procedencia de motivo/evidencia y acceso por IDs a historial del Libro.
   No usar solo `Cliente.estado` global ni cambiar métricas de clientes activos.
4. Completar navegación bidireccional y aceptar visualmente conservación de filtros,
   factura pagada fuera de página, servicios suspendidos y cambio de empresa.
5. Operador ejecuta QA aislado y Mailpit con datos sintéticos, especialmente carreras
   pago/firma/retiro y fallo de auditoría. Codex no prepara ni manipula esa base.

**Sin Docker, DB/seed/migración, VPS/Railway, proveedores, pagos reales,
notificaciones reales, commit, push, PR o despliegue. No se declara el ciclo completo
resuelto ni aprobación para producción.**
