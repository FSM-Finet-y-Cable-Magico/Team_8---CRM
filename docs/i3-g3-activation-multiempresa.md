# G3-01 / G3-02: implementación interna controlada

Rama: `fix/i3-g3-activation-multiempresa`. Base inspeccionada: `484bb84ac3b5e47594df9e56fca5cb61483204a2` (PR #53). PR #51 y #52 están integrados. Evidencia exclusivamente local; ninguna consulta o escritura productiva.

## Resultado y límites

- **G3-01: PARCIAL.** Resuelto el veto basado en la empresa principal del cliente para relaciones contractuales explícitas, en ambos sentidos FiNet/Cable Mágico. Se rechazan referencias contradictorias y asociaciones por RUT solamente. La vinculación de una identidad existente a un contrato sin cliente continúa pendiente de decisión comercial; no se implementó un flujo nuevo.
- **G3-02: PARCIAL.** Resuelta la sobrescritura de `Cliente.estado` al activar. El cliente existente conserva todos sus estados globales. Se protege la elegibilidad del contrato y servicio objetivo. La excepción OT completada/contrato comercial incompatible y una eventual suspensión transversal entre empresas requieren decisión humana; no se inventaron estados ni reintentos.
- Se mantienen los bloqueos existentes, la transacción de cierre con `maxWait=10000`, `timeout=20000`, la deduplicación y G1 después del commit. No se agregaron bloqueos, dependencias, endpoints, DTO, tablas ni migraciones.
- La OT histórica #53 no se consultó ni reprocesó. Tampoco se modificaron registros históricos, credenciales, `-f` ni `output/`.

## Reglas implementadas

La empresa autorizada es la del contrato objetivo. Plan, prospecto, tracking y servicio deben pertenecer a esa empresa. Un cliente puede conservar su empresa principal distinta si `Contrato.idCliente` identifica explícitamente la misma identidad que las otras referencias presentes. Una referencia inexistente o contradictoria bloquea; no se reemplaza mediante una búsqueda por RUT.

El RUT normalizado del cliente vinculado debe concordar con la identidad de la solicitud. Si no hay cliente contractual y existe ese RUT, la operación se detiene sin crear ni asociar registros. Un cliente realmente nuevo se crea con `Activo` solamente dentro de la activación transaccional válida. No se actualiza el estado ni la empresa principal de clientes existentes.

El domicilio enviado procede del contrato, prospecto o servicio objetivo validado. Se elimina el fallback al domicilio global/principal del cliente. No se cambian los campos del payload G3. Los snapshots existentes se verifican, no se regeneran ni se corrigen.

Si el tracking identifica un servicio, se exige su existencia y coincidencia exacta de contrato, cliente y empresa. Sin referencia explícita, se buscan como máximo dos servicios del contrato, incluyendo bajas: cero permite crear el servicio; uno exige elegibilidad; dos exigen revisión. No se oculta un servicio histórico dado de baja para crear otro automáticamente ni se elige arbitrariamente entre varios.

### Matriz comercial y técnica

| Cliente global | Contrato objetivo | Servicio objetivo | Resultado interno G8 |
|---|---|---|---|
| Nuevo, sin identidad existente | Firmado o Activo; relaciones válidas | Sin servicio | Crear cliente Activo y servicio Activo, activar contrato y convertir prospecto en una transacción |
| Activo | Firmado o Activo; vínculo explícito | Sin servicio o pendiente elegible | Activar solo la relación objetivo; conservar cliente |
| Moroso | Firmado o Activo; vínculo explícito | Sin servicio o pendiente elegible | Conservar Moroso; no alterar deudas ni contratos de la otra empresa |
| Suspendido | Firmado o Activo; vínculo explícito | Sin servicio o pendiente elegible | Conservar Suspendido; no levantar suspensión global; no deducir una política transversal |
| Cualquier estado existente | Moroso, Suspendido, Baja, Anulado, pendiente de firma o estado desconocido | Cualquiera | Rechazar activación comercial; no evento exitoso ni G1 |
| Cualquier estado existente | Firmado o Activo | Suspendido, Moroso, Baja, Activo u otro no pendiente | No reactivar ni sobrescribir una instalación previa |
| Cualquiera | Cualquiera | Referencias contradictorias/servicio no atribuible | Rechazar antes de escrituras comerciales |
| Cualquiera | Cualquiera | Evento idéntico ya procesado | Devolver el resultado duplicado existente; no activar ni reenviar G1 |
| Cualquiera | Cualquiera | Tracking COMPLETADA o con fecha de cierre, sin evento verificable | Bloquear y solicitar revisión histórica; no reconstruir evidencia |

Estados pendientes admitidos: `Pendiente Instalacion` y `Instalacion Programada`, utilizados por el flujo de servicios vigente; `Pendiente` se conserva como compatibilidad del escenario previo de activación cubierto por sus pruebas. No se agregan estados públicos. Un contrato `Activo` no autoriza reactivar un servicio `Activo`: puede tener una nueva instalación pendiente explícita, pero no se reescribe un servicio ya activo.

No se define aquí qué significa un estado global de suspensión para todos los contratos de ambas empresas. Si un caso requiere decidir ese alcance, se detiene para resolución comercial; conservar el estado no equivale a autorizar su levantamiento.

## Registro de cambios

Todos los cambios implementados se clasifican **INTERNA_G8_COMPATIBLE**. Las nuevas guardas pueden rechazar datos internamente inconsistentes que antes pasaban; no cambian el formato de éxito ni la política de reintentos de los grupos.

| Archivo / función | Defecto y comportamiento anterior | Comportamiento posterior | Impacto / contrato | Evidencia de compatibilidad |
|---|---|---|---|---|
| `backend/src/g3-integration/installation-integration.service.ts`: `resolveContext` | Vetaba cliente compartido por empresa principal; permitía fallback cliente/servicio y domicilio global | Autoriza por contrato, verifica identidad/referencias y domicilio atribuible; bloquea RUT sin vínculo | G8; payload G3 intacto | Pruebas bidireccionales, RUT, identidades, empresas, domicilio y adaptador existente |
| Mismo archivo: `requestInstallation` | Usaba contexto leído antes del advisory lock y devolvía tracking existente sin comprobar todas sus relaciones | Relee con el cliente transaccional después del bloqueo, antes de crear un tracking nuevo; no cambia el contrato bloqueado. Antes de devolver uno existente verifica su acceso empresarial y referencias contra el contexto autorizado | G8; mismo namespace, lock y deduplicación | Solicitudes concurrentes simuladas crean/envían una integración; suspensión durante espera bloquea; tracking existente con empresa/plan/prospecto/cliente incompatible no se devuelve |
| Mismo archivo: `retry` | Verificaba hash y request_id solamente | Reutiliza snapshot íntegro y correlacionado; no cambia payload ni identidad de reintento | G8; ningún endpoint/evento nuevo | Retry existente conserva exactamente payload/request_id; regresión G3 |
| `backend/src/g3-integration/installation-activation.service.ts`: `activate` | Elegía cliente por prioridad y RUT; vetaba compartidos y sobreescribía estado global; podía reasignar servicio de otro contrato | Valida contrato/plan/prospecto/cliente/servicio antes de escribir; admite vínculo compartido explícito, conserva cliente existente, rechaza estados incompatibles y no transfiere servicio | G8; salida de activación y llamada G1 intactas | Casos nuevos/compartidos, estados, referencias, snapshot y conservación técnica |
| Mismo archivo: actualizaciones transaccionales | `update` solo por PK podía sobreescribir una relación/estado modificado tras la lectura | Predicados adicionales con relación/estado observado en contrato, servicio y prospecto; si ya no coinciden, Prisma falla y la transacción se aborta | G8; sin nuevo lock ni mapeo de errores | Aserciones sobre guardas; propagación de fallo simulado; PostgreSQL pendiente |
| `backend/src/g3-integration/g3-integration.utils.ts`: `installationSnapshot` | No había verificación común para cierre y activación | Comprueba hash, request/trace, empresa/prospecto/contrato/plan y datos indispensables del snapshot | G8; no cambia serialización/hash original | Hash alterado y correlaciones inválidas con hash recalculado rechazados |
| `backend/src/g3-integration/g3-closure.processor.ts`: `process`, `validateCorrelations` | Hint podía eludir comparación request_id; no revalidaba tracking tras bloqueo | Valida request_id también con hint, revalida tracking y snapshot tras lock, protege históricos terminales sin evento | G8; approval-only y respuesta duplicada intactas | Duplicados idénticos/diferentes, carreras simuladas, histórico incompleto, fallo/commit sin G1 |
| `backend/src/g3-integration/installation-integration.service.spec.ts` | Faltaban casos de cliente compartido y cambios durante espera | Amplía mocks transaccionales y regresiones de solicitud sin red | Solo pruebas | Mantiene test anterior de una única solicitud concurrente |
| `backend/src/g3-integration/installation-activation.service.spec.ts` | No cubría los límites G3-01/02 | Matrices de identidad, estados, relaciones, preservación y guardas | Solo pruebas | No elimina escenarios previos; fixture incorpora estado contractual/hash reales |
| `backend/src/g3-integration/g3-closure.processor.spec.ts` | No cubría todos los límites transaccionales/históricos | Correlaciones pre/post lock, snapshot, deduplicación, commit y rollback simulados | Solo pruebas | Sin red/DB; mocks no certifican PostgreSQL |
| Este documento | Faltaba trazabilidad de decisiones de esta intervención | Evidencia, matrices y trabajo pendiente explícitos | Documentación | Sin cambios en acuerdos intergrupales |

## Matriz de compatibilidad intergrupal

| Grupo | Conservado | Limitación pendiente |
|---|---|---|
| G3 | Rutas canónica/alias; guards; approval-only sin exigir `estado`; DTO; correlaciones; wrapper HTTP; query `id_empresa` en detalle/cierre; errores de validación/conflicto existentes; deduplicación | OT técnicamente completada con contrato/servicio comercial incompatible: no éxito ficticio; tratamiento operativo y recuperación requieren ratificación |
| G1 | G3 completada → activación válida G8 → commit → tracking/envío G1; `event_id` estable; `equipos[]` múltiples; API key; `PENDIENTE_CIERRE`; `equipos_asociados`; autoridad exclusiva de inventario | Si falla persistir tracking G1 después del commit, el cierre G8 sigue confirmado. No recuperar reenviando un cierre histórico; definir procedimiento autorizado |
| G2 | Contratos de consulta, pago, comprobante y wifi sin modificaciones; pruebas existentes conservadas | Cobranza/G2 aún tienen restricciones de empresa principal para clientes compartidos; esta intervención no las resuelve |

No se modificaron DTO, controladores, adaptadores HTTP, tipos públicos, guardas ni código de G1/G2. El bloqueo de datos inconsistentes usa las excepciones existentes de validación/conflicto; una carrera que impida una actualización condicionada propaga el fallo Prisma y aborta. No se introduce un nuevo código S2S ni se afirma que esté ratificado un flujo de recuperación para esa excepción.

## Impacto en Cobranza/G2 (sin implementar)

| Ubicación inspeccionada | Evidencia e impacto | Clasificación / mínima intervención posterior |
|---|---|---|
| `BillingService.registerPayment` | Exige empresa principal del cliente igual a contrato; puede rechazar pago legítimo de la segunda empresa. Reactivación también escribe estado global | Corrección del permiso contractual interna candidata; cambio observable en pago S2S: **REQUIERE_RATIFICACION_G2**. Estado financiero transversal: **DECISION_COMERCIAL_PENDIENTE** |
| `BillingService.suspendContract` | Mismo veto empresarial; actualiza estado global y servicios del contrato | **DECISION_COMERCIAL_PENDIENTE**: separar suspensión contractual de identidad global antes de habilitar operación compartida |
| `BillingService.refreshDelinquency` | Omite contrato cuando su cliente tiene otra empresa principal; calcula por empresa y escribe estado global | **DECISION_COMERCIAL_PENDIENTE**: acordar agregación/precedencia financiera entre empresas. No inferir estado único desde una sola relación |
| `BillingReadService.queryInvoices/detailForScope/present` | Filtros y presentación exigen empresa principal coincidente; facturas válidas de segunda empresa pueden no verse | Candidato interno: autorización por contrato explícito sin alterar DTO. Cambia resultados visibles G2: **REQUIERE_RATIFICACION_G2** antes de implementarlo |
| `G2IntegrationService.paymentInCompany` | Comprobante/documento tributario exige cliente principal de la misma empresa | **REQUIERE_RATIFICACION_G2**: revisar autorización por factura/contrato/pago vinculados, preservando estructura pública |

No se tocaron emisión tributaria, Facturación.cl, SMTP, WhatsApp, Libro Control ni pagos. El paso de las pruebas G2 demuestra conservación del comportamiento vigente, no certifica soporte completo de pagos multiempresa.

## Documentación contrastada y discrepancias

Se revisaron `i3-g3-fsm-integration.md`, `i3-intergroup-g2-g3-closure.md`, `i3-g1-inventory-integration.md`, `i3-g1-real-integration-closure.md`, `i3-s2s-auth-g1-g8.md`, `crm-activation-flow.md`, `i3-clientes-aislamiento-comercial.md` e `i3-historical-g3-closure-and-contract-pdf.md`, junto con DTO, controladores y pruebas.

1. La referencia antigua G3 afirma que query `id_empresa` para cierre no estaba ratificada. El adaptador, sus pruebas y la evidencia posterior ya la incluyen y requieren. Se conserva; no se modifica el contrato HTTP.
2. La referencia inicial muestra prospecto opcional en creación. El flujo actual y el cierre ratificado requieren prospecto. Se conserva su obligatoriedad.
3. El ejemplo antiguo G1 de inbound deshabilitado no define la configuración posterior de guards G2/G3. No se cambian variables ni permisos.
4. El flujo inicial de activación no describe todas las relaciones compartidas permitidas por PR #53. Se respeta la autorización contractual explícita actual.
5. El procesador admite campos técnicos opcionales enriquecidos, pero `G3ClosureDto` enumera solo el cierre ratificado y el ValidationPipe restringe campos adicionales. No se amplía el inbound por iniciativa propia. Ratificar con G3 antes de admitir más campos en webhook; se conserva la consulta histórica separada de PR #52.

## Pendientes que no se implementan

| Caso | Clasificación | Propuesta mínima |
|---|---|---|
| Contrato sin cliente y RUT existente, incluso misma empresa | DECISION_COMERCIAL_PENDIENTE | Autorizar un procedimiento de vínculo explícito y auditable; nunca vincular por RUT automáticamente |
| Identidad sin RUT verificable, referencias contradictorias, varios servicios sin destino explícito o histórico terminal sin evento | DECISION_COMERCIAL_PENDIENTE | Auditar solo lectura y decidir caso a caso. No reparar datos mediante cierre técnico |
| Estado global ambiguo que exigiría suspender relaciones de ambas empresas | DECISION_COMERCIAL_PENDIENTE | Definir alcance financiero antes de operar ese caso; no levantar ni propagar suspensión desde G3 |
| OT aprobada/completada mientras contrato o servicio pasa a estado incompatible | REQUIERE_RATIFICACION_G3 | Acordar manejo operativo sin éxito comercial ficticio; no inventar estado técnico, HTTP nuevo, callback o retry |
| Ampliación eventual de campos opcionales del webhook | REQUIERE_RATIFICACION_G3 | Confirmar contrato antes de cambiar DTO; no necesaria para estos fixes |
| Fallo de registro G1 posterior al commit G8 | REQUIERE_RATIFICACION_G1 si afecta recuperación observable | Revisar registro faltante y recuperación con evento/payload original autorizado. No reenviar cierres históricos ni inventar series |

## Transacciones y riesgos residuales

El advisory lock por contrato sigue en solicitud; el lock de fila de tracking sigue en cierre. La idempotencia conserva el evento único de tracking/tipo y hash de cierre. Un duplicado idéntico con evento persistido devuelve su resultado, incluso si el snapshot histórico no cumple las nuevas guardas: no se reactiva ni se altera la evidencia antigua.

Las validaciones comerciales se ejecutan dentro de la transacción. Las actualizaciones condicionadas detectan cambios concurrentes en las relaciones/estados leídos de contrato, servicio y prospecto. Cualquier excepción deja el commit sin confirmar y evita G1. Se mantienen todas las escrituras comerciales/tracking/evento dentro de esa misma transacción.

Esto no certifica serialización con todas las escrituras de otros módulos: los bloqueos actuales no cubren modificaciones concurrentes del catálogo de planes ni inserciones de otro servicio por procesos que no coordinan el mismo lock. No se añadieron bloqueos que afecten Cobranza. Antes de ampliar garantías se requiere una prueba aislada y aprobación del diseño de concurrencia, no una afirmación basada en mocks.

La relectura dentro del advisory lock añade consultas en la transacción de solicitud; sus límites no se alteraron. Debe medirse latencia en un ambiente autorizado. La transacción de cierre mantiene sus límites explícitos existentes. Una identidad nueva concurrente con el mismo RUT sigue protegida por la restricción única existente: el conflicto aborta; no se convierte en vinculación automática.

Los tests de concurrencia y rollback usan mocks: verifican orden, guardas, propagación del error, restauración del modelo simulado y ausencia de G1. **No certifican rollback ni concurrencia real de PostgreSQL.** No se ejecutaron tests que abren una base real (`*integration.spec.ts`).

## Validación local de la implementación inicial (baseline de la corrección previa)

Se agregaron **79 pruebas** sin eliminar escenarios anteriores. Resultados finales:

| Validación | Resultado |
|---|---|
| Baseline backend, antes de editar | 72 suites pasan / 3 fallan; 931 tests pasan / 3 fallan; 934 tests contabilizados |
| Regresión dirigida G3/G1/G2 + contratos/PDF + clientes/empresas/prospectos/ciclo | **22 suites y 453 tests PASS** |
| Regresión backend final, mismo comando que baseline | 72 suites pasan / las mismas 3 fallan; **1010 tests pasan / los mismos 3 fallan**, 1013 contabilizados |
| Frontend tests | **35/35 PASS** |
| Backend build | **PASS** |
| Frontend build | **PASS**; advertencia de chunk mayor de 500 kB. Primer intento impedido por ACL del sandbox; repetición local autorizada completada |
| Backend lint | **PASS**, sin advertencias |
| Frontend lint | **PASS**, 0 errores y 78 advertencias en archivos no modificados |
| `git diff --check` | **PASS** |

Comandos utilizados (PowerShell, Node/npm locales; sin descargar herramientas):

```powershell
npm.cmd --prefix backend test -- --runInBand g3-integration g1-integration g2-integration contracts.service.spec.ts customers.service.spec.ts companies.service.spec.ts customer-lifecycle.spec.ts prospects.service.spec.ts
npm.cmd --prefix backend test -- --runInBand --testPathIgnorePatterns=integration.spec.ts
npm.cmd --prefix frontend test
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend run lint
git diff --check
```

Fallos preexistentes reproducidos antes y después, fuera del alcance autorizado:

- `external-tax-documents.boundaries.spec.ts`: expectativa de interfaz «registro, corrección y anulación de metadata» que ya no coincide con el contenido frontend inspeccionado por el test.
- `billing.service.spec.ts`: dos expectativas de prórroga/vencimiento (`impide último aviso…`, `no suspende mientras una prórroga…`) fallan con la fecha actual.
- `mail.service.spec.ts`: suite no inicia porque OpenSSL falla al generar el certificado efímero local. Este fallo de suite se cuenta aparte de los tres tests fallidos anteriores.

No se modificaron esos módulos ni se eliminaron sus pruebas. Durante la implementación se corrigió un error transitorio de TypeScript por `Cliente.rut` nullable antes de obtener los resultados finales; no queda ningún fallo nuevo observado. Los logs de herramientas se mantienen en el directorio temporal del sistema, fuera de `output/` y sin incorporarlos a Git.

## Corrección mínima de validaciones previas — 2026-10-22

La revisión de solo lectura identificó dos solicitudes que podían enviarse aunque su cierre ya fuera comercialmente inviable: servicio suspendido y contrato con un servicio `Baja` más otro pendiente sin destino explícito. Ambos defectos se corrigen exclusivamente antes de crear una solicitud nueva. Los hallazgos y decisiones anteriores se conservan.

### Cambio aplicado

En `InstallationIntegrationService.requestInstallation`, después del advisory lock existente, de la búsqueda de tracking existente y de releer `resolveContext`, se comprueba:

- Con `idServicio` explícito, se valida el servicio exacto ya resuelto y sus relaciones; los demás servicios históricos no se seleccionan ni modifican.
- Sin `idServicio`, se consultan hasta dos servicios del contrato, incluyendo bajas. Si hay varios, se rechaza y se exige `idServicio`. El orden de lectura no se usa para elegir un candidato entre varios.
- Con un solo candidato, se exige coincidencia de contrato, empresa y cliente, y los mismos estados pendientes aceptados por `activate`: `Pendiente`, `Pendiente Instalacion`, `Instalacion Programada`.
- Sin servicios, se conserva el flujo válido de crear el servicio durante el cierre. No se crea anticipadamente un servicio ni se cambia la referencia originalmente persistida.

El rechazo ocurre antes de `integracionInstalacionG3.create`, `prospecto.update`, auditoría de solicitud y HTTP G3. No reactiva ningún estado. La devolución de un tracking existente y `retry` conservan su comportamiento idempotente: la nueva guarda no se aplica retroactivamente a solicitudes ya emitidas.

La política central `canActivateService` mantiene la exigencia de instalación completada para activar; no se simula esa condición durante la solicitud. Los controles de elegibilidad del servicio coinciden con los del cierre. `InstallationActivationService.activate` y `G3ClosureProcessor` no se modificaron en esta corrección: un cambio de estado posterior al envío sigue detectándose dentro de la transacción del cierre.

| Archivo y función | Antes | Después | Impacto / clasificación |
|---|---|---|---|
| `backend/src/g3-integration/installation-integration.service.ts`, `requestInstallation` | Podía enviar un servicio ya incompatible o un destino ambiguo | Rechaza esas solicitudes nuevas antes de tracking, pipeline y HTTP | Exclusivamente G8; `INTERNA_G8_COMPATIBLE`; sin cambio del contrato G3 |
| `backend/src/g3-integration/installation-integration.service.spec.ts`, fixtures y bloque de validación previa | Faltaba probar ambos defectos y su recorrido conjunto | 17 casos adicionales, incluidos solicitud y activación reales sobre mocks para el servicio explícito válido | Solo pruebas; conserva escenarios existentes |
| Este documento | Registraba implementación y pendientes anteriores | Agrega corrección, evidencia y limitación de interfaz; conserva decisiones pendientes | Solo documentación |

### Interfaz existente y selección explícita

`frontend/src/features/installations/G3InstallationStatus.tsx` recibe y envía prospecto o contrato, pero no `idServicio`. También se usa desde `CustomerContractWorkflow`. Por tanto, esa acción de la interfaz mostrará el rechazo ante varios servicios aunque exista uno pendiente válido. No se modificó el frontend ni se eligió un servicio por conveniencia.

La API interna ya admite `POST /api/integrations/g3/installations` con `idContrato` e `idServicio`; la ruta existente `POST /api/services/:id/install-order` también delega con servicio explícito. Cualquier uso operativo requiere el rol y la empresa autorizados. No se ejecutaron llamadas reales. La selección desde la pantalla principal queda documentada para decisión posterior; no se amplió el alcance para agregar controles visuales.

### Evidencia y alcance de las pruebas

Los casos de rechazo verifican ausencia de creación/actualización de tracking, actualización de pipeline (tanto delegado transaccional como principal), auditoría y POST G3. Se cubren servicios explícitos e implícitos, referencias inconsistentes y un cambio de estado al adquirir el bloqueo. El caso `Baja` más pendiente con servicio explícito prueba conjuntamente solicitud y `InstallationActivationService.activate` usando el tracking recién generado, sin red ni base real, y preservando cliente compartido `Moroso` de la otra empresa.

Se prueban los tres estados pendientes admitidos, contrato firmado sin servicio, candidato único, devolución de tracking existente y retry con el mismo payload después de cambiar el estado del servicio. Las suites previas conservan cobertura de cierres duplicados, históricos/PDF, estados financieros y G1 exclusivamente después del commit.

La simulación transaccional continúa sin certificar rollback o concurrencia de PostgreSQL. No se ejecutan las suites `*integration.spec.ts` que requieren una base real. Los comandos dirigidos y de regresión usan `--runInBand --silent`; builds y lint se ejecutan sin `--fix`.

### Resultados ejecutados nuevamente

| Validación | Baseline recibido | Corrección previa actual |
|---|---|---|
| Regresión dirigida G1/G2/G3 + contratos, clientes, empresas, prospectos y ciclo | 453 tests PASS / 22 suites | **470 tests PASS / 22 suites** |
| Regresión backend sin suites de DB | 1010 PASS, 3 tests fallidos; 72 suites pasan, 3 fallan | **1027 PASS, 3 tests fallidos; 72 suites pasan, 3 fallan** (1030 tests contabilizados) |
| Frontend tests | 35 PASS | **35 PASS** |
| Build backend / frontend | PASS / PASS | **PASS / PASS** |
| Lint backend | Sin errores | **PASS**, sin advertencias |
| Lint frontend | Sin errores; 78 advertencias | **PASS**, 0 errores y las 78 advertencias preexistentes |
| `git diff --check` | PASS | **PASS** |

Son **17 tests nuevos** en esta corrección, además de los 79 anteriores: 96 agregados desde la base original. No se eliminaron pruebas. La regresión conserva los fallos previos de límites tributarios y dos casos de prórroga en Billing; SMTP sigue sin iniciar por el certificado efímero OpenSSL. No se observaron fallos nuevos. El build frontend conserva la advertencia de chunk mayor de 500 kB y se ejecutó con el permiso local ya utilizado para evitar la limitación de lectura de esbuild.

Se mantuvieron los siete archivos modificados previos y el informe; esta intervención solo añadió cambios al servicio de solicitud, su spec y este documento. No se modificaron `-f`, `output/`, esquema, migraciones, variables ni módulos excluidos; no hubo operaciones productivas ni POST externos.

### Estado para revisión

Los defectos A y B de validación previa quedan corregidos. La recomendación para este cambio acotado es `LISTO_PARA_PR`, sujeta a la revisión humana y a las limitaciones de validación documentadas; no autoriza commit, apertura de PR ni deploy automáticos.

G3-01 y G3-02 permanecen `PARCIAL` en el alcance global: siguen pendientes la vinculación de identidad existente sin contrato explícito, la excepción OT completada/contrato incompatible, las restricciones Billing/G2 y la recuperación de tracking G1 posterior al commit. No se cambian errores del webhook, estados técnicos, approval-only, DTO, payloads, autenticación ni acuerdos de G1/G2/G3. La capacidad de rechazar una solicitud nueva inválida es una protección de G8 previa al contacto con G3; no exige cambios de los otros grupos.

## Mínimo restante para pruebas finales y videos

1. Revisar este diff y las excepciones pendientes; autorizar únicamente casos con relaciones explícitas y estados comerciales elegibles.
2. Autorizar una base PostgreSQL desechable y aislada para comprobar dos cierres concurrentes, cambio de estado contractual durante activación y fallos tras servicio/contrato/prospecto/tracking/evento. Verificar rollback integral y ausencia de G1 mediante doble local. No usar Railway ni una base compartida para estas pruebas.
3. Resolver la cobertura de Cobranza/G2 para clientes compartidos antes de presentar una demostración de pago multiempresa como completa. Separar este trabajo de la corrección ya probada de activación G8.
4. Si se necesita probar la excepción OT completa/contrato incompatible, ratificar su recuperación con G3 antes de ejecutar el caso; no reenviar OT #53.
5. Tras autorización separada, preparar una instalación QA nueva con contrato firmado, relaciones coherentes, empresa autorizada y equipos/series reales aportados por G1. El cierre técnico debe provenir de G3; capturar evidencia de G8 tras commit y G1 después. Este procedimiento no se ejecutó.
6. Para los videos de histórico/PDF usar las consultas de PR #52 y documentos existentes sin regeneración retroactiva ni reconciliación. No exponer datos personales o credenciales en las grabaciones.

`RAILWAY_MODIFIED=false`, `DATABASE_USED=false`, `REAL_EXTERNAL_POSTS=0`, `SCHEMA_MODIFIED=false`, `MIGRATIONS_MODIFIED=false`, `COMMIT=false`, `PUSH=false`, `MERGE=false`, `DEPLOY=false`.
