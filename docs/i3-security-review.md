# QA local y revisión de seguridad — Incremento 3

Fecha local: 2026-10-06 (America/Santiago). Rama: `SecurityRealiseMatrizQA`.
Base: `f70ffcb72e5f8c358ca9d2790276142f3d132a19`.
Informe de QA previo a publicación. El usuario autorizó el commit y push de este paquete en `SecurityRealiseMatrizQA` el 2026-10-06. Los indicadores de working tree, commit y push de este informe corresponden al momento de validación anterior; el resultado de publicación se comprueba en el historial y la referencia remota de la rama. Las evidencias fechadas anteriores permanecen intactas.

## Alcance y trazabilidad

Se validó una copia temporal de los archivos versionados de la base más el diff del candidato. Los archivos privados no se copiaron. Las instalaciones usan `npm ci`; los cambios de dependencias se prepararon sin `npm update` ni `npm audit fix --force`.

Acceptance repetida el 2026-10-06, 22:13 America/Santiago; timestamp del harness: `2026-10-07T01:13:47.060Z`. Huella SHA256 del snapshot versionado de QA: `166502eb0ec9e8e27a5323f2ceb726265b9097d77baf64016af8757fe0964ec1`. Esta huella corresponde al snapshot de validación antes de actualizar este informe, no a un commit nuevo. Los archivos de ejecución y sus locks se cotejaron con el candidato aplicado.

El contenedor de pruebas no tenía redes conectadas durante compilación y tests. No se inició el backend del CRM, no se conectó PostgreSQL, no se usó Railway, no se ejecutaron migraciones/seed/pagos ni se llamó a proveedores reales. SMTP y HTTP de contrato usaron servidores loopback.

## Correcciones del candidato

- Entorno QA construido mediante una lista de variables del sistema permitidas: descarta URLs operativas, secretos, credenciales, flags optativos de DB, SMTP ambiental y hooks Node heredados. Usa exclusivamente una URL sintética de loopback con puerto 1.
- El ejecutor rechaza archivos dotenv que podrían cargarse automáticamente, incluye higiene y tests del modelo frontend, y distingue PASS_LOCAL/PASS_CONTRACT de los casos externos pendientes.
- El ejecutor entrega JSON por stdout, utiliza un temporal del sistema y lo elimina. No crea carpetas de evidencias ni sobrescribe el acceptance del 2026-10-04. Informa fecha, base, rama, estado del working tree y huella del snapshot; importar sus funciones no ejecuta las pruebas.
- Higiene ampliada a 7 tests: env privados/backups de datos (incluidos comprimidos) fuera de Git, claves PEM cifradas/no cifradas, plantillas sin tokens reales, aislamiento de credenciales y flags QA, SMTP loopback, informe censurado y URLs de dependencias sin credenciales/parámetros sensibles. El SQL schema-only sigue permitido.
- Dependencias y locks actualizados: csv-parse 7.0.3; Jest 30.5.2, tipos Jest 30 y ts-jest 29.4.14; override específico de uuid 11.1.1 para ExcelJS, tanto en raíz como en backend. Locks reproducibles de raíz/backend/frontend.
- Sin cambios en código de negocio, frontend funcional, configuración Docker, esquema Prisma, migraciones, SQL canónico o evidencias históricas.

## Resultados locales

| Comprobación | Resultado |
| --- | --- |
| Instalación conjunta desde lock con npm ci | PASS_LOCAL |
| Prisma validate y generate | PASS_LOCAL; sin conexión DB |
| Build backend y frontend | PASS_LOCAL; aviso existente de bundle frontend grande |
| Lint | PASS_LOCAL; 0 errores, 78 advertencias existentes |
| Backend Jest | 69 suites y 711 pruebas PASS; 5 suites y 8 pruebas DB omitidas |
| Herramientas globales/esquema | 22 pruebas PASS_LOCAL; prueban herramientas, no el schema remoto |
| Higiene | 7 pruebas PASS_LOCAL |
| Runtime frontend | 3 pruebas PASS_LOCAL |
| Modelo frontend | 6 pruebas PASS_LOCAL |
| Prototipo fiscal/cliente simulado | 19 pruebas PASS_LOCAL; no emisiones en proveedor |
| Total automatizado | 768 PASS, 0 FAIL, 8 omitidas |
| Harness de acceptance | 6 casos PASS_LOCAL + 13 PASS_CONTRACT; 0 FAIL |
| Nginx producción, prueba separada | PASS_LOCAL; health 200, fallback SPA, asset/caché, asset inexistente 404, .env 403 |

Nginx se construyó con el Dockerfile y lock frontend del candidato y se ejecutó sin red externa ni puertos publicados. No se comprobó la API desplegada ni un flujo de usuario conectado a DB. El harness deja Nginx y el escaneo como pendientes porque no los ejecuta; esta matriz incorpora las comprobaciones separadas realizadas en esta revisión.

## Dependencias

| Auditoría npm del workspace completo | Base | Candidato |
| --- | --- | --- |
| Todas las dependencias | 53 avisos: 1 bajo, 8 moderados, 43 altos, 1 crítico | 20 moderados; 0 bajos/altos/críticos |
| Dependencias de producción (omit=dev) | 19 avisos: 1 bajo, 6 moderados, 11 altos, 1 crítico | 0 avisos |
| Frontend independiente | 10 avisos | 0 avisos |

Las 20 entradas moderadas son la propagación de [sprintf-js GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) por herramientas Jest/ts-jest/Istanbul, no 20 fallos distintos confirmados en el CRM. El registro publicado no ofrece una versión corregida. La sugerencia automática implica degradar herramientas a versiones antiguas; no se aplicó. Pendiente de valoración del equipo antes del cierre de seguridad.

Las actualizaciones corrigen, entre otros, los paquetes reportados para [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [csv-parse](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) y [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). La auditoría enumera versiones afectadas; no demuestra explotación del CRM. Se conservaron las pruebas de importación/exportación CSV/Excel y los contratos de negocio.

## Credenciales: árbol actual e historia

El [informe heurístico saneado](i3-security-redacted.json) contiene 66 coincidencias: 58 del working tree G8 y 8 del snapshot G1 anterior conservadas sin revalidar. Todos los valores son `[REDACTED]`. Las coincidencias incluyen variables/referencias, placeholders, datos sintéticos, hashes demo y descripciones de tests; su número no equivale a secretos reales. Los cambios de este candidato agregan únicamente configuraciones sintéticas y tests de aislamiento.

Gitleaks 8.30.1, con censura y decodificación, produjo una coincidencia en el árbol actual: `scripts/verify-local-db.mjs:77`, clasificada como falso positivo por el nombre SQL de una FK. No se añadieron exclusiones para ocultarla. No se encontraron credenciales operativas confirmadas en los archivos actuales examinados.

No hay env privados, dumps de datos ni PEM privados versionados en el árbol actual. Solo están las tres plantillas existentes y `output/backups/08_schema_only.sql`; se verificó que este contiene DDL, no filas COPY/INSERT. No se creó ningún .env ni se copiaron credenciales a este repositorio.

La historia requiere cierre independiente:

- Los respaldos de datos introducidos por `46d9a98` fueron retirados del árbol, pero ese commit es ancestro de la base actual. La [revisión de recuperación](i3-recovery-security-2026-10-06.md) documenta 19 entradas JWT en cada uno de dos dumps, inspeccionados sin DB. El scanner textual normal no certifica el contenido comprimido de esos respaldos. La retirada del árbol no los elimina del historial.
- El commit `50801ff` con la antigua clave privada de fixture de pruebas SMTP no es ancestro de esta rama; aparece al revisar otras referencias locales. No se atribuye ese PEM al candidato actual.
- Las 8 coincidencias del snapshot G1, incluida la posible credencial documentada en su guía, quedan pendientes del responsable de G1. No están copiadas como valores en este informe ni se reutilizaron.

No se probaron valores encontrados contra servicios, revocaron sesiones, rotaron claves ni reescribió historia Git. La decisión sobre exposición histórica pertenece al responsable del repositorio/autenticación. Este informe no certifica ausencia universal de secretos, vigencia de fixtures ni seguridad de binarios no examinados.

## Matriz QA actual

| CASE_ID | Componente/tipo | Estado | Evidencia y límite |
| --- | --- | --- | --- |
| CORE_BACKEND_TESTS | Backend, unit/contract | PASS_LOCAL | 711 PASS; DB optativa omitida |
| GLOBAL_SCHEMA_TOOLS | Herramientas, unit | PASS_LOCAL | 22 PASS; no schema remoto |
| FRONTEND_RUNTIME_STATIC | Runtime, unit | PASS_LOCAL | 3 PASS |
| FRONTEND_MODEL | Modelo, unit | PASS_LOCAL | 6 PASS |
| FRONTEND_NGINX_LOCAL | Imagen producción, local | PASS_LOCAL | Health/SPA/assets/caché/404/403; sin backend |
| REPOSITORY_HYGIENE | Seguridad, local | PASS_LOCAL | 7 PASS; árbol actual |
| SECURITY_REDACTED_SCAN | Escaneo y clasificación, local | PASS_LOCAL | Informe censurado y FK falsa positiva; historia pendiente |
| DTE_PROTOTYPE | Fiscal simulado, unit | PASS_LOCAL | 19 PASS; no emisión real |
| AUTH_ROLES/MULTI_COMPANY/CUSTOMERS/PROSPECTS/CONTRACTS/SERVICES/BILLING/G1/G2/G3/DTE/META/SMTP_LOCAL | 13 grupos de contrato | PASS_CONTRACT | Suites mapeadas por el harness; no E2E externo |
| G1_REAL | Proveedor, E2E | PENDING_BENJAMIN | Endpoint/key de QA y coordinación |
| G2_REAL | Proveedor, E2E | PENDING_BENJAMIN | Replay/pagos/comprobantes y permiso de escritura |
| G3_REAL | Proveedor, E2E | PENDING_BENJAMIN | Confirmación de OT recibida, estados y webhook/reconcile |
| META_REAL | Mensajería externa | PENDING_BENJAMIN | Cuenta/template/destinatario QA y entrega |
| SMTP_REAL | Correo externo | PENDING_BENJAMIN | Configuración privada y recepción en buzón QA |
| FINET_DTE | Fiscal sandbox | PENDING_BENJAMIN | Perfil FiNet y emisión autorizada |
| CABLE_MAGICO_DTE | Fiscal sandbox | PENDING_BENJAMIN | Repetición autorizada para este candidato |
| DEPLOY_HEALTH | Despliegue actual | PENDING_BENJAMIN | URLs definitivas, CORS/readiness |
| SCHEMA_RELEASE | DB/migraciones | PENDING_BENJAMIN | Schema final aprobado y comparación readonly |
| SECURITY_RELEASE | Seguridad global | PENDING_BENJAMIN | Incidente histórico y avisos moderados de desarrollo |
| DB_CONCURRENCY | DB aislada | BLOCKED_EXTERNAL | Requiere DB de QA revisada; no Railway compartido |
| CORE_UI | Navegador/E2E local | BLOCKED_EXTERNAL | Requiere backend y DB aislada |

## Inventario provisional de evidencias existentes

- [Facturación.cl, 2026-10-03](evidencias/facturacion-cl/2026-10-03/README.md): 7 imágenes y resultados saneados. Hay una boleta histórica del sandbox de Cable Mágico y correo local en Mailpit; los paneles de tests corresponden a la base de esa fecha. La captura de instalación muestra G3 sin configurar y no prueba que G3 recibiera la OT.
- [SMTP, 2026-10-04](evidencias/smtp/2026-10-04/README.md): 1 imagen de Mailpit y resultados locales; utiliza documento simulado, no entrega SMTP externa.
- [Acceptance, 2026-10-04](evidencias/i3-release/2026-10-04/local-acceptance.json): resultado de una base anterior; preservado como histórico, no actualizado ni presentado como QA del candidato actual.

Las 8 imágenes existentes fueron revisadas visualmente para este inventario; no se observaron credenciales operativas visibles. No se certifican otras imágenes/binarios del repositorio. No se crearon capturas, documentos ni carpetas nuevas, ni se consolidó evidencia definitiva: faltan schema/Railway, G3 E2E, Meta, FiNet DTE y SMTP externo.

## Configuración manual y cierre

Para esta QA no se necesita crear un .env ni introducir la URL de Railway. No habilitar conexiones/proveedores operativos para repetirla. Si el checkout contiene dotenv privados auto-cargables, el harness se detiene antes de ejecutar suites.

La futura configuración de Railway debe hacerse únicamente en el archivo privado `.env.railway` de la raíz del repositorio, tomando como referencia `.env.railway.example`, tras coordinar entorno/schema y permisos con su responsable. No crear ese archivo como parte de esta QA ni usar la base compartida para pagos sintéticos. Nunca copiar sus valores al código, a plantillas, a reportes o a evidencias; verificar que Git lo ignore antes de publicar.

```text
QA_HEAD=f70ffcb72e5f8c358ca9d2790276142f3d132a19
QA_BRANCH=SecurityRealiseMatrizQA
QA_WORKTREE_BEFORE=9_modified_existing_files_uncommitted
QA_WORKTREE_AFTER=10_modified_existing_files_uncommitted
REPOSITORY_HYGIENE=PASS_LOCAL
SECURITY_REDACTED_SCAN=PASS_LOCAL
LOCAL_RELEASE_ACCEPTANCE=PASS_LOCAL
GLOBAL_TOOLS=PASS_LOCAL
FRONTEND_RUNTIME=PASS_LOCAL
TRACKED_PRIVATE_ENV=[]
TRACKED_DATA_BACKUPS=[]
TRACKED_PRIVATE_KEYS=[]
DATABASE_USED=false
RAILWAY_USED=false
EXTERNAL_PROVIDER_CALLS=0
QA_LOCAL_READY=true
SECURITY_RELEASE_LOCAL_READY=false
RELEASE_READY=false
COMMIT_CREATED=false
PUSH_PERFORMED=false
PR_CREATED=false
```

Bloqueadores de cierre: exposición histórica por decidir con el equipo, 20 entradas moderadas de herramientas de desarrollo pendientes de valoración y pruebas externas actuales sin ejecutar. La revisión local previa a publicación pasó y el usuario autorizó publicar este paquete QA. Esto no autoriza producción, migraciones o pruebas externas sin sus precondiciones.

### Refuerzo y auditoría previa a publicación

Se ampliaron únicamente comprobaciones de QA ya existentes. El auditor saneado reconoce también encabezados PEM DSA y ENCRYPTED; higiene mantiene la detección anterior de material PEM y cubre bloques completos, contenido escapado, más extensiones y backups SQL/dump/backup comprimidos. No se aplicaron exclusiones para ocultar hallazgos.

El harness comprueba los nombres de archivos dotenv antes de leer contenido para la huella. Si detecta un env privado versionado o auto-cargable, no calcula esa huella y no inicia suites. Una prueba deliberada con un env sintético solo dentro del contenedor confirmó `PRIVATE_ENV_FAIL_CLOSED=PASS_LOCAL`, `testsStarted=0` y `privateValuePrinted=false`; el archivo se eliminó dentro del contenedor. No se creó un env en el checkout del usuario.

Se repitió la instalación exacta del lock y la acceptance completa: 768 PASS, 8 omitidas, 0 FAIL. Build, lint y Nginx conservan los resultados de la validación anterior del mismo código funcional y dependencias, que no cambiaron en este refuerzo. Las actualizaciones nuevas se limitan a scripts de QA y el informe.

La revisión previa a publicación debe cotejar los 10 archivos existentes del diff con el snapshot probado, comprobar `git diff --check`, URLs de locks, censura del informe, ausencia de archivos nuevos/staged y el escaneo Gitleaks clasificado. No se dará PASS a un caso externo que no se haya ejecutado. La historia Git no cambió y conserva los bloqueadores señalados arriba.

Los campos siguientes describen el estado del árbol examinado. `CURRENT_TREE_SECRET_FINDINGS` enumera credenciales operativas confirmadas; no equivale al recuento de coincidencias heurísticas ni certifica el historial o las coincidencias G1 heredadas.

```text
CURRENT_TREE_SECRET_FINDINGS=[]
QA_CASES_PASS_LOCAL=[CORE_BACKEND_TESTS,GLOBAL_SCHEMA_TOOLS,REPOSITORY_HYGIENE,FRONTEND_RUNTIME_STATIC,FRONTEND_MODEL,DTE_PROTOTYPE,FRONTEND_NGINX_LOCAL,SECURITY_REDACTED_SCAN,PRIVATE_ENV_FAIL_CLOSED]
QA_CASES_PASS_CONTRACT=[AUTH_ROLES_LOCAL,MULTI_COMPANY_LOCAL,CUSTOMERS_LOCAL,PROSPECTS_LOCAL,CONTRACTS_LOCAL,SERVICES_LOCAL,BILLING_LOCAL,G1_LOCAL,G2_LOCAL,G3_LOCAL,DTE_LOCAL,META_LOCAL,SMTP_LOCAL]
QA_CASES_PENDING_BENJAMIN=[G1_REAL,G2_REAL,G3_REAL,FINET_DTE,CABLE_MAGICO_DTE,META_REAL,SMTP_REAL,DEPLOY_HEALTH,SCHEMA_RELEASE,SECURITY_RELEASE]
QA_CASES_BLOCKED_EXTERNAL=[DB_CONCURRENCY,CORE_UI]
QA_CASES_FAIL=[]
KNOWN_HISTORY_SECRET_REVIEW_PENDING=true
DATABASE_USED=false
RAILWAY_USED=false
EXTERNAL_PROVIDER_CALLS=0
```

No se utilizaron credenciales compartidas anteriormente para acceder a proveedores. El usuario confirmó que Benjamín ya prueba un ambiente todavía incompleto. Falta identificar su URL, las integraciones operativas, la configuración privada y la coordinación del responsable para verificar casos externos de este candidato. La consolidación definitiva permanece pendiente; este archivo contiene únicamente resultados actuales e inventario provisional.

Resultado del cotejo final: `PRE_COMMIT_AUDIT=PASS_LOCAL`. Diez archivos existentes modificados, cero nuevos o staged; `git diff --check` aprobado; archivos de ejecución y locks idénticos al snapshot probado. Huella de esos ocho archivos de ejecución/configuración: `212b785d8867941070541eb73f4a1f3fa86baff7c3c14636f296a43fd1368d2e`.

El informe saneado se regeneró para actualizar posiciones de código: conserva 66 coincidencias, todas censuradas. Gitleaks del árbol revisado mantuvo únicamente el falso positivo conocido de la FK SQL. No se crearon env privados en este checkout. Este PASS corresponde a la revisión local del diff; `SECURITY_RELEASE_LOCAL_READY=false` y `RELEASE_READY=false` conservan los bloqueos históricos y externos.
