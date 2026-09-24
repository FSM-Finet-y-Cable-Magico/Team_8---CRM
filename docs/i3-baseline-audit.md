# Auditoría de baseline — Incremento 3, Etapa 0

## Corrección de bloqueos Etapa 0B

Fecha de corrección: 24-09-2026. Rama: `fix/i3-baseline-blockers`.

### Matriz de fuente de verdad local

Esta matriz se construyó antes de modificar SQL o lógica. `01_schema.sql` conserva el esquema físico base; las extensiones sin migración permanecen en scripts de esquema de `db/init`; los campos agregados por las tres migraciones Prisma pertenecen únicamente a esas migraciones. Los seeds no son requisito del esquema.

| Elemento | Prisma | DB/INIT antes de 0B | Migración | Estado final esperado | Acción 0B |
|---|---|---|---|---|---|
| `prospecto` | `Prospecto` completo | Base en `01`; columnas históricas en `02` y `10_prospect_external_contract_flow` | Sin migración propia | Base más extensiones locales | Mantener DDL; separar backfill de `02` |
| `cliente` | `Cliente` completo | Base en `01`; extensiones en `02` y `10_prospect_external_contract_flow` | Sin migración propia | Compatible con Prisma e históricos | Mantener; marcar importación histórica con campos existentes |
| `contrato` | Incluye `idProspecto` nullable | Base en `01`; `id_prospecto` también se agregaba en `db/init/10_crm_activation_flow.sql` | `20260912150000_crm_activation_flow` | Una sola definición de columna, FK e índice | Dejar propiedad exclusiva a la migración; convertir la copia de `db/init` en marcador documental |
| `servicio_contratado` | Presente, `idCliente` requerido | Base en `01`; compatibilidad idempotente en `02`; `id_zona_pago` en `08` | Sin migración propia | Disponible antes de ejecutar runtime | Mantener DDL; separar backfill histórico |
| `direccion_servicio` | Presente | Base en `01` | Sin migración propia | Disponible | Sin cambio estructural |
| `orden_trabajo` | Incluye `idProspecto Int?` | Base en `01` sin `id_prospecto` | `20260916120000_installation_prospect_flow` | Columna INTEGER nullable, FK e índice presentes una vez | Aplicar y registrar la migración durante bootstrap |
| `ticket` | Presente | Base en `01`; `id_servicio` en `02` | Sin migración propia | Disponible | Mantener DDL |
| `factura` | Presente | Base en `01` | Sin migración propia | Disponible | Sin cambio estructural |
| `pago` | Presente | Base en `01` | Sin migración propia | Disponible | Sin cambio estructural |
| `zona_pago` | `ZonaPago` | DDL y demo mezclados en `08_seed_reunion...` | Sin migración propia | DDL obligatorio, demo optativo | Mover DDL a `08_schema_reunion...`; conservar datos en `08_seed_reunion...` |
| `plan_zona_precio` | `PlanZonaPrecio` | DDL y demo mezclados en `08_seed_reunion...` | Sin migración propia | DDL obligatorio, demo optativo | Separar schema/seed |
| `contrato_digital` | `ContratoDigital` | DDL en `08_seed_reunion...` | Sin migración propia | DDL obligatorio | Mover al script de schema |
| `solicitud_cliente` | `SolicitudCliente` | DDL y demo mezclados en `08_seed_reunion...` | Sin migración propia | DDL obligatorio, demo optativo | Separar schema/seed |
| `observacion_operativa` | `ObservacionOperativa` | DDL y demo mezclados en `08_seed_reunion...` | Sin migración propia | DDL obligatorio, demo optativo | Separar schema/seed |
| `historial_cambio_plan` | `HistorialCambioPlan` | DDL en `08`; estado/índices en `12` | Sin migración Prisma | Tabla y extensiones disponibles | Incluir ambos scripts en fase SCHEMA |

### Causa raíz y solución del bootstrap

El repositorio combina un esquema base SQL anterior a Prisma Migrate con extensiones posteriores. Ejecutar solo `db/init` dejaba fuera `orden_trabajo.id_prospecto`; ejecutar después todas las migraciones fallaba porque `db/init/10_crm_activation_flow.sql` ya había creado `fk_contrato_id_prospecto`. Además, Prisma devuelve P3005 si `migrate deploy` se usa directamente sobre el esquema SQL base no vacío.

La corrección define un procedimiento único:

1. aplicar los scripts SCHEMA enumerados en `scripts/bootstrap-local-db.ps1`;
2. aplicar cada `migration.sql` una vez;
3. registrarlo con `prisma migrate resolve --applied`;
4. ejecutar `prisma migrate deploy` para comprobar que no queden migraciones pendientes;
5. validar/generar Prisma y ejecutar verificaciones estructurales.

La FK duplicada era `fk_contrato_id_prospecto`, en tabla `contrato`, columna `id_prospecto`, repetida entre `db/init/10_crm_activation_flow.sql` y `backend/prisma/migrations/20260912150000_crm_activation_flow/migration.sql`. Se conserva la definición de la migración. `db/init/10_crm_activation_flow.sql` queda como marcador histórico sin DDL duplicado. No se renombró la constraint ni cambió su semántica: continúa referenciando `prospecto(id_prospecto)`.

`orden_trabajo.id_prospecto` queda definido por `20260916120000_installation_prospect_flow`: `INTEGER`, nullable, FK `fk_orden_trabajo_id_prospecto` a `prospecto(id_prospecto)` e índice `idx_orden_trabajo_id_prospecto`. El código lo usa al crear, listar y completar instalaciones de Prospectos.

`02_local_adjustments.sql` mezclaba DDL con backfills históricos; estos últimos pasan a `02_seed_local_adjustments.sql`. `08_seed_reunion_duenos_servicios_contratos.sql` mezclaba cinco tablas/constraints/índices con demo; el DDL pasa a `08_schema_reunion_duenos_servicios_contratos.sql`. El bootstrap limpio no ejecuta seeds. La opción `-WithSeed` los aplica de forma expresa.

Procedimiento reproducible y comandos: `docs/i3-local-db-bootstrap.md`.

### Matriz de activación anticipada

| Archivo | Método / endpoint | Acción anterior | Riesgo | Clasificación | Corrección 0B |
|---|---|---|---|---|---|
| `services/services.service.ts` | `create` / `POST /api/services` | Aceptaba `estadoOperativo=Activo` con contrato firmado | Activación inicial sin instalación | Operación nueva/manual | Rechaza Activo; la importación histórica tiene camino separado |
| `services/services.service.ts` | `update` / `PATCH /api/services/:id` | Permitía cambiar directamente a Activo | Bypass del cierre técnico | Operación manual | Exige una OT de instalación Completada ligada al servicio |
| `services/services.service.ts` | `ensureInstallationServiceForContract` / preparación desde contrato | Crea servicio `Pendiente Instalacion` para Cliente histórico | No activa, pero es ruta legacy | Histórico compatible | Se conserva sin ampliar privilegios |
| `imports/imports.service.ts` | `importClients` / `POST /api/imports/clients` | Creaba Cliente activo marcado `importadoMasivo`, pero perdía dirección y no distinguía servicio | Trazabilidad incompleta; endpoint podía parecer alta normal | Importación histórica administrativa | Marca `origenContacto=Importacion historica`, persiste dirección y servicio opcional, añade metadata/auditoría y nunca crea OT |
| `billing/billing.service.ts` | `registerPayment` / `POST /api/billing/payments` | Al pagar activaba contrato, Cliente y todos los servicios, incluidos pendientes/Baja | Convertía pago en activación inicial | Reactivación comercial | Solo reactiva IDs que estaban `Suspendido` bajo contrato `Suspendido` y que tienen instalación completada o evidencia histórica (marca/origen/fecha anterior al activation flow); pendientes/Baja no cambian |
| `work-orders/work-orders.service.ts` | `completeInstallation` / `PATCH /api/work-orders/:id/complete-installation` | Rechazaba solo `Completada`; `Cancelada` o desconocida podían pasar; una OT legacy sin servicio podía activar varios | Activación destructiva desde estado inválido o ambiguo | Cierre técnico local | Allowlist, auditoría, guard transaccional de retry y resolución de exactamente un servicio pendiente para OT legacy |
| `work-orders/work-orders.service.ts` | `completeRepair` / `PATCH /api/work-orders/:id/complete-repair` | Rechazaba solo `Completada` y escribía `Cliente.estado` | Estado desconocido podía cerrar; mezcla Cliente/Servicio | Reparación local | Misma política de cierre; actualiza solo el servicio existente y nunca crea Cliente |

La política `canActivateService` centraliza intenciones explícitas: cierre de instalación, edición manual con evidencia de instalación, importación histórica, reactivación comercial por pago y reparación sobre servicio existente. No existe `force=true` ni bypass público.

### Estados y transiciones de OrdenTrabajo

Prisma y SQL almacenan `estado` como `VARCHAR(25)` sin enum/check. Runtime local crea `Pendiente`; la UI reconoce además `Programada`, `En progreso`, `En curso`, `Completada`, `Cerrada` y `Cancelada`. El catálogo futuro G3 es `PENDIENTE`, `ASIGNADA`, `EN_CURSO`, `COMPLETADA`, `CANCELADA`, `PENDIENTE_CLIENTE_AUSENTE`.

No se migró masivamente el catálogo. `work-order-transition.policy.ts` normaliza mayúsculas, tildes y guiones bajos. Permite cierre desde `Pendiente`, `Asignada`, `En Curso`, `En progreso` y `Programada`; trata `Completada/Cerrada` como conflicto controlado; rechaza `Cancelada`, `Pendiente Cliente Ausente` y cualquier estado desconocido. El rechazo registra `RECHAZAR_CIERRE_OT_ESTADO_INVALIDO`.

El cierre reclama la fila con `updateMany` condicionado al estado observado dentro de la misma transacción. Un retry secuencial obtiene conflicto antes de crear entidades; un retry concurrente espera el lock y obtiene `count=0` cuando el primer cierre ya cambió el estado. No duplica Cliente, Servicio, equipo ni historial crítico. `completeRepair` escribe el `ServicioContratado` existente cuando corresponde y no crea ni activa Cliente.

### Compatibilidad histórica y trazabilidad

No se modifica ningún Cliente o Servicio histórico existente ni se inventan Prospectos/OT. La importación administrativa sigue aceptando clientes preexistentes y ahora puede registrar un servicio preexistente si la fila incluye `tipo_servicio`; usa `Cliente.importadoMasivo`, `Cliente.origenContacto`, metadata `ServicioContratado.datosTecnicos` y la acción `IMPORTACION_HISTORICA_CLIENTES`. Un pago solo usa `REACTIVAR_SERVICIO_POR_PAGO` para un servicio suspendido existente. La activación por instalación conserva `ACTIVAR_CLIENTE_INSTALACION`.

Se corrigió una mezcla real: `completeRepair` ya no copia `estadoFinalServicio` a `Cliente.estado`; lo aplica al `ServicioContratado` ligado a la OT. Se conserva el resto de estados comerciales/operativos sin una reestructuración fuera de alcance.

### Pruebas agregadas

- Servicios: alta manual Activa sin instalación rechazada.
- WorkOrders: Cancelada y estado futuro desconocido rechazados/auditados; retry sin duplicar Cliente/Servicio; reparación solo sobre servicio existente.
- Billing: contrato firmado con servicio pendiente no se activa por pago; un Suspendido sin instalación/marca histórica tampoco; un servicio instalado y Suspendido sí se reactiva; factura sin Cliente se rechaza.
- Imports: Cliente, dirección y Servicio históricos quedan distinguibles/auditables y no crean OT.
- PostgreSQL optativo: 15 tablas, columnas críticas, FK únicas y consulta Prisma.
- Las pruebas existentes de Prospectos y Contratos preservan que contratar/firmar no crea Cliente ni Servicio; el cierre válido existente conserva la activación correcta.

| Caso obligatorio | Evidencia automatizada | Resultado |
|---|---|---|
| A. Prospecto → Contrato → firma | `prospects.service.spec.ts`, `contracts.service.spec.ts` | No crea Cliente ni Servicio activo |
| B. Instalación completada | `work-orders.service.spec.ts` | Crea Cliente/Dirección/Servicio Activo una vez; retry no duplica |
| C. OT Cancelada/desconocida | `work-orders.service.spec.ts` | Rechazo controlado y auditado antes de la transacción |
| D. Suspendido existente → pago | `billing.service.spec.ts` | Reactiva solo con evidencia de instalación o marca histórica |
| E. Registro histórico importado | `imports.service.spec.ts` | Cliente/Dirección/Servicio importables y auditables, sin OT falsa |

### Resultado de validación 0B

Base local usada: `fsm_i3_baseline_test`, contenedor `finet-crm-i3-baseline-db`, host verificado `127.0.0.1:55432`, sin seeds. Resultado del bootstrap limpio: **OK**. Se encontraron 15/15 tablas críticas, `contrato.id_prospecto`, `orden_trabajo.id_prospecto` y `servicio_contratado.id_cliente`; `fk_contrato_id_prospecto=1`, `fk_orden_trabajo_id_prospecto=1`; consulta Prisma `Empresa.count()` correcta; tres migraciones registradas y cero pendientes. El contenedor descartable se eliminó después de la validación final.

Las dos suites PostgreSQL optativas pasaron contra esa base local. En modo normal pasaron 24 suites y 144 pruebas; las 2 suites/2 pruebas PostgreSQL quedaron omitidas por diseño. Backend y frontend compilaron; lint terminó con 0 errores y 79 advertencias frontend preexistentes; `git diff --check` pasó.

`RAILWAY_MODIFIED=false`

`MIGRATIONS_APPLIED_TO_RAILWAY=0`

`DB_PUSH_RAILWAY=false`

`MIGRATE_DEV_RAILWAY=false`
Fecha: 24-09-2026, America/Santiago. Repositorio: `Team_8---CRM`.

## 1. Alcance, procedencia y criterio de evidencia

Se siguió la solicitud del texto adjunto, no las instrucciones operacionales incluidas en documentos de referencia. No se ejecutaron comandos de despliegue sugeridos por documentos antiguos. La auditoría conserva arquitectura, endpoints, módulos, modelo, lifecycle corregido e históricos. No se implementó Etapa 1, no hubo acceso a Railway, importación de clientes, ejecución de seeds/migraciones, commit, push ni staging.

Base exclusiva: `E:/Downloads/Team_8---CRM-feat-zonas-incremento-3.zip`, SHA-256 `4bb3db5faa0edc519f6139237c3b7c15d161928e4b0c9a6e40916f321f5f41f4`. El ZIP tiene 407 entradas: se compararon los 323 archivos dentro de su carpeta de proyecto con el checkout limpio. Once coinciden byte a byte y 312 difieren únicamente por CRLF/LF; no falta ningún archivo ni hay diferencias de contenido tras normalizar CRLF. El ZIP no contiene `.git`; el commit se identifica por el checkout coincidente, no por metadata del archivo comprimido.

El ZIP también contiene `FORMATO PLANILLA TRABAJO (LIBRO CONTROL).xlsx` en su raíz, fuera de la carpeta del proyecto. Esa entrada solo se enumeró: no se abrió, extrajo ni añadió al repositorio. Se confirmó por metadata la existencia del archivo independiente en `E:/Downloads`, de 2.200.599 bytes. Queda reservado para la Etapa Comercial; no se inspeccionaron celdas, copiaron clientes a fixtures ni generaron seeds.

Rama inicial: `feat/zonas-incremento-3`; rama creada: `chore/i3-baseline-stabilization`. Commit inicial y final: `0e028bdc890300d185765d7a4c643cc6c54a569f` (23-09-2026 21:10:55 -0300). El directorio superior del workspace no es un repositorio Git válido; todas las operaciones Git se hicieron dentro de `Team_8---CRM`. No se encontraron `AGENTS.md` aplicables.

**Lectura de resultados:** IMPLEMENTADA acredita código local y, cuando existe, su prueba; no acredita despliegue ni funcionamiento contra servicios reales. DESCONOCIDO indica que no se consultó la base correspondiente. No se confunden los resultados de los mocks con integraciones operativas.

### Fuentes y prioridad

| Prioridad | Fuente efectivamente consultada | Uso y límite |
|---|---|---|
| Solicitud | Texto adjunto `pasted-text.txt`, secciones 1–30 | Instrucción de trabajo y límites de Etapa 0. |
| 1 | `Acuerdo_Actualizado_G8_G1_Incremento3_v1.md`, 24-09-2026 | Ownership físico G1, evento de activación, estados y S2S. El archivo dice pendiente ratificación final G1. |
| 1 | `Acuerdo_Actualizado_G8_G2_Incremento3_v1.docx`, 24-09-2026 | Se leyó el XML de párrafos y tablas; propuesta G8 pendiente ratificación G2 y P1 G3. No se modificó el documento. |
| 1 | `Acuerdo_Actualizado_G8_G3_Incremento3_v1.md`, 24-09-2026 | P0 confirmado por G8; OT sin Cliente previo, fan-out, TOMODAT/SmartOLT G3. |
| 2 | Código, Prisma y SQL del ZIP coincidente con el commit | Evidencia primaria de comportamiento implementado. |
| 2 documental | `docs/crm-final-architecture-audit.md`, `docs/crm-activation-flow.md`, `docs/tomodat-zonas-incremento-3.md` | Historia y contexto; se contrastaron con el código, sin asumir vigencia de todas sus afirmaciones. |
| 3 | [Incremento 2](https://docs.google.com/document/d/1nbOYVpSLpeRlyZJPbo-SePJ-CIN7eCtn1kMewoQt-5s/edit) | Arquitectura, entidades, alcance y tablas de CU parciales/postergados. Lectura textual por Drive. |
| 4 | [Incremento 1](https://docs.google.com/document/d/1nVRbXsaFZAxaD8fQWayDQp7J3qiOk2nJ/edit) | Base funcional e implementación del monolito modular. Lectura textual por Drive. |
| 5 | [Documento 0 vigente](https://docs.google.com/document/d/1w-G6PYU6HhosFb6uQv4sWXJp6bw_Huwq/edit) | RF/CU todavía vigentes, incluidos CU-42 y CU-77–86. La metadata de Drive indica actualización del 24-09-2026. |

Se listaron la carpeta compartida y sus subcarpetas Documento 0, I1, I2 e I3. El ZIP antiguo `main` de Drive no se utilizó como código. La lectura de Drive fue textual, sin auditoría visual de sus imágenes/diagramas; no acredita que los modelos globales estén ratificados o desplegados.

### Contradicciones registradas, sin cambio silencioso

1. La auditoría arquitectónica antigua dice que no existe Coverage/TomoDAT. El ZIP sí contiene `CoverageModule`, servicio, DTO, controlador, Leaflet y tests; prevalece el código actual.
2. Esa auditoría plantea cambiar la conversión anticipada. `crm-activation-flow.md` y el código nuevo ya crean Cliente/Servicio al cierre local. No se revierte esa corrección.
3. La guía TOMODAT documenta conexión directa y configuración G8; el acuerdo I3 asigna cobertura técnica/TOMODAT a G3. La conexión actual se clasifica **LEGACY / TEMPORAL**, no arquitectura definitiva.
4. Documentos antiguos hablan de Portal/API como sustitución general. El acuerdo G2 conserva base física compartida y lecturas directas pactadas; no se propone `portal_cuenta` ni separación de bases.
5. G1/G2 se presentan como ownership definitivo en la solicitud, pero los archivos adjuntos todavía registran ratificaciones pendientes. Se usa el ownership solicitado para auditar; no se inventa confirmación bilateral.
6. G2 fija un mapeo de empresas 1/2; la guía TOMODAT advierte que los IDs dependen del ambiente. Debe verificarse el mapeo autorizado al integrar, sin asumirlo desde seeds.
7. Estados locales de equipo y OT no coinciden con los catálogos acordados. No se renombraron registros históricos.
8. I2 describe Portal y WiFi como capacidades históricas; en este ZIP no hay runtime fuente Portal ni tabla `solicitud_contrasena_wifi`. La existencia en otra rama/base no se deduce de documentación.
9. I2 considera parcial el cambio de plan; el ZIP ya contiene aplicación diferida y cancelación con pruebas (`plan-change.processor.ts`, `plan-changes.spec.ts`). Eso no convierte la operación de red en implementada.

## 2. Arquitectura y ownership

Monolito modular NestJS/TypeScript + Prisma/PostgreSQL y React/Vite. Base física compartida, ownership por dominio/campo/operación. `backend/src/main.ts` aplica prefijo `/api`; los controladores usan JWT/roles CRM, no autenticación S2S intergrupo. No hay adaptadores G1/G2/G3 ni receptor de eventos implementados.

La matriz completa de módulos registrados y de las 16 features está en los anexos. `CoverageModule` está activo por importación de `ProspectsModule`, aunque no aparece directamente en `AppModule`. `MailModule` también se incorpora transitivamente; `JwtModule` lo hace desde Security. `PrismaModule` es infraestructura compartida dentro del proceso, no permiso para escribir dominios ajenos.

Mantener G8: Prospecto/pipeline/cotización, Cliente comercial, Contrato/firma, ServicioContratado, planes/precios/zonas comerciales, tickets CRM, solicitudes/observaciones, cobranza/pagos/reportes/auditoría y autenticación de empleados. Sustituir gradualmente escrituras físicas de inventario por G1 y ejecución de OT/red por G3. La existencia de FKs locales no cambia ese ownership.

## 3. Modelo comercial y lifecycle

### Entidades y relaciones

| Modelo Prisma → tabla | Identidad/relaciones | Estado y limitación |
|---|---|---|
| `Cliente` → `cliente` | `idCliente` PK; `rut` nullable UNIQUE global; `idEmpresa` nullable; colecciones prospectos/contratos/direcciones/servicios | Entidad comercial separada. El estado textual puede discrepar de servicios por rutas manuales. `password_portal_hash` existe en SQL base, pero no está modelado en Prisma G8. |
| `Prospecto` → `prospecto` | PK `idProspecto`; `idCliente` nullable; `contratos[]`, `ordenesTrabajo[]`; RUT no UNIQUE en DB | Se conserva después de convertir; `fechaConversion` y `tiempoConversionDias`. Duplicación se controla por consultas, sin constraint de RUT+empresa. |
| `Contrato` → `contrato` | PK `idContrato`; `idCliente`, `idProspecto`, `idPlan`, `idEmpresa`, `idZonaPago` nullable | Contrato nuevo se vincula al Prospecto sin Cliente; estados comerciales distintos de estado operativo del servicio. |
| `DireccionServicio` → `direccion_servicio` | PK `idDireccion`; `idCliente` nullable; calle y comuna obligatorias, ciudad nullable; `servicios[]` | Nullabilidad compatible con acuerdo G3. Nueva dirección definitiva se crea en cierre; rama histórica puede crear una dirección al agendar. |
| `ServicioContratado` → `servicio_contratado` | PK `idServicio`; FK obligatoria `idCliente`; restantes FKs opcionales | Modelo existente conservado. La oferta se obtiene de `contrato.plan`, no hay `idPlan` propio. |

### ServicioContratado, revisión completa

Evidencia: `backend/prisma/schema.prisma:394`; `db/init/01_schema.sql:92`, `02_local_adjustments.sql:22` y `08_seed_reunion_duenos_servicios_contratos.sql:13`.

| Campo | Columna/tipo | Optionalidad y constraint |
|---|---|---|
| `idServicio` | `id_servicio` INTEGER/SERIAL | PK, autoincremental. |
| `idCliente` | `id_cliente` INTEGER | Requerido, FK a Cliente. Sin UNIQUE: múltiples servicios por cliente. |
| `idEmpresa` | `id_empresa` INTEGER | Nullable, FK Empresa. |
| `idContrato` | `id_contrato` INTEGER | Nullable en modelo/SQL; FK Contrato; obligatorio en DTO de alta actual. Sin UNIQUE. |
| `idDireccion` | `id_direccion` INTEGER | Nullable, FK DireccionServicio. |
| `idZonaPago` | `id_zona_pago` INTEGER | Nullable, FK ZonaPago, agregada por SQL 08. |
| `estadoOperativo` | `estado_operativo` VARCHAR(30) | Requerido, String sin enum/CHECK de estados en el modelo. |
| `tipoServicio` | `tipo_servicio` VARCHAR(40) | Requerido; DTO limita Internet, Television, Internet + Television. |
| `datosTecnicos` | `datos_tecnicos` JSONB | Nullable, sin esquema JSON validado a nivel DB. |
| `observaciones` | TEXT | Nullable. |
| `fechaCreacion` | `fecha_creacion` TIMESTAMP, default now | Requerido en Prisma; SQL de creación tiene DEFAULT NOW sin NOT NULL: diferencia de nullabilidad. |

Relaciones inversas: `Ticket.idServicio`, `OrdenTrabajo.idServicio`, `SolicitudCliente.idServicio` y `UnidadEquipo.idServicio` son opcionales y apuntan al servicio. Ticket/OT no se convierten en entidades G8 por esta relación. PK es el único índice declarado para ServicioContratado; no se encontraron `@@index`/`@@unique` propios ni índices secundarios específicos de la tabla en SQL. Las FKs no crean automáticamente índices en sus columnas de origen. No hay restricciones compuestas que garanticen que contrato/dirección/zona y servicio correspondan al mismo cliente/empresa; los servicios validan algunas relaciones en aplicación.

Soporta varios servicios con contratos/direcciones/zonas distintos, sin mezclar PK Cliente/Servicio. **No asegura plan independiente por cada servicio:** varios servicios pueden compartir contrato; cambiar su plan impacta esos servicios. Tampoco exige dirección/contrato para históricos. El modelo es apto para la separación comercial, con esas limitaciones.

### Contrato ↔ Prospecto

`Contrato.idProspecto Int? @map("id_prospecto")` y `prospecto Prospecto? @relation(fields:[idProspecto], references:[idProspecto])`; inversa `Prospecto.contratos Contrato[]`. Contratos históricos con `idProspecto=NULL` y Cliente existente siguen permitidos. No hay UNIQUE en idProspecto ni CHECK que exija Cliente o Prospecto.

La migración `20260912150000_crm_activation_flow` y su copia `db/init/10_crm_activation_flow.sql` agregan FK `fk_contrato_id_prospecto`, índice `idx_contrato_id_prospecto` y snapshot dirección/comuna/ciudad. El índice SQL no está declarado mediante `@@index` en Prisma.

Escribe el vínculo `POST /api/prospects/:id/contracts` → `ProspectsService.contractPlan:398`. `ContractsService.confirmManualSignature:108` lo lee y actualiza pipeline, sin crear Cliente/Servicio. Lo leen `GET /api/prospects`, `GET /api/prospects/pending-activation`, `GET /api/companies/summary`, las operaciones de contrato mediante `getContractOrThrow:485`, precondiciones de agenda y cierre de instalación. No existe un `GET /api/contracts` general. El cierre asocia además el Cliente definitivo y mantiene idProspecto.

### Recorrido nuevo comprobado en código y pruebas

1. `ProspectsService.create:108`: valida DV, crea solo Prospecto, consulta cobertura si se envió punto y registra factibilidad/auditoría.
2. `verifyFeasibility:205` / `verifyTomodat:209`: manual o proveedor; valida etapa, invalida verificaciones positivas anteriores al guardar resultado nuevo.
3. `generateQuote:275`: guarda Cotizacion, genera PDF y solicita correo; `contractPlan:398` exige cotización factible/enviada para el plan y guarda Contrato pendiente con `idCliente:null`.
4. `ContractsService.confirmManualSignature:108`: marca `Firmado` y `Pendiente activacion`; no crea servicio.
5. `GET /api/prospects/pending-activation` proyecta contratos firmados sin Cliente. `common/customer-lifecycle.ts` separa prospectos activos, pendientes y clientes con servicio activo.
6. `ProspectsService.createInstallOrder:544`: hoy crea OT **local**, con idProspecto y sin Cliente/dirección/servicio nuevos en la rama I3. Agenda/técnico/código también son locales; integración G3 pendiente.
7. `WorkOrdersService.completeInstallation:125`: dentro de transacción crea Cliente, Dirección y Servicio `Activo`, asocia Contrato, completa OT, conserva Prospecto y registra conversión. La auditoría CRM queda fuera de la transacción como mejor esfuerzo. También escribe UnidadEquipo/HistorialEstadoEquipo, incompatibles con ownership final G1.

Este recorrido preserva la corrección central. El lifecycle global todavía es **PARCIAL/LEGACY**, porque hay vías de elusión y no existe cierre externo idempotente G3.

### Vías legacy e inconsistencias concretas — sin modificación funcional

| Archivo:método | Endpoint/condición | Impacto | Corrección futura recomendada |
|---|---|---|---|
| `imports/imports.service.ts:38`, `importClients`, alta en :105 | `POST /api/imports/clients`, fila `tipo_registro=cliente` y validaciones de lote aprobadas; estado omitido → Activo | Crea Cliente sin instalación y sin Servicio/Contrato/Dirección. La dirección exigida en fila no se persiste en esa rama. | Separar importación histórica expresamente identificada del alta nueva; para nuevos interesados crear Prospecto. No ejecutar Libro Control ahora. |
| `services/services.service.ts:101`, `create` | `POST /api/services`, Cliente/Contrato válidos, contrato Firmado/Activo/Suspendido/Moroso y DTO `estadoOperativo=Activo` | Comprueba estado contractual compatible con firma, pero crea servicio activo sin OT completada; luego reconcilia Cliente. | Reservar transición Activo al cierre válido; conservar tratamiento histórico acordado. |
| `services/services.service.ts:225`, `update` | `PATCH /api/services/:id`, DTO permite Activo | Cambia estado operativo directamente sin evidencia de instalación; tampoco reconcilia estado Cliente en este método. | Separar edición comercial de transición por evento de instalación. |
| `services/services.service.ts:143`, `ensureInstallationServiceForContract` | `POST /api/contracts/:id/prepare-installation`, contrato histórico con Cliente y firma/estado compatible | Crea Servicio `Pendiente Instalacion` antes de la instalación. No lo crea Activo; es compatibilidad histórica explícita. | Mantener para históricos y aislar de solicitudes nuevas G3. |
| `prospects/prospects.service.ts:544`, `createInstallOrder` | `POST /api/prospects/:id/install-orders`, Prospecto histórico con `idCliente` | Puede crear Dirección antes del cierre y elegir último servicio del Cliente/empresa, sin filtrar contrato específico. | Preservar históricos, definir correlación explícita contrato-servicio al integrar. |
| `billing/billing.service.ts:212`, `registerPayment` | `POST /api/billing/payments`, pago completa factura y no quedan otras vencidas del contrato | Marca Activo todos los servicios del contrato, incluso pendientes o Baja; no verifica instalación ni confirmación técnica G3. Cliente global se reactiva aunque tenga otros contratos morosos. | Reactivar solo servicios elegibles y previamente instalados; separar decisión comercial/ejecución G3; agregar concurrencia/idempotencia. |
| `customers/customers.service.ts:55`, `updateStatus` | `PATCH /api/customers/:id/status`, estado manual permitido | Puede mostrar Cliente Activo sin servicio activo. No crea Cliente/Servicio. | Centralizar proyección comercial y transición permitida; conservar historial. |
| `prospects/prospects.service.ts:174`, `updatePipeline` | `PATCH /api/prospects/:id/pipeline`, salto hacia adelante permitido por catálogo | Puede marcar Servicio Activo/conversión sin crear entidades; factibilidad/cotización pueden quedar inconsistentes con el rótulo. | Restringir hitos derivados a operaciones verificadas, no transición textual libre. |
| `work-orders/work-orders.service.ts:125`, `completeInstallation` | `PATCH /api/work-orders/:id/complete-installation`; solo excluye estado exacto `Completada` | Una OT Cancelada o con estado desconocido pasa ese filtro. En histórico sin idServicio puede activar varios contratos/servicios. Control previo fuera de transacción no garantiza idempotencia/concurrencia. | Allowlist de estados elegibles y correlación única; receptor G3 con event/request IDs persistidos y tratamiento seguro de desconocidos. |
| `work-orders/work-orders.service.ts:468`, `completeRepair` | `PATCH /api/work-orders/:id/complete-repair`, `estadoFinalServicio` informado | Actualiza `Cliente.estado`, no `ServicioContratado.estadoOperativo`; mezcla efecto de una reparación con cliente mult servicio. | G3 cierra terreno; G8 deriva solo efecto comercial del servicio correspondiente. |

Riesgo adicional: Cliente tiene RUT UNIQUE global, mientras alta Prospecto permite el mismo RUT si corresponde a otra empresa. El cierre siempre intenta `cliente.create`, sin reutilizar cliente comercial ya existente: puede fallar por UNIQUE al activar la segunda empresa (`ProspectsService.create:119`, `WorkOrdersService.completeInstallation:238`). No se resolvió unilateralmente el criterio multiempresa.

## 4. G1 — inventario físico

Todos los endpoints y métodos públicos de Inventory se clasifican en el anexo. Las categorías son las solicitadas: MANTENER_G8, FUTURO_READ_ONLY_G1, REEMPLAZAR_POR_API_G1, DEPRECAR, REQUIERE_ACUERDO. Ninguna escritura física se clasifica MANTENER_G8 por existir hoy. No se elimina ninguna ruta en esta etapa.

Writes directos en `InventoryService`: TipoEquipo (incluidos helpers de resolución), UnidadEquipo, Bodega creada por resolución, MovimientoInventario, HistorialEstadoEquipo, StockConsumible, TransferenciaEquipo, BajaEquipo, UsoMaterialOt. Fuera del módulo: `ServicesService.attachEquipment` y `WorkOrdersService.completeInstallation` escriben UnidadEquipo; cierre escribe además HistorialEstadoEquipo. `UsersService.remove:104` (`DELETE /api/users/:id`) además ejecuta SQL directo para poner referencias de usuario en NULL en baja_equipo, historial_estado_equipo, movimiento_inventario, orden_ingreso y transferencia_equipo. Es una escritura real de dominio G1 aunque no cambie stock; elimina referencias de autoría. También modifica historial_ot/orden_trabajo de G3. `InventoryService.createNapBox`/`attachEvidence` y cambio de metadata OT invaden G3.

`fechaVencGarantia` está modelada y se devuelve en consultas de equipos; no se encontró escritura de esa fecha desde servicios de runtime ni CRUD completo de garantías. Diagnóstico/mantención escriben estado y notas físicas, no una garantía comercial completa. Los seeds ya existentes tocan inventario/red y se inventarían como riesgo SQL, sin ejecutarlos. Las pruebas usan mocks; sus writes no equivalen a ejecución contra G1.

Lecturas adicionales G1: Companies.summary, Customers.history, Monitoring, Observations.resolveEntityContext, Reports.rows y relaciones `equipos` de Services/Monitoring/Contracts/Customers. Las lecturas directas futuras requieren alcance acordado y no deben inferir disponibilidad o realizar reservas.

Catálogo local: `Disponible`, `En Revision`, `Instalado`, `Baja Definitiva`, `Bloqueado`; no coincide con `En bodega`, `Asignado a técnico`, `Instalado en cliente`, `En revisión`, `En préstamo externo`, `Dado de baja` del acuerdo. No basta traducir rótulos: G1 debe definir equivalencias semánticas.

Contratos futuros, no implementados: `GET /api/integraciones/tipos-equipo`, `GET /api/integraciones/unidades/{numeroSerie}`, `POST /api/integraciones/activaciones`, `GET /api/integraciones/equipos?id_empresa=&id_servicio=`. Activación requiere event_id/trace_id UUID v4, empresa/OT/Cliente/RUT/Servicio/Contrato y equipos. UNIQUE de cabecera o `(event_id,id_unidad)` debe permitir varios equipos por evento. No se inventan rutas G1 para baja, stock, transferencias o mantención: falta acordarlas.

Planes no tienen relación de requisitos categoría/cantidad/obligatorio/tipo preferido. Esto es pendiente comercial con catálogo G1, no autorización para replicar inventario.

## 5. G2 — Portal, contacto y WiFi

No existen PortalModule, controladores `/api/portal`, paquete fuente Portal ni Portal en workspaces/Compose del ZIP. Los artefactos ignorados del checkout local no se toman como runtime del baseline. Auth/Users son de empleados, no duplicación de autenticación Portal.

No se encontró endpoint G8 de autoservicio que escriba email/teléfono/password de un Cliente existente. `WorkOrdersService.completeInstallation` y `ImportsService.importClients` escriben email/teléfono al **crear** Cliente, no los sobrescriben después; `CustomersService` solo cambia estado/datos técnicos. SQL `cliente.password_portal_hash` sigue presente; Prisma no lo representa y el código G8 no lo escribe. Esa omisión no elimina la columna al ejecutar validate/generate; sí vuelve especialmente peligroso usar db push contra el schema compartido.

`sesion_portal` existe en SQL con token VARCHAR(255), no TEXT. `IntentoFallido` existe en Prisma pero no tiene servicio activo que lo use. `solicitud_contrasena_wifi` **no existe en Prisma ni SQL del ZIP**; tampoco hay consumidor, cifrado, clave privada o ejecución WiFi. No se deduce su ausencia en Railway ni en código G2 no facilitado. `solicitud_cliente` genérica no es sustituto de esa cola.

Ticket tiene campo origen y el CRM administra clasificación/prioridad/estado/derivación; la creación Portal es responsabilidad G2. El DTO G8 de alta debe revisarse con el catálogo común antes de uso público; todas las rutas CRM actuales están orientadas a empleados.

ServicioContratado está definido tanto en Prisma como en SQL local y tiene `GET /api/services/customer/:idCliente`/`:id`, protegidos por JWT empleado. Su lectura directa G2 en la base compartida depende de que el modelo común y las migraciones reales estén formalizados: **no se verificó despliegue ni permiso real de G2**. No se exige re-arquitecturar el Portal. Faltan endpoint de deuda derivada, webhook de pago confirmado y descarga de comprobante para Portal.

Se conserva como diseño pendiente G2→G8→G3: G2 cifra con pública G3; G8 valida elegibilidad y remite ciphertext; G3 ejecuta, G8 actualiza estado y limpia ciphertext al aplicar. RSA-OAEP/SHA-256 y tamaño de clave quedan sujetos a ratificación P1. Ninguna llave se generó ni copió.

## 6. G3 — OT, técnicos, agenda y eventos

La matriz de operaciones incluye WorkOrders y creaciones desde Prospectos, Services y Tickets. En G8 hay cuatro rutas WorkOrders: lectura, complete-installation, cancel-installation y complete-repair. No existe CRUD genérico de asignación/estado; asignación ocurre al crear y estado al agendar/cerrar/cancelar. Los técnicos se consultan de Usuario/Rol local. `common/work-order-code.ts` genera `OT-INS/REP/SOP/OTR-<id padded>`; es identificación local, no UUID de integración.

OrdenTrabajo tiene idProspecto/idServicio opcionales; idTicket opcional UNIQUE como scalar (sin relación Prisma Ticket). SQL contiene FK al ticket; el código hace consultas manuales. No contiene idContrato explícito: el nuevo cierre resuelve último contrato firmado del Prospecto. Esto debe sustituirse por correlación inequívoca en el contrato G3.

Estados locales son textos de I2 (`Pendiente`, `Completada`, `Cancelada`, etc.), no el catálogo oficial `PENDIENTE`, `ASIGNADA`, `EN_CURSO`, `COMPLETADA`, `CANCELADA`, `PENDIENTE_CLIENTE_AUSENTE`. VARCHAR(25) de OT admite el último, pero eso no implementa su semántica. No hay manejador G3 que tolere desconocidos; el cierre local acepta más estados de los debidos.

Contrato previsto: POST `/api/integraciones/instalaciones`, GET `/api/integraciones/ordenes/{id}` y receptor G8 de cierre/fan-out. No se verificó disponibilidad de G3 y no se llamó a servicios externos. Obligatoriedad futura: RUT, nombre, teléfono, dirección y comuna; el snapshot comuna es hoy opcional y el cierre usa `Por confirmar`, por lo que aún no satisface el payload obligatorio. Persistir request_id/trace_id antes del primer envío, reutilizar en reintentos, mantener fan-out/reconciliación de G3 y crear receptor G8 idempotente con event_id, correlación empresa/prospecto/contrato/OT y validación explícita de COMPLETADA. Estado desconocido: conservar evidencia y no activar/cancelar. Todo ello queda pendiente; no se implementó integración completa.

## 7. Coverage, TOMODAT y geolocalización

**LEGACY / TEMPORAL.** Archivos exhaustivos del módulo: `coverage.module.ts`, `coverage.controller.ts`, `coverage.dto.ts`, `coverage.service.ts`, `coverage.service.spec.ts`; integración: `prospects.module.ts`, `prospects.service.ts`, DTO create-prospect y `prospects-coverage.spec.ts`. Frontend: `features/coverage/{CoveragePicker.tsx,index.tsx,coverage.css}`, `ProspectsPanel`, `ProspectWorkflowPanel` y `BillingPanel`.

| Superficie | Comportamiento actual |
|---|---|
| `GET /api/coverage/status` → status | Verifica scope empresa y configuración; no llama proveedor. |
| `POST /api/coverage/check` → check | Consulta técnica sin persistencia directa ni reserva. |
| `POST /api/prospects` con ubicación → create | Reconsulta backend; guarda Prospecto, verificación si positiva y auditoría. No confía en resultado del navegador. |
| `POST /api/prospects/:id/feasibility/tomodat` → verifyTomodat | Reconsulta y guarda resultado antes de cotizar/contratar. |
| `CoverageService.check:52` | Única llamada HTTP runtime directa a TOMODAT: GET `clients/viability/{latitud}/{longitud}/`, token Authorization sin Bearer. |

Configuración: TOMODAT_API_URL, TOMODAT_COMPANY_ID, TOMODAT_API_TOKEN. HTTPS obligatorio, URL sin user/password/query/hash, redirect:error y timeout 8 s. Respuesta array de hasta 5.000 cajas, validación de IDs, nombre, dot.lat/lng, splitters y conteos enteros no negativos; muestra solo cajas con puertos libres. No envía RUT/nombre/contacto ni crea cliente/reserva puertos. No existe llamada de creación TOMODAT desde runtime.

Fallback: sin configuración, HTTP no OK, timeout o payload inválido → Pendiente y mensaje neutro sin secretos. Array válido vacío o sin libres → No Factible. Al crear Prospecto, Pendiente conserva etapa inicial; al reconsultar, mantiene estado anterior y registra consulta pendiente. Factibilidad manual sigue disponible para roles permitidos. Datos positivos simulados de tests no prueban cobertura real; la guía previa reconoce caso positivo real pendiente. No se repitieron consultas autenticadas.

Formato: DTO JSON `{latitud,longitud}` numérico con rangos ±90/±180; proveedor usa ruta lat/lon y `{dot:{lat,lng}}`; Leaflet recibe `[latitud,longitud]` conforme a su API. **No se encontró GeoJSON**, por lo que ese orden Leaflet no es un error GeoJSON. Cualquier futura geometría EPSG:4326 debe serializar `[longitud,latitud]` y declarar WGS84; actualmente no hay SRID/PostGIS ni geometría que lo certifique.

Mapa: Leaflet, teselas OpenStreetMap HTTPS con atribución, selección por clic a seis decimales o entrada manual, marcadores de domicilio/cajas, debounce 450 ms, AbortController y limpieza del mapa al desmontar. La dirección no geocodifica automáticamente. Cambiar empresa/dirección elimina la selección en las pantallas consumidoras. No hay polígonos, geocodificador, catálogo de colores/zona, sincronización ni reserva de puertos.

Persistencia: el punto/resultado vive en estado React y `LogAuditoria.valorNuevo` al guardar; no hay columnas geográficas de Prospecto/DireccionServicio, ni recuperación del punto al reabrir mapa. `CajaNap.latitud/longitud Decimal(9,6)` es inventario de red local separado. `punto_cobertura` del SQL base no es un proveedor geográfico implementado por Coverage.

ZonaPago/PlanZonaPrecio son comerciales; no contienen polígonos ni vínculo TOMODAT. Cobertura no asigna zona, no determina precio ni restringe planes por geografía. Billing usa el mapa solo como consulta.

Acoplamiento alto: nombre TomoDAT en tipos, métodos, mensajes, endpoints, auditoría y UI; inyección concreta CoverageService en Prospects y un único company/token por proceso. Futuro encapsulamiento: contrato `CoverageProvider` con `CommercialCoverageProvider` (datos comerciales, sin afirmar cobertura técnica) y `G3CoverageProvider` (respuesta técnica autorizada); mantener adaptador temporal TomoDAT detrás de esa frontera hasta reemplazo acordado. Encapsular HTTP/auth/parsing/error mapping/correlación y fuente/fecha. No se agregó interfaz ni se alteró mapa en Etapa 0.

Pruebas: 16 tests en `coverage.service.spec.ts` y 10 en `prospects-coverage.spec.ts`; incluyen respuesta positiva simulada, negativos, errores, coordenadas, scope y guardado. El resultado por suite del anexo es la evidencia actual. No hay test frontend automatizado del mapa ni E2E G3 real en esta ejecución.

## 8. SmartOLT y monitoreo

| Capacidad | Clasificación | Evidencia |
|---|---|---|
| customerStatus/serviceStatus/equipmentStatus/customerHistory | LECTURA_REAL de DB local; FUTURO_G3 | `monitoring.service.ts:18,42,65,83`; tablas MonitoreoOnt, HistorialConexionOnt, UnidadEquipo/CajaNap. No son lecturas reales de SmartOLT. |
| createDemoMeasurement | DEMO / ESCRITURA local / FUTURO_G3 | :104; POST `/api/monitoring/demo-measurements`, solo Administrador y NODE_ENV distinto de production; escribe medición/historial sintéticos. |
| Seeds 07 | DEMO | Inserciones locales de red/monitoreo, no ejecutadas. No hay etiqueta de procedencia en cada medición que garantice separar seed de proveedor. |
| API SmartOLT, suspensión/WiFi técnico | NO_IMPLEMENTADO / FUTURO_G3 | Sin cliente HTTP, variables, autenticación o integración SmartOLT runtime. |
| Latencia en tiempo real | NO_IMPLEMENTADO | `latenciaMs:null`, `latenciaEstado:'No disponible'`. |

`MONITORING_RECENT_HOURS` determina vigencia; sin medición reciente se muestra “Sin dato reciente”, no una conectividad inventada. `MonitoringStatusView` y Customers consumen este resumen. No hay suite específica monitoring.spec en el ZIP. No se encontraron credenciales SmartOLT en variables de ejemplos/configuraciones locales inspeccionadas ni código activo. La revisión no abarca cuentas externas o binarios ajenos al ZIP. No se almacenó ni migró ninguna credencial.

## 9. TV IP — CU-42

`TvipService`, controlador, módulo, DTO y secciones TV IP de Customers implementan POST `/api/tvip/contracts/:idContrato/generate`, POST `.../regenerate` y GET `/api/tvip/customer/:idCliente`. `CredencialesTvip` tiene PK idCredencial, idContrato nullable UNIQUE, usuario, hash bcrypt y fecha. No hay relación Prisma explícita Contrato aunque SQL contiene FK.

La generación es **real local**: randomBytes, bcrypt coste 10, create/update en DB y contraseña temporal devuelta una sola vez; las lecturas omiten el hash. No hay proveedor externo, secreto API TV IP ni aprovisionamiento/verificación. No es una cuenta operativa demostrada. La elegibilidad detecta tokens de TV/duo en nombre/tipo de plan, sin exigir instalación completada ni estado Activo; generate sobre credencial existente también la rota. No hay disparador de cierre → proveedor TV IP ni entrega Portal real, ni suite específica TV IP.

CU-42 queda PARCIAL / REQUIERE_INTEGRACIÓN: faltan trigger de activación, proveedor/contrato confirmado, ownership técnico acordado G3/G2, manejo idempotente de altas/rotaciones, bajas, almacenamiento/entrega segura y prueba real. No se inventó una API externa ni nombres de secretos futuros.

## 10. Billing y área comercial

`BillingService` consulta Factura/Pago, calcula saldo/vencimiento y actualiza morosidad por acción explícita. No hay facturación tributaria automática ni cliente Facturación.cl. `Factura` tiene período, monto, límite, estado; no UNIQUE de contrato/período en Prisma. `Pago.codigoTransaccion` es nullable UNIQUE: evita duplicación de código no nulo pero no constituye endpoint idempotente; sin código pueden duplicarse pagos y el reintento con mismo código no recupera resultado previo.

`registerPayment` usa transacción para pago/factura/estados, pero lee pagos anteriores antes de transacción y no bloquea factura: concurrencia puede calcular total con snapshot desactualizado. Permite pago parcial y guarda comprobantePdfUrl suministrada; no genera PDF de pago, no almacenamiento cloud, no comprobante_estado, descarga autenticada ni webhook de pasarela. Un valor pasarela es metadata, no integración de pago.

`notificationMode` admite disabled/mock/provider. **provider también produce “Simulado”**: sendNotification solo crea LogNotificacion y plantilla Sistema; no envía WhatsApp/SMTP/canal externo. SMTP sí existe para cotizaciones en MailService; no debe atribuirse a Billing. BILLING_CUT_DAYS configura métricas de corte, pero suspensión exige factura vencida impaga, no necesariamente ese umbral. Suspender/reactivar modifica registros locales, nunca SmartOLT. Riesgos de activación y multi-servicio figuran en §3.

| Funcionalidad | Clasificación | Evidencia/límite |
|---|---|---|
| Prospectos | IMPLEMENTADA | Alta, listado, validación RUT y scope en prospects; sin endpoint público G2 propio. |
| Pipeline | PARCIAL | Persistencia y orden textual; hitos derivados se pueden saltar por PATCH directo. |
| Factibilidad | PARCIAL / REQUIERE_INTEGRACIÓN | Manual y TOMODAT temporal; cobertura definitiva G3 pendiente. |
| Cotización | IMPLEMENTADA | PDF real, persistencia y SMTP configurable; entrega real no probada en esta auditoría. |
| Pérdida | IMPLEMENTADA | Motivo, observación, fecha/usuario y reactivación en prospects. |
| Origen de captación | IMPLEMENTADA | Prospecto/Cliente y formularios; catálogo común intergrupo pendiente. |
| Cliente | PARCIAL | Perfil/historial/estado, con importación y cambios manuales legacy. |
| Contratos | IMPLEMENTADA | Alta comercial, snapshots/vínculo Prospecto, compatibilidad Cliente histórico. |
| Firma | PARCIAL | Confirmación manual y estados de documento; sin proveedor de firma externa. |
| ServicioContratado | PARCIAL | CRUD, detalle, deactivación y vínculos; elusión de activación. |
| Múltiples servicios | PARCIAL | Modelo/listas independientes, pero estados globales y contrato compartido pueden propagar efectos. |
| Planes | IMPLEMENTADA | CRUD, activate/deactivate/remove con validaciones; sin requisitos equipo G1. |
| ZonaPago | IMPLEMENTADA | CRUD comercial y vencimiento sugerido; no geografía técnica. |
| PlanZonaPrecio | IMPLEMENTADA | Reglas por plan/zona e índice SQL único parcial activo; selección manual, sin coverage. |
| Historial/cambio de plan | IMPLEMENTADA | Inmediato/diferido/cancelación, processor y pruebas; ejecución de red REQUIERE_INTEGRACIÓN. |
| Solicitudes | PARCIAL | Genéricas, status y factibilidad manual; no workflow completo de retiro/WiFi. |
| Observaciones | IMPLEMENTADA | Contexto, empresa/usuario y auditoría; entidades técnicas requieren lectura autorizada futura. |
| Cobranza/morosidad | PARCIAL | Cálculo y actualización manual; no motor completo por evento/factura ni scheduler de morosidad. |
| Facturación tributaria / Facturación.cl | NO_IMPLEMENTADA | No proveedor, emisión tributaria ni documento externo completo. |
| Pagos | PARCIAL | Registro manual y saldo; no pasarela/webhook/idempotencia de integración. |
| Comprobantes de pago | PARCIAL | URL nullable; no generación/descarga conforme al acuerdo G2. |
| Suspensión/reactivación | PARCIAL / REQUIERE_INTEGRACIÓN | Estados comerciales locales; falta confirmación técnica G3 y elegibilidad robusta. |
| Dashboard | IMPLEMENTADA | Summary y separación activos/pendientes; algunas métricas inventario/OT siguen locales. |
| Exportación | IMPLEMENTADA | CSV/XLSX: clientes, prospectos, tickets, inventario, cobranza, materiales; no vista Libro Control. |
| Importación | PARCIAL | CSV/ExcelJS, deduplicación, rechazo >30%, transacción; rama Cliente activa legacy. No se ejecutó importación. |
| Libro Control, CU-77 | NO_IMPLEMENTADA | No feature/modelo/vista integral equivalente a la planilla real. |
| Estado comercial por factura/evento, CU-78 | PARCIAL | Billing modifica estados globales; falta motor específico y eventos. |
| Convenio de pago, CU-80 | NO_IMPLEMENTADA | No modelo/DTO/operación de cuotas/convenio. |
| Prórroga, CU-81 | NO_IMPLEMENTADA | No persistencia/regla específica. |
| Cambio de fecha/día de pago, CU-82 | PARCIAL | Día en contrato al alta y sugerido en zona; sin operación completa de cambio trazado. |
| Cargos adicionales, CU-83 | NO_IMPLEMENTADA | No entidad/operación de cargo adicional. |
| Alertas de vencimiento | PARCIAL | expiry-alerts/ExpiryBadge y vista; envío notificaciones SIMULADA. |
| Aviso previo de retiro, CU-79 | NO_IMPLEMENTADA | Aviso de corte no equivale a aviso de retiro. |
| Retiro de servicio, CU-84 | PARCIAL | Solicitud genérica/baja, sin coordinación completa G3/G1. |
| Garantías comerciales, CU-85 | NO_IMPLEMENTADA | Fecha garantía física del equipo no satisface workflow comercial. |
| Documento tributario externo, CU-86 | NO_IMPLEMENTADA | URL contrato/comprobante no equivale a documento tributario externo. |
| Promociones | NO_IMPLEMENTADA | No módulo/modelo operacional dedicado. |
| Avisos Billing / WhatsApp | SIMULADA / REQUIERE_INTEGRACIÓN | LogNotificacion/PlantillaNotificacion; provider no llama servicio. |

Reportes de materiales conservan límite de 1.000 OT y no aplican el filtro de período a esa rama ni consolidan consumo mensual completo. Importación no tiene una suite propia en el ZIP. No se usaron datos de Libro Control para probarla.

## 11. Convenciones de integración

| Dato | Estado real | Brecha/recomendación futura |
|---|---|---|
| RUT | `rut/rut.util.ts` elimina puntos/guion, trim, uppercase y valida módulo 11; devuelve sin puntos con guion. Altas Prospecto/importación lo usan. | No elimina espacios internos; solo acepta cuerpos de 7–8 dígitos. G2 puede escribir directo: validar al transmitir, no confiar en DB. Búsqueda de Clientes y TVIP usan representaciones auxiliares que no son contrato API canónico. |
| Teléfono | VarChar(20) en Cliente/Prospecto y MaxLength(20) en CreateProspectDto: E.164 cabe. UI regex `^\+?56?9\d{8}$` admite variantes no canónicas; backend solo trim. | Normalizar/validar E.164 antes de integración. No ensanchar columnas ahora: deuda 20/21 no bloquea longitud E.164. |
| Fecha/hora | DTO/JS serializan Date con ISO; cobertura usa toISOString. Calendario usa America/Santiago y campos DATE sin hora. | DATE/día comercial no equivale a instante UTC; SQL TIMESTAMP carece de TZ. Definir conversión explícita externa y no convertir un día de agenda como si fuera timestamp. |
| request_id/trace_id/event_id | No se encontraron en schema ni runtime; códigos OT/Ticket son otros identificadores. | UUID v4 persistido previo al envío; reuso en reintentos; no usar código local o PK como event_id. |
| Coordenadas | Lat/lon separados; Leaflet lat/lon; SQL Decimal(9,6). | WGS84/EPSG:4326 explícito; GeoJSON futuro lon/lat. No hay geometría implementada. |
| Estados/catálogos | Strings locales con mayúscula inicial, tildes/espacios variables. | Adaptar catálogos G1/G3/G2 sin traducción masiva de históricos y sin activar ante desconocidos. |

## 12. Migraciones, SQL y dependencias de datos

El anexo inventaría cada SQL con objetivo, fecha, tablas, tipo/aditividad, estado, riesgo y aplicación local/Railway. **No se ejecutó ninguno**. “Aplicación desconocida” no significa “pendiente” ni “aplicada”. Tampoco se ejecutó `migrate status`, introspección contra la URL privada o consulta a `_prisma_migrations`.

Hallazgos reproducibles:

1. Prisma contiene tres migraciones incrementales, no una migración inicial completa. ServicioContratado, zonas, cambios de plan, sesiones empleado y otros DDL viven en `db/init`, algunos mezclados con seeds.
2. `db/init` no crea `orden_trabajo.id_prospecto`; solo `backend/prisma/migrations/20260916120000_installation_prospect_flow/migration.sql` lo agrega. Compose ejecuta `db/init` en volumen nuevo, y arranca backend con generate/start, no migrate deploy. Un arranque limpio basado solo en Compose deja ese campo faltante: hipótesis de fallo fundamentada por diferencia de DDL, no prueba DB ejecutada.
3. `20260912150000_crm_activation_flow` duplica `db/init/10_crm_activation_flow.sql`; ADD CONSTRAINT no tiene guard. Aplicar ambos sobre la misma tabla puede fallar por FK ya existente aunque columnas/índice usen IF NOT EXISTS. La migración OT también carece de guard de FK.
4. `20260916170000_expand_plan_type_catalog` altera tipo_plan a VARCHAR(40); SQL base ya declara 40. Es ALTER TYPE, no una adición; requiere coordinación, aunque ensanchar una columna más corta suele conservar datos.
5. `02_local_adjustments.sql` elimina constraint `prospecto_id_cliente_key` y hace backfill de servicios/asociaciones. No es puramente aditivo ni apto para copiar sin revisión a base compartida. No elimina tabla/columna en esta auditoría.
6. SQL 08 mezcla DDL comercial con datos demo/actualización de zonas; índices únicos parciales de precio activo y cambio pendiente no están expresados completamente en Prisma. `Contrato.idProspecto`/`OT.idProspecto` tienen índices SQL ausentes del modelo.
7. Portal: hash y sesión existen en SQL base; no hay migración WiFi ni token TEXT. Coverage no agregó esquema; zonas son I2 comerciales, no polígonos I3.
8. El esquema SQL incluye más dominios G1/G2/G3 que Prisma; **db push desde G8 no es un método válido de sincronización**. `output/backups/08_schema_only.sql` es respaldo de esquema, no migración ni prueba de aplicación Railway.

Antes de usar un baseline con DB, acordar una ruta reproducible local que incluya el DDL requerido sin duplicar FKs ni ejecutar seeds de otros dominios; mantener separados los datos demo y la migración global. No se corrige alterando el esquema global durante Etapa 0.

## 13. Entorno y secretos

El anexo registra nombres/presencia/consumo de variables, nunca valores. Se inspeccionaron ejemplos raíz/backend, configuraciones Compose y referencias en source/docs. `.env` y `.env.railway` locales preexistentes se leyeron mediante un extractor que devuelve únicamente nombres y si tienen contenido. No existe `backend/.env` ni env frontend local en los paths revisados. No se modificó configuración privada ni se cargó URL productiva para ejecutar validaciones.

TOMODAT es LEGACY: ejemplos declaran URL y campos company/token vacíos; configs locales inspeccionadas no contienen esas variables. No contradice que otro entorno Docker documentado antes tuviera token: no se inspeccionaron contenedores. No hay variables SmartOLT/G1/G2/G3/WhatsApp/Facturación.cl/TVIP/Portal efectivamente implementadas; se consignan como capacidad FALTANTE, sin inventar nombres.

Riesgos: secretos JWT por defecto de desarrollo en ejemplos/código, fallback SMTP_REJECT_UNAUTHORIZED configurable, modo demo dependiente de NODE_ENV y logs de auditoría con datos personales. No se reproducen valores sensibles ni se declara aptitud de producción a partir de estos ejemplos. Configuración BILLING_* usada en código no aparece en ejemplos; SMTP_HELO/SMTP_REJECT_UNAUTHORIZED también carecen de ejemplo. No se encontró secreto SmartOLT que trasladar.

## 14. Verificación y cambios

Las tablas de validación/dependencias/pruebas al final reflejan las ejecuciones, no los números de informes anteriores. Prisma validate/generate se ejecutaron con CLI local 5.22 y DATABASE_URL ficticia en loopback, sin acceso a DB. CRM_INTEGRATION_TESTS=0 dejó omitida la prueba transaccional PostgreSQL. No se ejecutaron pruebas destructivas ni end-to-end contra Railway/G1/G2/G3/TOMODAT.

Primera compilación frontend: TS2307 por Leaflet/@types faltantes en node_modules preexistente. Se instaló el manifiesto existente con `npm.cmd install --ignore-scripts --no-audit --no-fund --package-lock=false`; sin cambiar manifiestos/locks ni ejecutar scripts de instalación. El sandbox negó inicialmente la descarga con EACCES; la instalación autorizada fuera del sandbox completó. Se repitieron validate/generate/tests/builds/lint porque cambió node_modules. Segunda compilación frontend: esbuild recibió Access denied al leer directorios padres del workspace, problema del sandbox Windows; el build fuera del sandbox pasó. La revisión de versiones detectó que esa instalación había resuelto algunos rangos a versiones posteriores al lock. Se restauró el entorno con `npm.cmd ci --ignore-scripts --no-audit --no-fund` desde el lock del ZIP y se repitieron todas las validaciones; **los resultados finales corresponden a las versiones fijadas**, no a esa instalación intermedia. No se alteró vite.config ni el mapa.

Único archivo versionable nuevo: `docs/i3-baseline-audit.md`. Motivo: documentar Etapa 0 con trazabilidad. Sin cambios de código funcional, Prisma, SQL, configuraciones de despliegue ni lockfiles. Los helpers/logs están en `../audit-work/`, fuera del repositorio; node_modules y dist son artefactos locales ignorados. No se utilizó `git add .` ni se stageó archivo alguno. Si se decide preparar cambios, el único archivo concreto a stagear es `docs/i3-baseline-audit.md`.

### Comandos de reproducción seguros

Desde la raíz del repositorio en PowerShell, definir solo una URL ficticia que no conecta a ningún servicio y mantener omitida la prueba DB:

```powershell
$env:DATABASE_URL = 'postgresql://audit:audit@127.0.0.1:1/i3_audit_no_connection'
$env:CRM_INTEGRATION_TESTS = '0'
$env:NODE_ENV = 'test'
npx.cmd --no-install prisma validate --schema backend/prisma/schema.prisma
npx.cmd --no-install prisma generate --schema backend/prisma/schema.prisma
npm.cmd run test -w backend -- --runInBand
npm.cmd run build -w backend
npm.cmd run build -w frontend
npm.cmd run lint
git diff --check
```

`node node_modules/prisma/build/index.js ...` fue el equivalente usado para evitar descarga implícita npx. Windows bloquea npm.ps1 por ExecutionPolicy; npm.cmd ejecuta el mismo npm sin cambiar esa política. Fuentes estáticas reproducibles:

```powershell
rg -n 'cliente\.(create|update)|servicioContratado\.(create|update)' backend/src -g '*.ts' -g '!*.spec.ts'
rg -n 'unidadEquipo|tipoEquipo|bodega|movimientoInventario|historialEstadoEquipo|stockConsumible|transferenciaEquipo|bajaEquipo|usoMaterialOt' backend/src -g '*.ts' -g '!*.spec.ts'
rg -n 'id_prospecto|servicio_contratado|password_portal_hash|sesion_portal|solicitud_contrasena_wifi' backend/prisma db/init
rg -n 'TOMODAT|SmartOLT|smartolt|request_id|trace_id|event_id' backend/src frontend/src
rg --files backend/prisma/migrations db/init frontend/src/features
```

La matriz de accesos se extrajo del AST TypeScript (métodos y llamadas Prisma/tx) y se contrastó con cuerpos de código; no es un simple conteo de nombres. Los accesos por relaciones include se señalan aparte. Los tests, seeds, documentación y respaldos están diferenciados de runtime.

## 15. Riesgos que condicionan el paso a Etapa 1

**NO_LISTO_PARA_ETAPA_1** para dar por estabilizado el baseline y ampliar flujos con persistencia. Son condiciones concretas de salida, no autorización para corregirlas ahora:

1. **Reproducción de esquema local incompleta.** Definir y comprobar, en PostgreSQL local aislado sin datos reales, la ruta de DDL que incorpora OT↔Prospecto y evita la FK duplicada Contrato↔Prospecto. Entregar evidencia de arranque/consulta de esos modelos; validate/generate y mocks no lo prueban. No requiere tocar Railway.
2. **Transiciones de activación no cerradas.** Acordar y delimitar las rutas históricas de importación/alta manual de Servicio y establecer validaciones para que OT cancelada/desconocida y pagos no activen servicios nuevos/no instalados. La corrección debe conservar históricos y no revertir el cierre nuevo. Para integrar G3 debe quedar una única condición de activación exitosa y una correlación inequívoca con Contrato/Servicio.

Las ratificaciones pendientes G1/G2, contratos/autenticación/ambientes de G3, mapeo empresas y formalización del MER son condiciones de integración/despliegue compartido; no impiden por sí solas diseñar un adaptador local. Tampoco son bloqueantes de Etapa 1 las 79 advertencias lint, los CU comerciales futuros, ausencia de geocodificador/polígonos, proveedor TV IP o caso positivo TOMODAT. Se registran como dependencias sin exigir implementarlas durante Etapa 0.

Se detiene el trabajo en este informe y se espera revisión; no se inicia Etapa 1.


## Anexo A. Validaciones y versiones ejecutadas

| Validación | Resultado final | Evidencia y alcance |
|---|---|---|
| Prisma validate | PASS, exit 0 | CLI local, schema completo, URL ficticia; no conexión PostgreSQL. |
| Prisma generate | PASS, exit 0 | Cliente 5.22 generado; no schema/migración aplicada. |
| Backend tests | PASS, exit 0 | 23 suites detectadas: 22 aprobadas, 1 omitida; 136 tests, 135 passed, 0 failed, 1 skipped. |
| Backend build | PASS, exit 0 | Nest build después de instalar dependencias. |
| Frontend build | PASS, exit 0 | TS + Vite; repetido fuera del sandbox por ACL esbuild. Leaflet empaquetado en chunk propio. |
| Lint | PASS, exit 0 | 0 errores, 79 advertencias de variables sin uso (preexistentes). |
| git diff --check | PASS, exit 0 | Sin cambios tracked de código; comprobación adicional del archivo nuevo realizada al finalizar. |

Logs locales: `../audit-work/{prisma-validate,prisma-generate,backend-tests,backend-build,frontend-build,lint,diff-check}.log`, `validation-results.json`, `jest-results.json` y `npm-ci.log`. Primera pasada conservada en `../audit-work/initial-validation/`; resultados de instalación intermedia en `../audit-work/range-validation/`. Los logs están fuera del repositorio y no contienen env privados.

| Dependencia | Versión observada | Referencia |
|---|---|---|
| Node | v22.19.0 | package.json exige >=20.11; Docker node:22-alpine |
| npm | 10.9.3 | npm.cmd por política PowerShell |
| PostgreSQL esperado | 15 | docker-compose.yml postgres:15-alpine; versión real de Railway no consultada |
| prisma | 5.22.0 | lock raíz: 5.22.0 |
| @prisma/client | 5.22.0 | lock raíz: 5.22.0 |
| @nestjs/core | 11.1.24 | lock raíz: 11.1.24 |
| @nestjs/config | 4.0.4 | lock raíz: 4.0.4 |
| typescript | 5.9.3 | lock raíz: 5.9.3 |
| react | 18.3.1 | lock raíz: 18.3.1 |
| react-dom | 18.3.1 | lock raíz: 18.3.1 |
| vite | 6.4.2 | lock raíz: 6.4.2 |
| leaflet | 1.9.4 | lock raíz: 1.9.4 |
| @types/leaflet | 1.9.21 | lock raíz: 1.9.21 |
| jest | 29.7.0 | lock raíz: 29.7.0 |
| ts-jest | 29.4.11 | lock raíz: 29.4.11 |
| eslint | 9.39.4 | lock raíz: 9.39.4 |
| exceljs | 4.4.0 | lock raíz: 4.4.0 |
| csv-parse | 5.6.0 | lock raíz: 5.6.0 |
| pdfkit | 0.15.2 | lock raíz: 0.15.2 |
| bcryptjs | 2.4.3 | lock raíz: 2.4.3 |
| axios | 1.16.1 | lock raíz: 1.16.1 |

Las versiones observadas de esta tabla se cotejaron con su entrada raíz o workspace de package-lock.json después de npm ci: coinciden. No se actualizaron manifiestos ni locks. La instalación intermedia por rangos quedó reemplazada y sus validaciones no se usan como cierre del baseline. Paquetes de integración: SMTP se implementa con node:net/node:tls; no SDK G1/G2/G3/SmartOLT/Facturación.cl/TVIP. React Router está declarado, pero la navegación de features usa tabs de App, no rutas URL por feature.

| Suite | Total | Passed | Failed | Skipped | Estado |
|---|---|---|---|---|---|
| `backend/src/crm.integration.spec.ts` | 1 | 0 | 0 | 1 | skipped |
| `backend/src/users/users.service.spec.ts` | 8 | 8 | 0 | 0 | passed |
| `backend/src/reports/reports.service.spec.ts` | 5 | 5 | 0 | 0 | passed |
| `backend/src/coverage/coverage.service.spec.ts` | 16 | 16 | 0 | 0 | passed |
| `backend/src/prospects/prospects-coverage.spec.ts` | 10 | 10 | 0 | 0 | passed |
| `backend/src/inventory/inventory.service.spec.ts` | 2 | 2 | 0 | 0 | passed |
| `backend/src/prospects/prospects.service.spec.ts` | 13 | 13 | 0 | 0 | passed |
| `backend/src/work-orders/work-orders.service.spec.ts` | 8 | 8 | 0 | 0 | passed |
| `backend/src/contracts/plan-changes.spec.ts` | 11 | 11 | 0 | 0 | passed |
| `backend/src/contracts/contracts.service.spec.ts` | 2 | 2 | 0 | 0 | passed |
| `backend/src/customers/customers.service.spec.ts` | 5 | 5 | 0 | 0 | passed |
| `backend/src/companies/companies.service.spec.ts` | 2 | 2 | 0 | 0 | passed |
| `backend/src/common/guards/jwt-auth.guard.spec.ts` | 3 | 3 | 0 | 0 | passed |
| `backend/src/plans/plans.service.spec.ts` | 9 | 9 | 0 | 0 | passed |
| `backend/src/mail/mail.service.spec.ts` | 2 | 2 | 0 | 0 | passed |
| `backend/src/services/services.service.spec.ts` | 4 | 4 | 0 | 0 | passed |
| `backend/src/requests/requests.service.spec.ts` | 5 | 5 | 0 | 0 | passed |
| `backend/src/observations/observations.service.spec.ts` | 3 | 3 | 0 | 0 | passed |
| `backend/src/app.controller.spec.ts` | 1 | 1 | 0 | 0 | passed |
| `backend/src/common/service-type.spec.ts` | 5 | 5 | 0 | 0 | passed |
| `backend/src/rut/rut.util.spec.ts` | 5 | 5 | 0 | 0 | passed |
| `backend/src/common/roles.spec.ts` | 14 | 14 | 0 | 0 | passed |
| `backend/src/common/install-order-metadata.spec.ts` | 2 | 2 | 0 | 0 | passed |

Cobertura de validación limitada: no hay suite propia Billing/Monitoring/TVIP/Imports/Tickets ni test frontend automatizado. Algunas funciones reciben cobertura indirecta; no se cuantifica como cobertura total de esos módulos. La suite omitida es crm.integration.spec.ts (PostgreSQL con rollback).


## Anexo B. Módulos registrados

| Módulo | Responsabilidad | Owner final | Estado I3 | Acción futura |
|---|---|---|---|---|
| ConfigModule | Configuración | Infraestructura G8 | IMPLEMENTADA | Mantener; separar secretos por owner |
| SecurityModule | JWT de empleados | G8 | IMPLEMENTADA | Mantener; S2S futuro independiente |
| PrismaModule | Acceso PostgreSQL | Infraestructura G8 | IMPLEMENTADA | Preservar; limitar operaciones por owner |
| AuditModule | Auditoría CRM | G8 | IMPLEMENTADA | Añadir correlación de eventos futura |
| AuthModule | Login empleados | G8 | IMPLEMENTADA | Mantener; no usar como sesión Portal |
| BillingModule | Cobranza/pago/zonas | G8 | PARCIAL | Separar activación de red y proveedor de avisos |
| TvipModule | Credenciales locales TV IP | G8 comercial; técnico por acordar G3/G2 | PARCIAL | Acordar proveedor y trigger |
| MonitoringModule | Mediciones/historial locales | G3 | LEGACY/DEMO | Consulta externa futura |
| UsersModule | Empleados/roles | G8; referencias externas G1/G3 | IMPLEMENTADA con duplicación | Revisar remove y SQL que borra autoría cross-domain |
| CompaniesModule | Empresa/scope/dashboard | G8 | IMPLEMENTADA | Métricas físicas externas en lectura |
| ContractsModule | Contrato/firma/cambio plan/documento | G8 | IMPLEMENTADA/PARCIAL | Mantener vínculo Prospecto y lifecycle |
| RequestsModule | Solicitudes comerciales | G8 | PARCIAL | Derivar ejecución técnica; no sustituir cola WiFi |
| ObservationsModule | Observaciones contextuales | G8 | IMPLEMENTADA | Referencias externas autorizadas |
| CustomersModule | Perfil comercial | G8 | PARCIAL | Eliminar autoridad de datos técnicos gradualmente |
| RutModule | Validación DV | G8/utilidad compartible | IMPLEMENTADA | Normalizar antes de transmitir |
| ProspectsModule | Pipeline/cotización/factibilidad | G8; cobertura/agenda G3 | PARCIAL | Mantener comercial; sustituir TOMODAT y OT directos |
| PlansModule | Catálogo comercial | G8 | IMPLEMENTADA | Requisitos de equipos vía catálogo G1 |
| ServicesModule | Servicio comercial | G8; equipos G1, agenda G3 | PARCIAL | Controlar activación y delegar físico |
| InventoryModule | Inventario/materiales/NAP/evidencia | G1; red/evidencia G3 | LEGACY/TEMPORAL | Lectura acordada/API G1 y G3 |
| TicketsModule | Gestión CRM/derivación | G8; OT G3 | PARCIAL | Mantener clasificación; crear OT vía G3 |
| WorkOrdersModule | Agenda/cierres locales | G3; consecuencia comercial G8 | LEGACY/TEMPORAL | Históricos y receptor idempotente futuro |
| ReportsModule | CSV/Excel | G8; físicos en lectura G1/G3 | IMPLEMENTADA/PARCIAL | Mantener reportes comerciales |
| ImportsModule | Carga comercial CSV/Excel | G8 | LEGACY/PARCIAL | Diferenciar histórico de nuevo Prospecto |

| Registro transitivo | Responsabilidad | Owner | Estado/acción |
|---|---|---|---|
| CoverageModule ← ProspectsModule | Consulta TomoDAT | G8 geocodificación/comercial; G3 técnica | LEGACY/TEMPORAL; proveedor futuro |
| MailModule ← ProspectsModule | SMTP cotizaciones | G8 | IMPLEMENTADA configurable; no Billing externo |
| JwtModule ← SecurityModule | Firma/verificación JWT | G8 empleados | IMPLEMENTADA; mantener |


## Anexo C. Inventory: los 14 endpoints y métodos públicos

| Archivo:método público | Endpoint | Clasificación | Responsabilidad/duplicación | Destino |
|---|---|---|---|---|
| `backend/src/inventory/inventory.service.ts:35` InventoryService.list | GET /api/inventory | B. FUTURO_READ_ONLY_G1 | Consultar equipos/catálogo físico | G1 equipos/unidades/tipos, con alcance pactado |
| `backend/src/inventory/inventory.service.ts:68` InventoryService.createEquipment | POST /api/inventory/equipment | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:97` InventoryService.recordMovement | POST /api/inventory/movements | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:165` InventoryService.updateStatus | PATCH /api/inventory/equipment/:id/status | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:200` InventoryService.installRouter | POST /api/inventory/equipment/:id/install | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:315` InventoryService.advanced | GET /api/inventory/advanced | E. REQUIERE_ACUERDO | Lee stock/bodegas/transferencias/OT/NAP/evidencia | Separar consultas físicas G1 y técnicas G3 |
| `backend/src/inventory/inventory.service.ts:414` InventoryService.createNapBox | POST /api/inventory/nap-boxes | E. REQUIERE_ACUERDO | Crea CajaNap; dominio G3 | Sustituir por operación G3, no API inventario G1 |
| `backend/src/inventory/inventory.service.ts:446` InventoryService.createConsumableStock | POST /api/inventory/consumables | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:470` InventoryService.recordConsumableMovement | POST /api/inventory/consumables/:id/movements | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:555` InventoryService.blockEquipment | POST /api/inventory/equipment/:id/block | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:603` InventoryService.diagnoseEquipment | POST /api/inventory/equipment/:id/diagnosis | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:651` InventoryService.transferEquipment | POST /api/inventory/equipment/:id/transfer | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |
| `backend/src/inventory/inventory.service.ts:717` InventoryService.attachEvidence | POST /api/inventory/work-orders/:id/evidence | E. REQUIERE_ACUERDO | EvidenciaFoto de OT; dominio G3 | Evidencia del cierre G3 |
| `backend/src/inventory/inventory.service.ts:751` InventoryService.registerMaintenance | POST /api/inventory/equipment/:id/maintenance | C. REEMPLAZAR_POR_API_G1 | Escritura física local | G1; activaciones para asociación, otras operaciones por acordar |

No hay endpoint A. MANTENER_G8 puro dentro de Inventory; ninguno se elimina ahora. D. DEPRECAR es el destino posterior a sustitución verificada, no una acción de Etapa 0. Los métodos públicos del controlador son los mismos 14 de esta tabla. Helpers privados de resolución también escriben y aparecen a continuación.


## Anexo D. Matriz de accesos directos al dominio G1

**33 sitios de escritura directa** y **30 sitios de lectura Prisma directa** de inventario/materiales, en 16 métodos escritores y 13 endpoints alcanzables. Se cuentan sitios de código, no filas alteradas ni peticiones. Incluye cinco UPDATE SQL de Users; lecturas por relaciones se enumeran aparte.

| Archivo:línea | Método | Endpoint(s) | Modelo Prisma/SQL | Acción | L/E | Riesgo | Reemplazo futuro |
|---|---|---|---|---|---|---|---|
| `backend/src/companies/companies.service.ts:75` | summary | GET /api/companies/summary | UnidadEquipo | count | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/customers/customers.service.ts:145` | history | GET /api/customers/:id/history | UnidadEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/inventory/inventory.service.ts:37` | list | GET /api/inventory | UnidadEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/inventory/inventory.service.ts:44` | list | GET /api/inventory | TipoEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/tipos-equipo |
| `backend/src/inventory/inventory.service.ts:72` | createEquipment | POST /api/inventory/equipment | UnidadEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:106` | recordMovement | POST /api/inventory/movements | MovimientoInventario | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:122` | recordMovement | POST /api/inventory/movements | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:132` | recordMovement | POST /api/inventory/movements | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:169` | updateStatus | PATCH /api/inventory/equipment/:id/status | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:174` | updateStatus | PATCH /api/inventory/equipment/:id/status | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:262` | installRouter | POST /api/inventory/equipment/:id/install | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | POST /api/integraciones/activaciones (asociación definitiva) |
| `backend/src/inventory/inventory.service.ts:273` | installRouter | POST /api/inventory/equipment/:id/install | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | POST /api/integraciones/activaciones (asociación definitiva) |
| `backend/src/inventory/inventory.service.ts:317` | advanced | GET /api/inventory/advanced | Bodega | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:326` | advanced | GET /api/inventory/advanced | StockConsumible | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:336` | advanced | GET /api/inventory/advanced | TransferenciaEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:346` | advanced | GET /api/inventory/advanced | UnidadEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/inventory/inventory.service.ts:351` | advanced | GET /api/inventory/advanced | HistorialEstadoEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:361` | advanced | GET /api/inventory/advanced | TipoEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/tipos-equipo |
| `backend/src/inventory/inventory.service.ts:363` | advanced | GET /api/inventory/advanced | UsoMaterialOt | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:450` | createConsumableStock | POST /api/inventory/consumables | StockConsumible | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:471` | recordConsumableMovement | POST /api/inventory/consumables/:id/movements | StockConsumible | findUnique | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:477` | recordConsumableMovement | POST /api/inventory/consumables/:id/movements | Bodega | findUnique | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:503` | recordConsumableMovement | POST /api/inventory/consumables/:id/movements | StockConsumible | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:507` | recordConsumableMovement | POST /api/inventory/consumables/:id/movements | MovimientoInventario | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:523` | recordConsumableMovement | POST /api/inventory/consumables/:id/movements | UsoMaterialOt | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:559` | blockEquipment | POST /api/inventory/equipment/:id/block | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:567` | blockEquipment | POST /api/inventory/equipment/:id/block | BajaEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:577` | blockEquipment | POST /api/inventory/equipment/:id/block | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:612` | diagnoseEquipment | POST /api/inventory/equipment/:id/diagnosis | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:625` | diagnoseEquipment | POST /api/inventory/equipment/:id/diagnosis | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:669` | transferEquipment | POST /api/inventory/equipment/:id/transfer | TransferenciaEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:679` | transferEquipment | POST /api/inventory/equipment/:id/transfer | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:688` | transferEquipment | POST /api/inventory/equipment/:id/transfer | MovimientoInventario | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:761` | registerMaintenance | POST /api/inventory/equipment/:id/maintenance | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:766` | registerMaintenance | POST /api/inventory/equipment/:id/maintenance | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:799` | resolveType | POST /api/inventory/equipment | TipoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:814` | resolveConsumableType | POST /api/inventory/consumables | TipoEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/tipos-equipo |
| `backend/src/inventory/inventory.service.ts:827` | resolveConsumableType | POST /api/inventory/consumables | TipoEquipo | findFirst | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/tipos-equipo |
| `backend/src/inventory/inventory.service.ts:835` | resolveConsumableType | POST /api/inventory/consumables | TipoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:850` | resolveWarehouse | POST /api/inventory/consumables | Bodega | findUnique | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:863` | resolveWarehouse | POST /api/inventory/consumables | Bodega | findFirst | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/inventory/inventory.service.ts:871` | resolveWarehouse | POST /api/inventory/consumables | Bodega | create | ESCRITURA | ALTO: fuente física duplicada | Servicio G1 de la operación; endpoint aún no acordado |
| `backend/src/inventory/inventory.service.ts:924` | getUnitOrThrow | PATCH /api/inventory/equipment/:id/status<br>POST /api/inventory/equipment/:id/block<br>POST /api/inventory/equipment/:id/diagnosis<br>POST /api/inventory/equipment/:id/install<br>POST /api/inventory/equipment/:id/maintenance<br>POST /api/inventory/equipment/:id/transfer<br>POST /api/inventory/movements | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/monitoring/monitoring.service.ts:66` | equipmentStatus | GET /api/monitoring/equipment/:idUnidad/status | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/monitoring/monitoring.service.ts:85` | customerHistory | GET /api/monitoring/customers/:idCliente/history | UnidadEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/monitoring/monitoring.service.ts:113` | createDemoMeasurement | POST /api/monitoring/demo-measurements | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/monitoring/monitoring.service.ts:200` | statusPayload | GET /api/monitoring/customers/:idCliente/status<br>GET /api/monitoring/equipment/:idUnidad/status<br>GET /api/monitoring/services/:idServicio/status | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/observations/observations.service.ts:143` | resolveEntityContext | GET /api/observations/:tipoEntidad/:idEntidad<br>POST /api/observations | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/reports/reports.service.ts:105` | rows | GET /api/reports/export | UnidadEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/reports/reports.service.ts:166` | rows | GET /api/reports/export | UsoMaterialOt | findMany | LECTURA | MEDIO: scope/fuente por acordar | Lectura G1 explícitamente acordada; ruta no definida |
| `backend/src/reports/reports.service.ts:172` | rows | GET /api/reports/export | TipoEquipo | findMany | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/tipos-equipo |
| `backend/src/services/services.service.ts:336` | attachEquipment | POST /api/services/:id/equipment | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/services/services.service.ts:337` | attachEquipment | POST /api/services/:id/equipment | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/services/services.service.ts:360` | attachEquipment | POST /api/services/:id/equipment | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | POST /api/integraciones/activaciones (asociación definitiva) |
| `backend/src/work-orders/work-orders.service.ts:331` | completeInstallation | PATCH /api/work-orders/:id/complete-installation | UnidadEquipo | update | ESCRITURA | ALTO: fuente física duplicada | POST /api/integraciones/activaciones (asociación definitiva) |
| `backend/src/work-orders/work-orders.service.ts:349` | completeInstallation | PATCH /api/work-orders/:id/complete-installation | HistorialEstadoEquipo | create | ESCRITURA | ALTO: fuente física duplicada | POST /api/integraciones/activaciones (asociación definitiva) |
| `backend/src/work-orders/work-orders.service.ts:584` | resolveInstallationEquipment | PATCH /api/work-orders/:id/complete-installation | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/work-orders/work-orders.service.ts:585` | resolveInstallationEquipment | PATCH /api/work-orders/:id/complete-installation | UnidadEquipo | findUnique | LECTURA | MEDIO: scope/fuente por acordar | GET /api/integraciones/unidades/{numeroSerie} o /equipos por servicio |
| `backend/src/users/users.service.ts:128` | remove | DELETE /api/users/:id | BajaEquipo | SQL UPDATE baja_equipo; referencia usuario=NULL | ESCRITURA | ALTO: altera autoría/referencias G1 | Acordar retención/desactivación de usuario y operación del owner; no modificar G1 desde G8 |
| `backend/src/users/users.service.ts:131` | remove | DELETE /api/users/:id | HistorialEstadoEquipo | SQL UPDATE historial_estado_equipo; referencia usuario=NULL | ESCRITURA | ALTO: altera autoría/referencias G1 | Acordar retención/desactivación de usuario y operación del owner; no modificar G1 desde G8 |
| `backend/src/users/users.service.ts:135` | remove | DELETE /api/users/:id | MovimientoInventario | SQL UPDATE movimiento_inventario; referencia usuario=NULL | ESCRITURA | ALTO: altera autoría/referencias G1 | Acordar retención/desactivación de usuario y operación del owner; no modificar G1 desde G8 |
| `backend/src/users/users.service.ts:137` | remove | DELETE /api/users/:id | No modelado en Prisma G8 (tabla SQL) | SQL UPDATE orden_ingreso; referencia usuario=NULL | ESCRITURA | ALTO: altera autoría/referencias G1 | Acordar retención/desactivación de usuario y operación del owner; no modificar G1 desde G8 |
| `backend/src/users/users.service.ts:143` | remove | DELETE /api/users/:id | TransferenciaEquipo | SQL UPDATE transferencia_equipo; referencia usuario=NULL | ESCRITURA | ALTO: altera autoría/referencias G1 | Acordar retención/desactivación de usuario y operación del owner; no modificar G1 desde G8 |

| Lectura relacional adicional | Modelo | Métodos/endpoints consumidores | Riesgo/destino |
|---|---|---|---|
| `backend/src/contracts/contracts.service.ts:30` | UnidadEquipo vía servicios.equipos | Operaciones de Contracts que usan CONTRACT_INCLUDE/getContractOrThrow y devuelven contrato | FUTURO_READ_ONLY_G1; proyectar solo campos permitidos |
| `backend/src/services/services.service.ts:29` | UnidadEquipo vía equipos | listByCustomer/detail/getServiceOrThrow; respuestas create/update/ensureInstallationServiceForContract | FUTURO_READ_ONLY_G1; no convertir include en ownership físico |
| `backend/src/customers/customers.service.ts:133` | UnidadEquipo vía servicios.equipos | history → GET /api/customers/:id/history | FUTURO_READ_ONLY_G1 |
| `backend/src/monitoring/monitoring.service.ts:23` | UnidadEquipo vía equipos | customerStatus/serviceStatus → GET monitoring/customers o services/.../status | Lectura acordada G1/G3 |


## Anexo E. WorkOrders y operaciones G3 distribuidas

| Archivo/operación | Endpoint(s) | Clasificación | Responsabilidad/destino |
|---|---|---|---|
| `backend/src/customers/customers.service.ts:76` CustomersService.updateTechnicalData | PATCH /api/customers/:id/technical-data | DUPLICADA_G3 | Edición de red en JSON Cliente; futuro solo lectura externa |
| `backend/src/inventory/inventory.service.ts:200` InventoryService.installRouter | POST /api/inventory/equipment/:id/install | DUPLICADA_G3 | NAP/evidencia/cambio de metadata OT; mantener temporal hasta sustitución |
| `backend/src/inventory/inventory.service.ts:414` InventoryService.createNapBox | POST /api/inventory/nap-boxes | DUPLICADA_G3 | NAP/evidencia/cambio de metadata OT; mantener temporal hasta sustitución |
| `backend/src/inventory/inventory.service.ts:717` InventoryService.attachEvidence | POST /api/inventory/work-orders/:id/evidence | DUPLICADA_G3 | NAP/evidencia/cambio de metadata OT; mantener temporal hasta sustitución |
| `backend/src/prospects/prospects.service.ts:518` ProspectsService.installAvailability | GET /api/prospects/:id/install-availability | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/prospects/prospects.service.ts:530` ProspectsService.installDayAvailability | GET /api/prospects/:id/install-day-availability | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/prospects/prospects.service.ts:544` ProspectsService.createInstallOrder | POST /api/prospects/:id/install-orders | REEMPLAZAR_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/prospects/prospects.service.ts:784` ProspectsService.buildInstallAvailability | GET /api/prospects/:id/install-availability<br>GET /api/prospects/:id/install-day-availability<br>POST /api/prospects/:id/install-orders | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/services/services.service.ts:399` ServicesService.installAvailability | GET /api/services/:id/install-availability | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/services/services.service.ts:412` ServicesService.installDayAvailability | GET /api/services/:id/install-day-availability | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/services/services.service.ts:434` ServicesService.createInstallOrder | POST /api/services/:id/install-order | REEMPLAZAR_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/services/services.service.ts:840` ServicesService.buildInstallAvailability | GET /api/services/:id/install-availability<br>GET /api/services/:id/install-day-availability<br>POST /api/services/:id/install-order | DUPLICADA_G3 | OT local/agenda/técnicos de Usuario; catálogo y disponibilidad deben ser de G3 |
| `backend/src/tickets/tickets.service.ts:115` TicketsService.createWorkOrder | POST /api/tickets/:id/work-order | REEMPLAZAR_G3 | Mantener derivación comercial G8; solicitar ejecución G3 |
| `backend/src/users/users.service.ts:103` UsersService.remove | DELETE /api/users/:id | REQUIERE_COORDINACIÓN (DUPLICADA_G3) | SQL UPDATE historial_ot:132 y orden_trabajo:138 desvincula autor/técnico |
| `backend/src/work-orders/work-orders.service.ts:22` WorkOrdersService.list | GET /api/work-orders | LECTURA / HISTÓRICA | Consulta OT antiguas/locales; conservar compatibilidad |
| `backend/src/work-orders/work-orders.service.ts:125` WorkOrdersService.completeInstallation | PATCH /api/work-orders/:id/complete-installation | MANTENER_TEMPORAL / REEMPLAZAR_G3 | Cierre técnico G3; consecuencia comercial G8; escribe físico G1 hoy |
| `backend/src/work-orders/work-orders.service.ts:418` WorkOrdersService.cancelInstallation | PATCH /api/work-orders/:id/cancel-installation | MANTENER_TEMPORAL / REEMPLAZAR_G3 | Cancela agenda local y devuelve Servicio a pendiente; no cambia a Baja |
| `backend/src/work-orders/work-orders.service.ts:468` WorkOrdersService.completeRepair | PATCH /api/work-orders/:id/complete-repair | MANTENER_TEMPORAL / REEMPLAZAR_G3 | Cierra OT y resuelve Ticket; estado Cliente opcional legacy |
| `backend/src/common/work-order-code.ts` workOrderCodePrefix/generateWorkOrderCode | Llamadas desde Prospectos, Services, Tickets; sin endpoint propio | DEPRECAR para OT nuevas / HISTÓRICA | Conservar identificación antigua; código nuevo pertenece a G3 |

No se detectó PATCH genérico /work-orders/:id/status ni endpoint exclusivo de asignación. Estados/asignación se escriben en las operaciones listadas. Lecturas auxiliares OT también aparecen en Reports, Inventory.advanced, Customers.history, Services y resumen Companies; siguen siendo históricas/temporales. Monitoreo está clasificado en §8.


## Anexo F. Features frontend completas

| Feature / ruta fuente | Ruta UI | Backend consumido | Owner final | Estado | Duplicación | Riesgo | Acción futura |
|---|---|---|---|---|---|---|---|
| `frontend/src/features/audit` | tab audit | /audit (carga App) | G8 | IMPLEMENTADA | No | Bajo | Mantener |
| `frontend/src/features/auth` | pantalla login, raíz | /auth/login, /auth/me | G8 empleados | IMPLEMENTADA | No Portal | Bajo | Mantener |
| `frontend/src/features/billing` | tab billing | /billing/*; CoveragePicker /coverage/* | G8; cobertura técnica G3 | PARCIAL | Coverage temporal | Estados/no envío real | Mantener comercial; proveedor futuro |
| `frontend/src/features/coverage` | componente en prospects/billing | /coverage/status, /coverage/check | G8 geocodificación/UI; G3 técnica | LEGACY/TEMPORAL | TOMODAT directo | Alto: provider acoplado | Refactor futuro; conservar mapa |
| `frontend/src/features/customers` | tab customers y modales | /customers/*, /contracts/*, /services/*, /requests/*, /monitoring/*, /tvip/*, /work-orders/*, /prospects/pending-activation | G8; físico G1/G3 | PARCIAL | Equipo/agenda/monitoreo locales | Alto: activación manual/cliente global | Mantener comercial; refactor técnico |
| `frontend/src/features/dashboard` | tab dashboard | /companies/summary y datos de App | G8 | IMPLEMENTADA | Métricas inventario/OT locales | Medio | Mantener; fuentes externas después |
| `frontend/src/features/import` | tab import | POST /imports/clients | G8 | PARCIAL/LEGACY | Alta Cliente fuera del cierre | Alto | Refinar importación histórica; no usar Libro ahora |
| `frontend/src/features/installations` | tab installations y forms | /prospects/:id/install-orders, disponibilidad; /work-orders/:id/complete-installation | G8 solicitud; G3 operación | LEGACY/TEMPORAL | Agenda/cierre G3 | Alto | Refactor hacia G3; conservar históricos |
| `frontend/src/features/inventory` | tab inventory, panel avanzado | GET /inventory, /inventory/advanced y 12 mutaciones | G1; NAP/evidencia G3 | LEGACY/TEMPORAL | Inventario físico y red | Alto | Futura lectura/API; deprecar formularios físicos tras integración |
| `frontend/src/features/observations` | modal contextual transversal | GET/POST /observations | G8 | IMPLEMENTADA | Referencias a equipo/OT local | Medio | Mantener con referencias externas |
| `frontend/src/features/plans` | tab plans | /plans y activate/deactivate/delete | G8 | IMPLEMENTADA | No CRUD de equipo | Bajo/medio: catálogo requisitos faltante | Mantener |
| `frontend/src/features/prospects` | tab prospects, workflow modal | /prospects/*, /contracts/:id/confirm-signature, /coverage/* | G8; factibilidad/agenda G3 | PARCIAL | TOMODAT y agenda locales | Alto | Mantener pipeline; proveedor futuro |
| `frontend/src/features/reports` | tab reports | GET /reports/export | G8; físico G1/G3 lectura | IMPLEMENTADA/PARCIAL | Consultas físicas | Medio | Mantener comercial; ajustar lectura externa |
| `frontend/src/features/tickets` | tab tickets | /tickets/*, /customers/search, /services/customer/:id | G8; ejecución G3 | PARCIAL | Creación OT directa | Alto | Mantener clasificación; delegar OT |
| `frontend/src/features/users` | tab users | /users/* y /users/roles | G8 | IMPLEMENTADA | Delete afecta tablas G1/G3 por SQL | Alto en borrado | Mantener administración; acordar referencias |
| `frontend/src/features/work-orders` | tab work-orders | GET /work-orders, complete-installation, complete-repair | G3; comercial G8 | LEGACY/TEMPORAL | Cierre terreno duplicado | Alto | Lectura histórica; sustituir operación G3 |

Las rutas UI indicadas son claves tab/ubicación en App, no endpoints ni rutas HTTP independientes. Inventario: InventoryPanel lista/crea equipo; InventoryAdvancedPanel ejecuta estado, movimiento, bloqueo, diagnóstico, transferencia, mantención, asociación, consumibles, NAP y evidencia. Cada acción corresponde a su clasificación de Anexo C; las dos vistas permanecen intactas. El componente compartido `frontend/src/shared/components/MonitoringStatusView.tsx` es FUTURO_G3 (lectura DB local actual). No hay feature Portal ni feature TVIP separada: TVIP se integra en Customers.


## Anexo G. Inventario exhaustivo de migraciones y SQL

| Migración/SQL | Fecha | Objetivo | Tablas afectadas | Tipo | Aditiva/no aditiva | Estado | Riesgo | Aplicada local | Railway |
|---|---|---|---|---|---|---|---|---|---|
| `backend/prisma/migrations/20260912150000_crm_activation_flow/migration.sql` | 2026-09-12 (nombre) | Lifecycle Contrato↔Prospecto, snapshot/FK/índice | contrato | Prisma SQL DDL | Aditiva | Existe; no ejecutada en esta auditoría | ALTO: duplica db/init/10, FK sin guard | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `backend/prisma/migrations/20260916120000_installation_prospect_flow/migration.sql` | 2026-09-16 (nombre) | OT↔Prospecto, FK/índice; requerida por código I3 | orden_trabajo | Prisma SQL DDL | Aditiva | Existe; no ejecutada en esta auditoría | ALTO: ausente de init, FK sin guard | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `backend/prisma/migrations/20260916170000_expand_plan_type_catalog/migration.sql` | 2026-09-16 (nombre) | Ampliar plan.tipo_plan a VARCHAR(40) | plan | Prisma SQL DDL | No aditiva (ALTER TYPE) | Existe; no ejecutada en esta auditoría | MEDIO: lock/compatibilidad; SQL base ya 40 | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/demo_seed.sql` | Sin fecha intrínseca | Datos demo generales comerciales y físicos | cliente, contrato, direccion_servicio, log_auditoria, orden_trabajo, plan, prospecto, ticket, tipo_equipo, unidad_equipo | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO fuera de demo | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/01_schema.sql` | Sin fecha intrínseca | Esquema inicial compartido (55 tablas) | baja_equipo, bodega, caja_nap, canal_whatsapp, categoria_falla, cliente, configuracion_seo, consentimiento_cookies, contrato, conversacion_bot, cotizacion, credenciales_tvip, detalle_orden_ingreso, direccion_servicio, empresa, evidencia_foto, factura, historial_conexion_ont, historial_estado_equipo, historial_ot, intento_fallido, lista_negra, llamada_cortes, log_auditoria, log_notificacion, mensaje_bot, mensaje_whatsapp, monitoreo_ont, movimiento_inventario, mufa, olt, orden_ingreso, orden_trabajo, pago, plan, plantilla_notificacion, plantilla_whatsapp, prestamo_externo, prospecto, proveedor, puerto_nap, punto_cobertura, rol, servicio_contratado, sesion_portal, stock_consumible, tarjeta_pon, tecnico_externo, ticket, tipo_equipo, transferencia_equipo, unidad_equipo, uso_material_ot, usuario, usuario_rol | DDL inicial | Creación; no idempotente | Existe; no ejecutada en esta auditoría | ALTO: recreación/objetos existentes y múltiples owners | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/02_local_adjustments.sql` | Sin fecha intrínseca | Ajustes locales, ServicioContratado, backfill y quitar UNIQUE prospecto-cliente | cliente, orden_trabajo, prospecto, servicio_contratado, ticket, unidad_equipo, usuario, usuario_rol | DDL+DML | Mixta/no aditiva | Existe; no ejecutada en esta auditoría | ALTO: constraints y datos históricos | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/03_seed.sql` | Sin fecha intrínseca | Empresas/roles/usuarios/categorías demo | categoria_falla, empresa, rol, usuario, usuario_rol | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO fuera de demo | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/04_seed_demo.sql` | Sin fecha intrínseca | Clientes/contratos/servicios demo | cliente, contrato, direccion_servicio, plan, servicio_contratado, usuario, usuario_rol | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO fuera de demo | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/05_seed_cable_magico.sql` | Sin fecha intrínseca | Datos demo segunda empresa y relaciones | categoria_falla, cliente, contrato, cotizacion, direccion_servicio, orden_trabajo, plan, prospecto, servicio_contratado, ticket, tipo_equipo, unidad_equipo, usuario, usuario_rol | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO: mezcla comercial/G1/G3 | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/06_seed_incremento2.sql` | Sin fecha intrínseca | Facturas, bodegas, materiales, NAP y plantillas demo I2 | bodega, caja_nap, factura, plantilla_notificacion, stock_consumible, tipo_equipo, uso_material_ot | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO fuera de demo | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/07_seed_portal_monitoring_tvip.sql` | Sin fecha intrínseca | Datos demo comerciales/red/monitoreo; nombre no acredita Portal operativo | caja_nap, cliente, contrato, direccion_servicio, historial_conexion_ont, monitoreo_ont, mufa, olt, plan, puerto_nap, servicio_contratado, tarjeta_pon, tipo_equipo, unidad_equipo | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO: mezclas G1/G3 y datos sintéticos | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/08_seed_reunion_duenos_servicios_contratos.sql` | Sin fecha intrínseca | Zonas/precios/solicitudes/observaciones/cambios de plan/documentos; DDL+demo | contrato, contrato_digital, historial_cambio_plan, observacion_operativa, plan_zona_precio, servicio_contratado, solicitud_cliente, unidad_equipo, zona_pago | DDL+DML | Mixta | Existe; no ejecutada en esta auditoría | ALTO: índices únicos, datos y cross-domain | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/09_seed_inventory_traceability.sql` | Sin fecha intrínseca | Trazabilidad demo de inventario | historial_estado_equipo, movimiento_inventario, unidad_equipo | Seed DML | No aditiva de schema; escribe datos | Existe; no ejecutada en esta auditoría | ALTO dominio G1 | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/09_work_order_tracking_codes.sql` | Sin fecha intrínseca | Columna/códigos de seguimiento OT y backfill | orden_trabajo | DDL+DML | Mixta: adición y actualización | Existe; no ejecutada en esta auditoría | MEDIO/ALTO: unicidad/owner G3 | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/10_crm_activation_flow.sql` | Sin fecha intrínseca | Contrato↔Prospecto, snapshot dirección, FK e índice | contrato | DDL | Aditiva | Existe; no ejecutada en esta auditoría | ALTO: FK duplicada si se aplica también Prisma | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/10_prospect_external_contract_flow.sql` | Sin fecha intrínseca | Datos contrato externo y pérdida; amplía estados | cliente, contrato, prospecto | DDL | Mixta (ADD/ALTER TYPE) | Existe; no ejecutada en esta auditoría | MEDIO: lifecycle/históricos | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/11_customer_contract_workflow.sql` | Sin fecha intrínseca | Firma manual e índice contrato-cliente/estado | contrato | DDL | Aditiva | Existe; no ejecutada en esta auditoría | MEDIO: definición de firma | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/12_crm_plan_changes.sql` | Sin fecha intrínseca | Estado/fecha de aplicación e índices para cambio pendiente | historial_cambio_plan | DDL | Aditiva con DEFAULT sobre históricos | Existe; no ejecutada en esta auditoría | MEDIO: único parcial y marcado de historial | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `db/init/13_user_sessions.sql` | Sin fecha intrínseca | Versionado sesión empleado | usuario | DDL | Aditiva | Existe; no ejecutada en esta auditoría | MEDIO: revocación/login empleados; no sesión Portal | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |
| `output/backups/08_schema_only.sql` | Sin fecha intrínseca | Respaldo de esquema; no migración ni ledger | contrato, contrato_digital, historial_cambio_plan, observacion_operativa, plan_zona_precio, servicio_contratado, solicitud_cliente, unidad_equipo, zona_pago | Dump DDL | No clasificable como incremento seguro | Existe; no ejecutada en esta auditoría | ALTO: no ejecutar sobre base compartida | DESCONOCIDA; 0 aplicada en esta sesión | DESCONOCIDA; 0 aplicada en esta sesión |

Las tablas de la matriz se obtuvieron de DDL/DML del archivo; en dumps se resumen las tablas nombradas por CREATE/ALTER. La columna fecha de scripts numerados no infiere fecha de autoría a partir de mtime del ZIP. Coverage, polígonos, WiFi y token Portal TEXT no tienen migración en este baseline. ServicioContratado/zonas son SQL I2; las migraciones fechadas de septiembre refinan lifecycle/OT/tipos, sin una carpeta llamada I3.


## Anexo H. Variables de entorno, sin valores

| Variable | Declarada en ejemplos | Presencia local (sin valor) | Consumo | Clasificación |
|---|---|---|---|---|
| API_PROXY_TARGET | .env.example | .env | frontend/vite.config.ts:4 | DEFINIDA |
| BACKEND_PORT | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| BILLING_CUT_DAYS | No | No valor definido en archivos locales revisados | backend/src/billing/billing.service.ts:592 | FALTANTE en ejemplos |
| BILLING_NOTIFICATION_MODE | No | No valor definido en archivos locales revisados | backend/src/billing/billing.service.ts:597 | FALTANTE en ejemplos |
| CRM_INTEGRATION_TESTS | No | No valor definido en archivos locales revisados | backend/src/crm.integration.spec.ts:11 | FALTANTE en ejemplos |
| DATABASE_URL | .env.example, .env.railway.example, backend/.env.example | .env, .env.railway | backend/prisma/schema.prisma:7; Compose | DEFINIDA / RIESGO (manejo de secreto/configuración) |
| FRONTEND_PORT | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| FRONTEND_URL | .env.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/main.ts:10 | DEFINIDA |
| JWT_EXPIRES_IN | .env.example, .env.railway.example, backend/.env.example | .env, .env.railway | backend/src/security/security.module.ts:16 | DEFINIDA |
| JWT_SECRET | .env.example, .env.railway.example, backend/.env.example | .env, .env.railway | backend/src/security/security.module.ts:14 | DEFINIDA / RIESGO (manejo de secreto/configuración) |
| MONITORING_RECENT_HOURS | .env.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/monitoring/monitoring.service.ts:196 | DEFINIDA |
| NODE_ENV | No | No valor definido en archivos locales revisados | backend/src/monitoring/monitoring.service.ts:109 | FALTANTE en ejemplos |
| PORT | backend/.env.example | No valor definido en archivos locales revisados | backend/src/main.ts:40 | DEFINIDA |
| POSTGRES_DB | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| POSTGRES_PASSWORD | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| POSTGRES_PORT | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| POSTGRES_USER | .env.example | .env | Compose; puertos/configuración local | DEFINIDA |
| RAILWAY_BACKEND_PORT | .env.railway.example | .env.railway | Compose; puertos/configuración local | DEFINIDA |
| RAILWAY_FRONTEND_PORT | .env.railway.example | .env.railway | Compose; puertos/configuración local | DEFINIDA |
| SMTP_FROM | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_FROM_NAME | .env.example, .env.railway.example, backend/.env.example | .env | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_HELO | No | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | FALTANTE en ejemplos |
| SMTP_HOST | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_PASSWORD | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA / RIESGO (manejo de secreto/configuración) |
| SMTP_PORT | .env.example, .env.railway.example, backend/.env.example | .env | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_REJECT_UNAUTHORIZED | No | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | FALTANTE en ejemplos / RIESGO (manejo de secreto/configuración) |
| SMTP_SECURE | .env.example, .env.railway.example, backend/.env.example | .env | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_STARTTLS | .env.example, .env.railway.example, backend/.env.example | .env | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| SMTP_USER | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/mail/mail.service.ts (helpers value/booleanValue/numberValue) | DEFINIDA |
| TOMODAT_API_TOKEN | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/coverage/coverage.service.ts:43; backend/src/coverage/coverage.service.ts:72 | DEFINIDA / LEGACY / RIESGO (manejo de secreto/configuración) |
| TOMODAT_API_URL | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/coverage/coverage.service.ts:68 | DEFINIDA / LEGACY |
| TOMODAT_COMPANY_ID | .env.example, .env.railway.example, backend/.env.example | No valor definido en archivos locales revisados | backend/src/coverage/coverage.service.ts:41 | DEFINIDA / LEGACY |
| VITE_API_URL | .env.example, .env.railway.example | .env, .env.railway | frontend/src/api.ts:3 | DEFINIDA |

| Familia solicitada | Estado | Observación |
|---|---|---|
| SmartOLT | FALTANTE / FUTURO_G3 | Sin variable/SDK/credencial detectada |
| G1/G2/G3 S2S | FALTANTE | Sin URL/llave/adaptador; nombres futuros no inventados |
| WhatsApp | FALTANTE | SQL histórico no es integración runtime |
| Facturación.cl | FALTANTE | Sin proveedor ni secrets declarados |
| TV IP proveedor | FALTANTE | Solo generación local sin secret externo |
| Portal/WiFi | FALTANTE en runtime G8 | Hash/sesión SQL pertenecen G2; no private key G3 |

“Definida en ejemplo” solo significa declaración, no credencial válida. Para TOMODAT company/token y SMTP host/user/password/from los ejemplos tienen campos vacíos; no se interpretan como integración activa. NODE_ENV limita el endpoint demo; debe ser production en un despliegue real. No se copian valores de archivos privados ni secretos a este informe.


## Anexo I. Catálogo completo de endpoints actuales

114 rutas detectadas en controladores del ZIP. No se probaron contra un servidor vivo: son evidencia de código, no disponibilidad desplegada. La acción futura se determina por las matrices anteriores; se mantienen todas en esta etapa.

| Endpoint | Controlador/archivo:línea | Método/servicio invocado |
|---|---|---|
| GET /api/ | `backend/src/app.controller.ts:5` AppController.status | Implementación directa en controlador |
| GET /api/audit | `backend/src/audit/audit.controller.ts:13` AuditController.list | this.auditService.list |
| POST /api/auth/login | `backend/src/auth/auth.controller.ts:12` AuthController.login | this.authService.login |
| GET /api/auth/me | `backend/src/auth/auth.controller.ts:17` AuthController.me | Implementación directa en controlador |
| GET /api/billing/overview | `backend/src/billing/billing.controller.ts:20` BillingController.overview | this.billingService.overview |
| POST /api/billing/refresh-delinquency | `backend/src/billing/billing.controller.ts:26` BillingController.refreshDelinquency | this.billingService.refreshDelinquency |
| POST /api/billing/notifications | `backend/src/billing/billing.controller.ts:32` BillingController.sendNotification | this.billingService.sendNotification |
| PATCH /api/billing/contracts/:id/suspend | `backend/src/billing/billing.controller.ts:38` BillingController.suspendContract | this.billingService.suspendContract |
| POST /api/billing/payments | `backend/src/billing/billing.controller.ts:44` BillingController.registerPayment | this.billingService.registerPayment |
| GET /api/billing/zones | `backend/src/billing/billing.controller.ts:50` BillingController.zones | this.billingService.zones |
| POST /api/billing/zones | `backend/src/billing/billing.controller.ts:56` BillingController.createZone | this.billingService.createZone |
| PATCH /api/billing/zones/:id | `backend/src/billing/billing.controller.ts:62` BillingController.updateZone | this.billingService.updateZone |
| GET /api/billing/zone-rules | `backend/src/billing/billing.controller.ts:72` BillingController.zoneRules | this.billingService.zoneRules |
| POST /api/billing/zone-rules | `backend/src/billing/billing.controller.ts:78` BillingController.createZoneRule | this.billingService.createZoneRule |
| GET /api/companies | `backend/src/companies/companies.controller.ts:15` CompaniesController.list | this.companiesService.list |
| GET /api/companies/summary | `backend/src/companies/companies.controller.ts:21` CompaniesController.summary | this.companiesService.summary |
| GET /api/contracts/:id/plan-changes | `backend/src/contracts/contracts.controller.ts:20` ContractsController.planChanges | this.contractsService.planChanges |
| PATCH /api/contracts/:id/plan-changes/:changeId/cancel | `backend/src/contracts/contracts.controller.ts:26` ContractsController.cancelChange | this.contractsService.cancelPlanChange |
| POST /api/contracts | `backend/src/contracts/contracts.controller.ts:32` ContractsController.createCustomerContract | this.contractsService.createCustomerContract |
| PATCH /api/contracts/:id/confirm-signature | `backend/src/contracts/contracts.controller.ts:38` ContractsController.confirmSignature | this.contractsService.confirmManualSignature |
| POST /api/contracts/:id/prepare-installation | `backend/src/contracts/contracts.controller.ts:48` ContractsController.prepareInstallation | this.contractsService.prepareInstallation |
| POST /api/contracts/:id/change-plan | `backend/src/contracts/contracts.controller.ts:57` ContractsController.changePlan | this.contractsService.changePlan |
| POST /api/contracts/:id/digital-contract | `backend/src/contracts/contracts.controller.ts:67` ContractsController.generateDigitalContract | this.contractsService.generateDigitalContract |
| GET /api/contracts/:id/digital-contract | `backend/src/contracts/contracts.controller.ts:73` ContractsController.getDigitalContracts | this.contractsService.getDigitalContracts |
| GET /api/contracts/:id/digital-contract/download | `backend/src/contracts/contracts.controller.ts:79` ContractsController.downloadDigitalContract | this.contractsService.downloadDigitalContract |
| PATCH /api/contracts/:id/digital-contract/sign-status | `backend/src/contracts/contracts.controller.ts:90` ContractsController.updateDigitalContractStatus | this.contractsService.updateDigitalContractStatus |
| GET /api/coverage/status | `backend/src/coverage/coverage.controller.ts:16` CoverageController.status | this.coverage.status |
| POST /api/coverage/check | `backend/src/coverage/coverage.controller.ts:21` CoverageController.check | this.coverage.check |
| GET /api/customers | `backend/src/customers/customers.controller.ts:17` CustomersController.list | this.customersService.list |
| GET /api/customers/search | `backend/src/customers/customers.controller.ts:23` CustomersController.find | this.customersService.findByRutOrContract |
| GET /api/customers/:id/history | `backend/src/customers/customers.controller.ts:29` CustomersController.history | this.customersService.history |
| PATCH /api/customers/:id/status | `backend/src/customers/customers.controller.ts:35` CustomersController.updateStatus | this.customersService.updateStatus |
| PATCH /api/customers/:id/technical-data | `backend/src/customers/customers.controller.ts:45` CustomersController.updateTechnicalData | this.customersService.updateTechnicalData |
| POST /api/imports/clients | `backend/src/imports/imports.controller.ts:23` ImportsController.importClients | this.importsService.importClients |
| GET /api/inventory | `backend/src/inventory/inventory.controller.ts:27` InventoryController.list | this.inventoryService.list |
| GET /api/inventory/advanced | `backend/src/inventory/inventory.controller.ts:33` InventoryController.advanced | this.inventoryService.advanced |
| POST /api/inventory/equipment | `backend/src/inventory/inventory.controller.ts:39` InventoryController.createEquipment | this.inventoryService.createEquipment |
| POST /api/inventory/nap-boxes | `backend/src/inventory/inventory.controller.ts:45` InventoryController.createNapBox | this.inventoryService.createNapBox |
| POST /api/inventory/consumables | `backend/src/inventory/inventory.controller.ts:51` InventoryController.createConsumableStock | this.inventoryService.createConsumableStock |
| POST /api/inventory/consumables/:id/movements | `backend/src/inventory/inventory.controller.ts:57` InventoryController.recordConsumableMovement | this.inventoryService.recordConsumableMovement |
| POST /api/inventory/movements | `backend/src/inventory/inventory.controller.ts:67` InventoryController.recordMovement | this.inventoryService.recordMovement |
| PATCH /api/inventory/equipment/:id/status | `backend/src/inventory/inventory.controller.ts:73` InventoryController.updateStatus | this.inventoryService.updateStatus |
| POST /api/inventory/equipment/:id/block | `backend/src/inventory/inventory.controller.ts:83` InventoryController.blockEquipment | this.inventoryService.blockEquipment |
| POST /api/inventory/equipment/:id/diagnosis | `backend/src/inventory/inventory.controller.ts:93` InventoryController.diagnoseEquipment | this.inventoryService.diagnoseEquipment |
| POST /api/inventory/equipment/:id/transfer | `backend/src/inventory/inventory.controller.ts:103` InventoryController.transferEquipment | this.inventoryService.transferEquipment |
| POST /api/inventory/equipment/:id/maintenance | `backend/src/inventory/inventory.controller.ts:113` InventoryController.registerMaintenance | this.inventoryService.registerMaintenance |
| POST /api/inventory/equipment/:id/install | `backend/src/inventory/inventory.controller.ts:123` InventoryController.installRouter | this.inventoryService.installRouter |
| POST /api/inventory/work-orders/:id/evidence | `backend/src/inventory/inventory.controller.ts:133` InventoryController.attachEvidence | this.inventoryService.attachEvidence |
| GET /api/monitoring/customers/:idCliente/status | `backend/src/monitoring/monitoring.controller.ts:16` MonitoringController.customerStatus | this.monitoringService.customerStatus |
| GET /api/monitoring/services/:idServicio/status | `backend/src/monitoring/monitoring.controller.ts:22` MonitoringController.serviceStatus | this.monitoringService.serviceStatus |
| GET /api/monitoring/equipment/:idUnidad/status | `backend/src/monitoring/monitoring.controller.ts:28` MonitoringController.equipmentStatus | this.monitoringService.equipmentStatus |
| GET /api/monitoring/customers/:idCliente/history | `backend/src/monitoring/monitoring.controller.ts:34` MonitoringController.customerHistory | this.monitoringService.customerHistory |
| POST /api/monitoring/demo-measurements | `backend/src/monitoring/monitoring.controller.ts:40` MonitoringController.createDemoMeasurement | this.monitoringService.createDemoMeasurement |
| GET /api/observations/:tipoEntidad/:idEntidad | `backend/src/observations/observations.controller.ts:16` ObservationsController.list | this.observationsService.list |
| POST /api/observations | `backend/src/observations/observations.controller.ts:26` ObservationsController.create | this.observationsService.create |
| GET /api/plans | `backend/src/plans/plans.controller.ts:17` PlansController.list | this.plansService.list |
| POST /api/plans | `backend/src/plans/plans.controller.ts:23` PlansController.create | this.plansService.create |
| PATCH /api/plans/:id | `backend/src/plans/plans.controller.ts:29` PlansController.update | this.plansService.update |
| PATCH /api/plans/:id/activate | `backend/src/plans/plans.controller.ts:35` PlansController.activate | this.plansService.setActive |
| PATCH /api/plans/:id/deactivate | `backend/src/plans/plans.controller.ts:41` PlansController.deactivate | this.plansService.setActive |
| DELETE /api/plans/:id | `backend/src/plans/plans.controller.ts:47` PlansController.remove | this.plansService.remove |
| GET /api/prospects | `backend/src/prospects/prospects.controller.ts:26` ProspectsController.list | this.prospectsService.list |
| GET /api/prospects/pending-activation | `backend/src/prospects/prospects.controller.ts:32` ProspectsController.listPendingActivation | this.prospectsService.listPendingActivation |
| POST /api/prospects | `backend/src/prospects/prospects.controller.ts:38` ProspectsController.create | this.prospectsService.create |
| PATCH /api/prospects/:id/pipeline | `backend/src/prospects/prospects.controller.ts:44` ProspectsController.updatePipeline | this.prospectsService.updatePipeline |
| POST /api/prospects/:id/feasibility | `backend/src/prospects/prospects.controller.ts:54` ProspectsController.verifyFeasibility | this.prospectsService.verifyFeasibility |
| POST /api/prospects/:id/quotes | `backend/src/prospects/prospects.controller.ts:64` ProspectsController.generateQuote | this.prospectsService.generateQuote |
| GET /api/prospects/:id/quotes/:quoteId/pdf | `backend/src/prospects/prospects.controller.ts:74` ProspectsController.downloadQuotePdf | this.prospectsService.buildQuotePdfBuffer |
| POST /api/prospects/:id/loss | `backend/src/prospects/prospects.controller.ts:89` ProspectsController.recordLoss | this.prospectsService.recordLoss |
| POST /api/prospects/:id/contracts | `backend/src/prospects/prospects.controller.ts:99` ProspectsController.contractPlan | this.prospectsService.contractPlan |
| POST /api/prospects/:id/install-orders | `backend/src/prospects/prospects.controller.ts:109` ProspectsController.createInstallOrder | this.prospectsService.createInstallOrder |
| GET /api/prospects/:id/install-availability | `backend/src/prospects/prospects.controller.ts:119` ProspectsController.installAvailability | this.prospectsService.installAvailability |
| POST /api/prospects/:id/feasibility/tomodat | `backend/src/prospects/prospects.controller.ts:129` ProspectsController.verifyTomodat | this.prospectsService.verifyTomodat |
| GET /api/prospects/:id/install-day-availability | `backend/src/prospects/prospects.controller.ts:139` ProspectsController.installDayAvailability | this.prospectsService.installDayAvailability |
| GET /api/reports/export | `backend/src/reports/reports.controller.ts:16` ReportsController.export | this.reportsService.export |
| GET /api/requests | `backend/src/requests/requests.controller.ts:18` RequestsController.list | this.requestsService.list |
| GET /api/requests/customer/:idCliente | `backend/src/requests/requests.controller.ts:24` RequestsController.listByCustomer | this.requestsService.listByCustomer |
| POST /api/requests | `backend/src/requests/requests.controller.ts:30` RequestsController.create | this.requestsService.create |
| PATCH /api/requests/:id/status | `backend/src/requests/requests.controller.ts:36` RequestsController.updateStatus | this.requestsService.updateStatus |
| PATCH /api/requests/:id/feasibility | `backend/src/requests/requests.controller.ts:46` RequestsController.updateFeasibility | this.requestsService.updateFeasibility |
| POST /api/rut/validate | `backend/src/rut/rut.controller.ts:12` RutController.validate | Implementación directa en controlador |
| GET /api/services/customer/:idCliente | `backend/src/services/services.controller.ts:22` ServicesController.listByCustomer | this.servicesService.listByCustomer |
| GET /api/services/:id | `backend/src/services/services.controller.ts:31` ServicesController.detail | this.servicesService.detail |
| GET /api/services/:id/install-availability | `backend/src/services/services.controller.ts:37` ServicesController.installAvailability | this.servicesService.installAvailability |
| GET /api/services/:id/install-day-availability | `backend/src/services/services.controller.ts:47` ServicesController.installDayAvailability | this.servicesService.installDayAvailability |
| POST /api/services/:id/install-order | `backend/src/services/services.controller.ts:57` ServicesController.createInstallOrder | this.servicesService.createInstallOrder |
| POST /api/services | `backend/src/services/services.controller.ts:67` ServicesController.create | this.servicesService.create |
| PATCH /api/services/:id | `backend/src/services/services.controller.ts:73` ServicesController.update | this.servicesService.update |
| PATCH /api/services/:id/deactivate | `backend/src/services/services.controller.ts:83` ServicesController.deactivate | this.servicesService.deactivate |
| POST /api/services/:id/equipment | `backend/src/services/services.controller.ts:93` ServicesController.attachEquipment | this.servicesService.attachEquipment |
| GET /api/tickets | `backend/src/tickets/tickets.controller.ts:22` TicketsController.list | this.ticketsService.list |
| GET /api/tickets/categories | `backend/src/tickets/tickets.controller.ts:28` TicketsController.categories | this.ticketsService.categories |
| POST /api/tickets | `backend/src/tickets/tickets.controller.ts:34` TicketsController.create | this.ticketsService.create |
| POST /api/tickets/:id/work-order | `backend/src/tickets/tickets.controller.ts:40` TicketsController.createWorkOrder | this.ticketsService.createWorkOrder |
| PATCH /api/tickets/:id/category | `backend/src/tickets/tickets.controller.ts:50` TicketsController.updateCategory | this.ticketsService.updateCategory |
| PATCH /api/tickets/:id/priority | `backend/src/tickets/tickets.controller.ts:60` TicketsController.updatePriority | this.ticketsService.updatePriority |
| PATCH /api/tickets/:id/status | `backend/src/tickets/tickets.controller.ts:70` TicketsController.updateStatus | this.ticketsService.updateStatus |
| POST /api/tickets/:id/diagnosis | `backend/src/tickets/tickets.controller.ts:80` TicketsController.registerDiagnosis | this.ticketsService.registerDiagnosis |
| GET /api/tickets/:id/technical-notes | `backend/src/tickets/tickets.controller.ts:90` TicketsController.technicalNotes | this.ticketsService.technicalNotes |
| POST /api/tickets/:id/technical-notes | `backend/src/tickets/tickets.controller.ts:96` TicketsController.addTechnicalNote | this.ticketsService.addTechnicalNote |
| POST /api/tvip/contracts/:idContrato/generate | `backend/src/tvip/tvip.controller.ts:15` TvipController.generate | this.tvipService.generateForContract |
| POST /api/tvip/contracts/:idContrato/regenerate | `backend/src/tvip/tvip.controller.ts:21` TvipController.regenerate | this.tvipService.regenerateForContract |
| GET /api/tvip/customer/:idCliente | `backend/src/tvip/tvip.controller.ts:27` TvipController.listByCustomer | this.tvipService.listByCustomer |
| GET /api/users | `backend/src/users/users.controller.ts:18` UsersController.list | this.usersService.list |
| POST /api/users | `backend/src/users/users.controller.ts:23` UsersController.create | this.usersService.save |
| PATCH /api/users/:id | `backend/src/users/users.controller.ts:26` UsersController.update | this.usersService.save |
| PATCH /api/users/:id/password | `backend/src/users/users.controller.ts:29` UsersController.password | this.usersService.resetPassword |
| DELETE /api/users/:id | `backend/src/users/users.controller.ts:32` UsersController.remove | this.usersService.remove |
| GET /api/users/roles | `backend/src/users/users.controller.ts:35` UsersController.roles | this.usersService.roles |
| PATCH /api/users/:id/role | `backend/src/users/users.controller.ts:40` UsersController.assignRole | this.usersService.assignRole |
| GET /api/work-orders | `backend/src/work-orders/work-orders.controller.ts:17` WorkOrdersController.list | this.workOrdersService.list |
| PATCH /api/work-orders/:id/complete-installation | `backend/src/work-orders/work-orders.controller.ts:23` WorkOrdersController.completeInstallation | this.workOrdersService.completeInstallation |
| PATCH /api/work-orders/:id/cancel-installation | `backend/src/work-orders/work-orders.controller.ts:33` WorkOrdersController.cancelInstallation | this.workOrdersService.cancelInstallation |
| PATCH /api/work-orders/:id/complete-repair | `backend/src/work-orders/work-orders.controller.ts:42` WorkOrdersController.completeRepair | this.workOrdersService.completeRepair |
