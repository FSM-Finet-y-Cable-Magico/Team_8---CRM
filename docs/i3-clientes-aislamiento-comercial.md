# I3: clasificación comercial y aislamiento empresarial

Rama de trabajo: `fix/i3-clientes-cobertura`. Base: `e56be1f1`.
Implementación local autorizada; no corresponde a un despliegue ni a una reparación de datos.

## Correcciones

- `backend/src/common/customer-lifecycle.ts`: clientes activos requieren un servicio
  `Activo` del ámbito consultado. La etiqueta global del cliente no sustituye esa
  evidencia. Prospectos sin cliente ni contrato firmado permanecen visibles aunque
  tengan etiquetas históricas contradictorias. Los perdidos sin relaciones se excluyen.
- `backend/src/companies/companies.service.ts`: aplica el ámbito al servicio que
  determina la métrica de clientes activos. En vistas por empresa, la métrica
  `clientesMorosos` cuenta clientes con contratos de esa empresa en `Moroso` o
  `Suspendido`; no atribuye el estado financiero global a ambas empresas.
  El consolidado administrativo conserva la métrica financiera global anterior.
  Planes anidados incoherentes con la empresa del contrato/cambio no se exponen.
- `backend/src/customers/customers.service.ts`: filtra contratos, domicilios
  atribuibles mediante servicios, documentos, equipos y solicitudes anidados.
  Protege también relaciones a uno que históricamente pudieran apuntar a otra
  empresa: plan, zona de pago o contrato. Buscar por número de contrato requiere que
  ese contrato pertenezca al ámbito autorizado, incluso si su cliente es compartido.
  La búsqueda por RUT permite encontrar identidad autorizada, nunca fusionar personas.
- `backend/src/prospects/prospects.service.ts`: las transiciones genéricas y las
  pérdidas no reemplazan las operaciones contractuales. Una condición en el UPDATE
  verifica estado leído, empresa, ausencia de cliente y ausencia de contratos vigentes;
  un cambio concurrente que impida satisfacerla devuelve 409. La autorización se
  comprueba antes de devolver información del prospecto.
- `frontend/src/api.ts`, `frontend/src/features/prospects/ProspectsPanel.tsx` y
  `ProspectWorkflowPanel.tsx`: consumen el indicador opcional
  `requiereRevisionComercial`, presentan la etiqueta histórica como evidencia
  pendiente de revisión y no habilitan acciones derivadas de ella. Un contrato real
  pendiente de firma conserva su confirmación autorizada.

## Matriz de permisos y visibilidad

Siempre se conservan los controles de rol existentes en los controladores.

| Operación / dato | Usuario empresarial | Administrador consolidado | Administrador, lista con scope empresarial |
|---|---|---|---|
| Cliente exclusivo de su empresa | Identidad y relaciones propias | Visible | Solo si pertenece al scope |
| Cliente exclusivo de otra empresa | Sin acceso | Visible | Fuera de la lista |
| Cliente compartido | Identidad común y contratos de su empresa | Todas las relaciones | Solo relaciones del scope |
| Contratos, servicios y documentos | Filtrados por empresa, incluidas relaciones anidadas | Consolidados | Lista de contratos filtrada |
| Domicilio sin atribución empresarial | No se muestra como domicilio operativo | Visible | Requiere servicio del scope |
| `Cliente.datosTecnicos`, origen y observaciones globales | No expuestos | Visibles | No expuestos |
| `Cliente.estado` global | Se presenta `Restringido por empresa` | Valor global original | Restringido |
| Auditoría global sin empresa verificable | `auditoria: []`; no se consulta el log global | Visible | History sigue siendo consolidado: no tiene parámetro scope |
| PATCH estado / datos técnicos globales | 403 antes de leer o escribir | Conserva autorización y auditoría anteriores | Es una operación administrativa global; no toma scope |
| Usuario empresarial sin empresa válida | Rechazado, sin acceso consolidado implícito | No aplica | No aplica |

El estado restringido es una etiqueta de presentación; **nunca se persiste**.
`datosTecnicos` y `origenContacto` se devuelven como null para usuarios restringidos.
Los campos globales adicionales sin atribución se omiten. La empresa principal del
cliente no se reasigna: si no corresponde al scope se oculta en esa respuesta.
El hash del portal no se devuelve a ningún rol.

`LogAuditoria` no tiene columna de empresa. Un `idCliente` o un `idEmpresa` dentro
de JSON arbitrario no acredita que todo el contenido del evento pertenezca a ese
ámbito. Por ello no se intenta filtrar ese contenido de forma permisiva.
Las observaciones operativas que sí tienen empresa conservan su consulta filtrada.

## Reglas comerciales finales

1. Clientes registrados: lista de identidades vinculadas al ámbito por empresa
   principal o por contratos. Estar registrado no equivale a tener servicio activo.
2. Clientes activos: al menos un servicio `Activo` de la empresa consultada.
   Un cliente global `Moroso` puede tener un servicio activo en una empresa;
   contarlo operativamente no cambia ni revela su estado financiero global.
3. Prospectos: sin cliente asociado, sin contrato en
   `Firmado/Activo/Suspendido/Moroso`, y no perdidos. Una etiqueta `CLIENTE` o
   `Servicio Activo` sin relaciones no convierte a la persona en cliente: se
   mantiene visible para revisión. No se modifica la etiqueta almacenada.
4. Pendientes: existe un contrato del ámbito en alguno de esos estados firmados,
   sin servicio establecido, suspendido, moroso o dado de baja asociado al contrato.
   Servicios `Pendiente Instalacion` o `Instalacion Programada` siguen pendientes.
   Un cliente existente puede esperar la activación de otro contrato. No basta
   `clasificacionComercial` ni el texto del pipeline para entrar a este grupo.
   En el consolidado se construye la misma condición para cada empresa del catálogo:
   un contrato de otra empresa no acredita un pendiente del prospecto. Se elige
   el contrato propio antes de aplicar el límite de un contrato visible por persona.
5. PATCH pipeline: solo `Prospecto Nuevo`, `Contactado`, `En Factibilidad`,
   conservando el avance de esas etapas. Factibilidad, cotización, firma e instalación
   requieren sus operaciones propias.
6. Desde `Perdido` solo se permite `Prospecto Nuevo`, sin cliente ni contrato vigente.
   Se limpia el motivo de pérdida como en el flujo anterior; se conserva el resto
   del registro histórico. No se fabrica `fechaConversion`.
7. Pérdida comercial: permitida en etapas comerciales iniciales, factibilidad o
   cotización sin cliente ni contratos vigentes. También permite reiterar una pérdida.
   Un contrato distinto de `Baja/Anulado`, incluso pendiente de firma, bloquea la
   operación. Estados avanzados o desconocidos requieren revisión.
8. Las reglas anteriores no actualizan `Cliente.estado`, contratos ni servicios
   para corregir históricos. No se cambia la implementación de activación G3.

## API y consumidores revisados

- Los endpoints y DTO conservan sus rutas y estructuras de entrada.
- GET `/customers`, `/customers/search`, `/:id/history`: cambian la visibilidad,
  según lo autorizado. `CustomersPanel` tolera datos técnicos nulos, relaciones
  ausentes y estado como string. Sus controles de actualización global pueden
  seguir visibles para algunos roles; el backend devuelve el 403 explícito que la
  interfaz ya presenta. Ocultar esos controles es una mejora posterior de UX.
- `TicketsPanel` usa identidad/id del buscador; los conserva.
- El filtro visual de clientes por estado global no representa una clasificación
  empresarial: en usuarios restringidos solo recibe la etiqueta de restricción.
  Para consultar estados operativos se deben usar los contratos y servicios propios.
- GET Prospectos añade un booleano opcional, compatible con consumidores antiguos;
  las vistas actualizadas lo muestran y conservan la confirmación de firmas válidas.
- PATCH pipeline: se endurecen las etapas aceptadas (400 para operaciones derivadas).
  La búsqueda estática no encontró un consumidor activo del PATCH en frontend o
  scripts. Los flujos dedicados de cotización/firma/G3 no pasan por este PATCH.
- POST pérdida: conserva la entrada; ahora puede rechazar relaciones vigentes.
  Su consumidor `ProspectWorkflowPanel` ya presenta errores del backend.
- No se modifican Libro Control, G1, G2, G3, SMTP ni Facturación.cl.

## Históricos pendientes de auditoría

No se realizó ninguna consulta productiva ni se estimaron cantidades reales.
Pendientes: pipeline activo sin cliente, cliente vinculado sin contrato/servicio
demostrable, etiquetas contradictorias, contrato firmado sin plan/servicio,
empresa ausente, FK que apunta a otra empresa y servicios suspendidos/morosos con
estados globales distintos. Las listas tienen el límite existente de 100 registros:
no sustituyen una auditoría exhaustiva.

Los contratos cruzados incoherentes se excluyen de relaciones empresariales; no se
reparan. La consulta consolidada de clientes puede conservar casos incoherentes para revisión. Que un
contrato histórico aparezca como pendiente no autoriza reconciliarlo: deben validarse
las relaciones técnicas completas antes de cualquier acción.

Futura auditoría, sujeta a aprobación independiente:

1. Conexión con privilegios de lectura y transacción `READ ONLY`.
2. Agrupar por empresa y categoría; usar LEFT JOIN por identificadores reales de
   prospecto, contrato, cliente y servicio, nunca por RUT como autorización.
3. Entregar solo empresa, categoría, cantidad e IDs mínimos.
4. Incluir tanto etiquetas contradictorias como nulos y referencias cruzadas.
5. Sin UPDATE, creación, fusión, reasignación o reconciliación automática.

## G3-01 — PENDIENTE OBLIGATORIO, NO IMPLEMENTADO

`InstallationActivationService.activate()` todavía rechaza un cliente existente
cuya empresa principal difiere de la empresa del tracking. Esta implementación de
consultas no resuelve esa limitación.

Propuesta para una etapa posterior:

- Validar empresa y correspondencia completa de tracking, prospecto, contrato,
  plan y OT dentro de la transacción existente.
- Resolver primero las relaciones explícitas de cliente en tracking/contrato/
  prospecto; exigir consistencia entre ellas.
- Permitir el cliente compartido si existe la relación contractual autorizada de
  la empresa objetivo, aunque la empresa principal del cliente sea la otra.
- No cambiar la empresa principal ni apropiarse de relaciones de otra empresa.
- Un RUT coincidente sin relación contractual autorizada requiere revisión/vinculación
  explícita aprobada; no autoriza una fusión ni asociación automática.
- Mantener idempotencia, rollback y llamada posterior a G1 fuera de la transacción.

Pruebas propuestas: FiNet principal + contrato Cable; caso inverso; contrato ajeno
sin relación; RUT coincidente sin autorización; IDs de cliente contradictorios;
plan/prospecto de otra empresa; replay y concurrencia; fallo con rollback total.

## G3-02 — PENDIENTE OBLIGATORIO, NO IMPLEMENTADO

La activación G3 todavía cambia indiscriminadamente el estado global existente a
`Activo`. No queda resuelto por ocultarlo en las consultas empresariales.

Propuesta para aprobación:

- Separar la finalización técnica y la activación del servicio/contrato objetivo
  de cualquier transición global del cliente.
- Preservar `Moroso` y `Suspendido` globales; no tomar un cierre técnico como
  autorización financiera. Mantener intactos los contratos de la otra empresa.
- Definir una matriz explícita para los demás estados globales y para contratos/
  servicios suspendidos. Si falta una decisión, no normalizarlos automáticamente.
- Para un cliente nuevo, distinguir la inicialización aprobada de la reactivación
  de uno existente; conservar las invariantes transaccionales e idempotentes.

Pruebas propuestas: estados globales Activo/Moroso/Suspendido/Pendiente; cliente
compartido con deuda en una empresa y cierre en otra; contrato objetivo suspendido;
replay sin borrar estado financiero; rollback; G1 solo tras commit comercial válido.

## Cobertura y ubicación: siguiente etapa

Separar la edición de ubicación de la recalificación comercial. PATCH location
debe poder actualizar únicamente los datos geográficos autorizados sin modificar
pipeline, firma, contratos, servicios ni la factibilidad ya confirmada.
POST feasibility debe conservar su política de transición específica.
Nominatim aporta coordenadas, no autoridad sobre cobertura comercial. No se ha
implementado ese cambio en esta etapa.

## Validación local

Pruebas unitarias con mocks; pruebas de UI con I/O bloqueado. Se excluyen
`*integration.spec.ts` de la regresión porque pueden instanciar Prisma real.

Línea base, antes de editar: 67 suites aprobadas, 3 fallidas; 783 tests aprobados,
3 fallidos. Fallos preexistentes:

- `external-tax-documents.boundaries.spec.ts:44`: espera texto `Registrar metadata`.
- `billing.service.spec.ts:334`: obtiene TypeError en prueba de prórroga.
- `billing.service.spec.ts:346`: la operación resuelve cuando la prueba espera rechazo.
- `mail.service.spec.ts:19`: suite no inicia por fallo del OpenSSL local al crear
  un certificado efímero.

Resultados finales:

| Validación | Resultado |
|---|---|
| 4 suites específicas backend | 84/84 tests PASS |
| Regresión backend sin integración con DB | 68 suites PASS, 3 suites FAIL; 846 tests PASS, 3 FAIL |
| Suites G3 existentes incluidas en la regresión | PASS; no acredita resolución de G3-01/G3-02 |
| Frontend | 29/29 tests PASS |
| Build backend | PASS |
| Build frontend | PASS; aviso de bundle superior a 500 kB |
| Lint backend completo | PASS, sin advertencias |
| Lint frontend de archivos afectados | 0 errores; warning preexistente por import TrendingDown sin uso |
| git diff --check | PASS |

La regresión conserva exactamente los tres fallos de tests y la suite SMTP fallida
descritos en la línea base; no se modificaron esos módulos. El build frontend
necesitó ejecutarse fuera del sandbox para que esbuild pudiera leer sus directorios
padre; fue una compilación local, sin despliegue ni consultas productivas.

Archivos de pruebas modificados/agregados:

- `backend/src/common/customer-lifecycle.spec.ts`: fixtures de relaciones por empresa,
  clasificación histórica, pendientes consolidados y estados financieros preservados.
- `backend/src/companies/companies.service.spec.ts`: scopes de métricas y consultas,
  consolidado administrativo y rechazo de empresa ausente.
- `backend/src/customers/customers.service.spec.ts`: visibilidad compartida/exclusiva,
  contratos ajenos en búsqueda, auditoría, datos técnicos y bloqueo de updates globales.
- `backend/src/prospects/prospects.service.spec.ts`: etapas derivadas rechazadas,
  reactivación, pérdidas, cambios concurrentes y firma válida preservada.
- `frontend/tests/prospects-lifecycle.test.mjs`: render real del workflow con revisión
  explícita y conservación de la confirmación de firma legítima, sin I/O real.

Comandos ejecutados desde el checkout (npm.cmd evita la restricción PowerShell de npm.ps1):

```powershell
npm.cmd --prefix backend test -- --runInBand customer-lifecycle.spec.ts customers.service.spec.ts companies.service.spec.ts prospects.service.spec.ts
npm.cmd --prefix backend test -- --runInBand --testPathIgnorePatterns=integration.spec.ts
npm.cmd --prefix frontend test
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run lint
.\node_modules\.bin\eslint.cmd frontend/src/api.ts frontend/src/features/prospects/ProspectsPanel.tsx frontend/src/features/prospects/ProspectWorkflowPanel.tsx
git diff --check
```

No se accedió a Railway ni a una base compartida; no hubo reparaciones, migraciones,
seeds, reconciliaciones reales, cambios de rama, commit, push, merge o despliegue.
