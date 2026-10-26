# Incremento 4 — P0-06: estabilización del Release Candidate

Fecha: 26-10-2026. Estado: **RC_CONDITIONAL**.
Rama: `fix/i4-p0-06-estabilizacion-final`.
Base: `7658607d1b208b96748999f7ea17f866a28e91fc`, merge PR #61.

## 1. Estado real y decisión

Los tres fallos históricos se reprodujeron y corrigieron. La suite SMTP vuelve a
ejecutarse conservando TLS. La regresión backend completa terminó con **1.247
pruebas aprobadas, cero fallidas y ocho omitidas**. Frontend, builds, lint,
herramientas globales, runtime frontend y aceptación local también aprobaron.

El código es candidato a revisión y demostración local controlada. **No está
certificado el E2E actual con proveedores, la VPS ni el despliegue productivo.**
Reparación y retiro técnico G3 continúan incompletos por falta de contrato ratificado.
No se convierten estas dependencias en funcionalidades simuladas presentadas como reales.

Se hizo fetch de `origin/develop`, fast-forward de `develop` y creación de la rama.
No se creó un commit de merge ni se publicó nada. El árbol versionado estaba limpio;
`-f`, `output/` y respaldos ajenos se conservaron. Stage vacío.

## 2. Correcciones mínimas

| Archivo | Causa comprobada y corrección |
| --- | --- |
| `backend/src/billing/billing.service.spec.ts` | Dos pruebas asumían que 10-10-2026 seguía en el futuro. La lógica legítima avanzaba al flujo vencido y los mocks incompletos producían TypeError. Ahora se controla el reloj y se fija una prórroga nueve días posterior; ambos escenarios se ejecutan en 2026 y 2035. Se restaura el reloj y se verifica ausencia de cambios a contrato, cliente y servicio al rechazar suspensión. |
| `backend/src/external-tax-documents/external-tax-documents.boundaries.spec.ts` | La prueba esperaba «Registrar metadata». Se alinea con «Registrar documento externo», texto vigente correcto. Se mantienen las verificaciones que prohíben emisión/SII desde CU-86. No se cambia el frontend. |
| `backend/src/mail/mail.service.spec.ts` | OpenSSL heredaba una configuración inexistente en `C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf`. El fixture pasa `-config` con un archivo mínimo temporal propio. Una regresión fuerza una configuración heredada inexistente y comprueba creación del contexto TLS. |
| `scripts/i3-release-acceptance.mjs` | El destino fijo de 04-10-2026 sobrescribía evidencia histórica al repetir la aceptación. Se agrega `--output-dir`, que separa informe y temporales; se conserva el destino anterior si no se proporciona. Se ejecutó realmente con destino temporal nuevo. |
| Este documento | Matriz, resultados, límites y criterios de entrega. |

No se modificó lógica productiva, textos de interfaz, endpoints, payloads,
idempotencia, políticas financieras, schema, migraciones, `.env` ni datos históricos.
No se deshabilitó TLS: siguen aprobando rechazo de CA no confiable, hostname
incorrecto, ausencia de STARTTLS y envío de credenciales solo después del cifrado.
El fixture existente genera material TLS sintético efímero y lo elimina; no se
crearon credenciales operativas ni se versionaron claves privadas/certificados.

## 3. Validaciones ejecutadas

Entorno: Windows, Node v22.19.0; dependencias instaladas del checkout. Las pruebas
optativas de DB estuvieron deshabilitadas. No se consultó ninguna DB en P0-06.

| Comprobación | Resultado real |
| --- | --- |
| Reproducción previa: Billing, CU-86, SMTP | 60 PASS, 3 FAIL; SMTP no iniciaba por OpenSSL |
| Dirigidas después de corregir | 92 PASS; 3 suites |
| Backend completo | **1.247 PASS, 0 FAIL, 8 SKIP; 80 suites PASS, 5 SKIP de 85** |
| SMTP incluido en backend | **27 PASS**, sockets loopback, sin correo real |
| Frontend | **44/44 PASS** |
| Build backend | PASS |
| Build frontend | PASS con `VITE_API_URL=/api`; aviso de chunk principal 634,48 kB |
| Lint backend | PASS, sin errores |
| Lint frontend | 0 errores, **78 advertencias preexistentes** |
| `test:global-tools` | **26/26 PASS** |
| `test:frontend-runtime` | **3/3 PASS**, comprobación estática del runtime |
| `test:i3-release -- --output-dir <temporal>` | Exit 0: **16 PASS, 0 FAIL, 13 BLOCKED**, `RELEASE_READY=false` |
| Backend dentro del runner de aceptación | Repetición: 1.247 PASS, 0 FAIL, 8 SKIP |
| Prototipo DTE dentro del runner | PASS, sin proveedor real |
| `git fsck --connectivity-only --no-reflogs` | Exit 0; 20 objetos dangling informativos, sin errores de conectividad |
| `git diff --check` | PASS |

Las ocho omisiones pertenecen a cinco suites optativas: CRM, commercial, coverage,
external-tax-documents PostgreSQL y local-db-bootstrap. No se presentan como PASS.
No se habilitaron contra `.env` ni una base existente para aumentar el conteo.

El primer build frontend falló por acceso denegado de esbuild a directorios padre
dentro del sandbox. Se repitió fuera del sandbox y aprobó, sin cambio de código.
Esto es distinto del defecto corregido del fixture OpenSSL, reproducible también
mediante `openssl req -in NUL -noout` con aquella configuración heredada.

Evidencia completa de esta ejecución, fuera del repositorio:
`C:\Users\Manguera\AppData\Local\Temp\finet-p006-db52d446-b4a2-4047-bb38-b8f271bcc3cd`.
Contiene `backend.json`, logs de tests/build/lint y
`release/local-acceptance.json`. Es temporal y no debe añadirse a Git.

El runner registra SHA-256 de sus salidas:

| Check | SHA-256 |
| --- | --- |
| BACKEND_UNIT | `6c9df329a610f51147541c192814a5eaa7f3452a79521dfb233b29dabd2dfac3` |
| GLOBAL_TOOLS | `3e3eef5b2211d2257d83f6fb1fecce5053dd42f6c0a1ce91591099fb1758f693` |
| FRONTEND_CONFIG | `fbec1d736b99890a6043fe9a7fac7872515e5b486df36a0c661711aed24bd448` |
| DTE_PROTOTYPE | `997d43426332dd8458b3904716a2cea5a17fa89881d491e47268c82904bc9629` |

## 4. Matriz de aceptación

Fuentes: [CU del primer incremento](casos-uso-primer-incremento.md),
[matriz de responsabilidades](matriz-responsabilidades-incremento-2.md), código y
pruebas actuales, informes P0-02/03/04/05 y evidencia PostgreSQL P0-05.
No se inventan nuevos números de CU ni se declara cerrada la línea base completa
de 86 RF/CU a partir de una selección de pruebas.

`PASS` se limita al requisito explícito de la fila y su entorno. `PARTIAL` indica
capacidad implementada parcialmente o evidencia integral incompleta;
`BLOCKED_EXTERNAL` exige acción de otro responsable; `NOT_TESTED` no se ejecutó.
No se identificó un FAIL local restante en las verificaciones realizadas.

| Requisito / trazabilidad | Estado | Implementación y evidencia | Pendiente para aceptación integral |
| --- | --- | --- | --- |
| Autenticación completa y navegación por roles, CU43/44 | PARTIAL | Guards JWT/roles y usuarios: 4/14/9 pruebas PASS. Control de acceso HTTP en suites auxiliares. | Login real + sesión + navegación en navegador con cuentas QA y DB aislada; estas pruebas no demuestran toda la UI. |
| Aislamiento y vista consolidada, CU45 | PASS | Proyecciones 25 unitarias + 33 HTTP, clientes 18, empresas 5; permisos de administradores y cliente compartido. | PASS local de filtros/proyecciones; evidencia UI de ambos roles antes de demo. |
| Alta/pipeline/pérdida de prospectos, CU01/02/04/10/15/67 | PASS | Prospectos 43, lifecycle 18 y validación RUT 5; transiciones protegidas, sin activación manual. | Recorrido visual pendiente; no certifica reparación automática de históricos. |
| Cobertura comercial y ubicación, CU06/70 | PARTIAL | Providers comerciales, geometría, dominio, DTO y geocoding con pruebas locales PASS. | Verificación de configuración/capa real autorizada. Nominatim localiza direcciones; no acredita cobertura comercial ni NAP disponible. |
| Cotización y contrato digital, CU03/74 | PARTIAL | Contratos/PDF: 2 + 5 PASS; PDF legible, versiones y aislamiento. | Flujo visual completo cotización→firma→descarga; entrega de correo externa no probada. |
| Catálogo comercial/cambio de plan, CU12/69/73 | PASS | Planes 19, cambio de plan 11 y procesador diferido 1 PASS. | PASS local; no confundir con provisión técnica externa. |
| Activación comercial al cierre G3, CU07 | PASS | Activación 48, processor 45 y recuperación 34 PASS; **PostgreSQL QA P0-05: 8/8**, evidencia ya integrada, no repetida aquí. | PASS de G8 local/QA; no implica emisión real del cierre desde G3. |
| Solicitud, retry y cierre instalación intergrupos, CU17/20/59/60 | PARTIAL | Adapter 21 y servicio 71 PASS; correlaciones, wrapper, company scope y aprobación. G1/G3 productivos sin diff. | Smoke coordinado actual G3→G8→G1, series QA autorizadas y evidencia saneada. |
| Clientes compartidos y servicios, CU08/14/64/65 | PARTIAL | Clientes 18, servicios 10 e históricos G3 30 PASS. Aislamiento y protección global probados. | Completar recorrido UI; datos físicos/históricos externos dependen de autoridades G1/G3. |
| Facturas, pagos, comprobantes y cobranza | PASS | Billing 54, consultas 8, balance 3, HTTP G2 compartido 17 PASS. Estados/contratos aislados; pago no borra deuda ajena. | PASS local; concurrencia financiera real de P0-03 no certificada por QA de recuperación P0-05. |
| Reactivación posterior al pago, P0-04 | PASS | Regresión Billing completa incluye evidencia G3 persistida, servicio/empresa correlacionados y rechazo sin evidencia. | PASS con mocks; smoke financiero PostgreSQL específico pendiente. |
| Consulta/pago/WiFi G2 de punta a punta | PARTIAL | Contrato G2 6, servicio 47, HTTP 19 y compartido 17 PASS. request_id de pago es trazabilidad; codigo_transaccion es identidad idempotente pactada. | Portal G2 actual, callbacks de pago y resultado WiFi/SmartOLT ratificados; no se cambia payload para suplirlos. |
| Diagnóstico, clasificación, prioridad y seguimiento de tickets, CU21/23/24/25/26 | PASS | 39 pruebas HTTP P0-02 y pruebas de componentes frontend. Auditoría atómica; no modifica estado financiero global ni cierra OT local. | PASS local del seguimiento; no representa una reparación técnica ejecutada. |
| Derivación y cierre de reparación, CU75/76 | BLOCKED_EXTERNAL | Rechazo autorizado HTTP 410 G3_INTEGRATION_REQUIRED. Autoridad G3 preservada. | G3/G8 deben ratificar contrato de reparación, correlación, estados, idempotencia y cierre. |
| Retiro técnico | BLOCKED_EXTERNAL | 8 pruebas de solicitud comercial; estado BLOQUEADO_CONTRATO_G3. | Contrato de retiro G3 y entrega física G1; no inventar endpoints. |
| Inventario y asociación física G1, CU53/54/55–58/62/63/72 | PARTIAL | HTTP 28, activación 33, consultas 5 y garantías comerciales 8 PASS. Escritura física local bloqueada; P0-05 usa G1 simulado. | Smoke físico actual de G1 con cierre real G3; G1 sigue siendo la autoridad. |
| Reportes y auditoría, CU33/46/68/71 | PASS | Reportes 5, observaciones 3, Libro Control 41 y transacciones auditadas en suites financieras/técnicas. | PASS local; muestras visuales saneadas/exportación QA para la entrega. |
| Recuperación durable intergrupo, P0-05 | PASS | Pruebas actuales PASS y evidencia PostgreSQL integrada: rollback, reinicio, conexiones independientes, auditorías, respuesta tardía, scope y ACK perdido. | Bajo demanda, sin scheduler; efecto único real depende de G1. |
| Metadata de documento externo, CU86 | PASS | Servicio 51, DTO 13 y fronteras 11 PASS; nuevo texto de UI correcto. | No representa emisión SII; conservar separación de Factura/Pago. |
| Facturación.cl | PARTIAL | Emisor, dispatcher, recovery y prototipo sandbox locales PASS. Runtime rechaza production no certificado. | Cuenta/perfil sandbox por empresa, documentos autorizados y validación fiscal del proveedor. |
| SMTP externo | BLOCKED_EXTERNAL | **Protocolo local TLS: PASS 27/27**; ya no está bloqueado por OpenSSL. | Cuenta/remitente/destinatario QA autorizados y prueba de recepción; no se envió correo real. |
| Meta/WhatsApp real | BLOCKED_EXTERNAL | Messaging 24 y webhook HTTP 1 PASS con fixtures. | App/WABA/número, templates por empresa y evidencia de entrega/estado real. |
| Smart OLT/monitoreo real | BLOCKED_EXTERNAL | Lectura aislada de monitoreo_ont; sin dato reciente informa ausencia, no inventa latencia. | G3 debe acreditar fuente técnica, medición vigente y alcance autorizado. |
| TV IP real | PARTIAL | Credencial comercial local y proyección multiempresa probadas en P0-01. | No hay prueba de provisión/autenticación contra plataforma TV IP real. |
| Frontend productivo Nginx, VPS, health y ready desplegados | NOT_TESTED | Builds y 3 tests estáticos PASS; Docker CLI sin daemon accesible en esta revisión. | Ejecutar imagen y HTTP real de health, SPA, assets/404; VPS, TLS, CORS, backup/restore y catálogo actual. |

## 5. Contraste de bloqueos históricos

| Informe/afirmación anterior | Comprobación actual y tratamiento |
| --- | --- |
| P0-05: PostgreSQL pendiente | Superado para sus ocho escenarios por PR #61 y [evidencia QA](i4-p0-05-postgresql-qa.evidence.json). No implica todos los flujos financieros ni PostgreSQL productivo. Código G1/G3 y schema sin cambios en P0-06. |
| P0-03: P0-04 pendiente / tres fallos históricos / SMTP bloqueado | P0-04 está integrado. Regresión actual valida sus casos. Tres fallos resueltos y SMTP local 27/27; política financiera global compartida sigue sin ratificación, se conserva la guarda actual. |
| RC I3: Facturación.cl no tiene implementación | Desactualizado: existe adapter sandbox y recovery con tests. Sí sigue vigente FACTURACION_CL_PRODUCTION_NOT_CERTIFIED en configuración. No se presume disponibilidad de cuentas reales. |
| Checklist G2: request_id de pago debe persistirse | El DTO actual documenta request_id como trazabilidad opcional y codigo_transaccion como idempotencia. No convertir el checklist antiguo en cambio de contrato; cualquier nueva exigencia requiere ratificación. |
| G2/WiFi: dudas de transiciones | Código actual permite abiertos/en progreso/escalados normalizados y resultados pactados; contrato y HTTP tests PASS. Quién produce APLICADO real necesita evidencia coordinada, no un cambio unilateral. |
| Plan baseline / paquete G2: migración pendiente, hashes y conteos antiguos | El canónico actual es el usado por QA P0-05, SHA-256 f42140bff257d8bcaf46d2f74d5c44fa6d304bd8f84e20085ba3bbf07bfeb2aa. No se consultó catálogo ni _prisma_migrations remotos; no se afirma que hoy falte DDL ni se recomienda ejecutar migrate deploy a ciegas. |
| Prerrequisitos: PostgreSQL local no disponible | Superado por PostgreSQL 18.6 aislado certificado. Docker sigue sin daemon accesible; no equiparar ambos bloqueos. |
| RC I3: dos dumps en árbol actual | Ya no están trackeados. `git log` confirma retiro 0a160452 e introducción 46d9a985. El historial los conserva: cierre de exposición/revocación/rotación requiere evidencia del responsable, no inferir que borrar del árbol resolvió el incidente. |
| Frontend: falta runtime real | Sigue sin prueba Nginx/Docker/VPS actual; build y tests estáticos no sustituyen ejecución HTTP. |
| G1 real aprobado en evidencia anterior | Se conserva como evidencia histórica; no se repitió ni acredita el E2E actual con cierre emitido por G3 real. |

Los 13 BLOCKED que imprime el runner I3 son tareas que ese runner no ejecuta:
DB_CONCURRENCY, FRONTEND_NGINX, CORE_UI, G1_READ, G2_E2E, G3_E2E, FINET_DTE,
CABLE_MAGICO_DTE, META_REAL, SMTP_REAL, DEPLOY_HEALTH, SCHEMA_RELEASE y
SECURITY_RELEASE. Son un límite del runner, no trece defectos de código actuales.
En particular DB_CONCURRENCY tiene evidencia parcial específica P0-05 ya integrada;
no se modifica artificialmente RELEASE_READY para ocultar los demás pendientes.

## 6. Dependencias y responsables

| Dependencia | Falta / responsable | Evidencia de cierre | Alternativa local disponible |
| --- | --- | --- | --- |
| G1 | G1 + integrador G8: disponibilidad QA, API key por canal seguro, replay y asociación tras cierre real G3 | Mismo event_id/hash, conteos de equipos/asignación, empresa correcta y duplicado sin segundo efecto | HTTP simulado + PostgreSQL P0-05 |
| G2 | G2 + G8: portal actual, flujo pago/comprobante/documento y origen del resultado WiFi | Pruebas coordinadas empresas 1/2, cliente compartido, permisos, replay, conflicto, descarga y resultado | Contrato JSON, guards y HTTP con mocks PASS |
| G3 instalaciones | G3 + G8 + G1: candidato sintético y ventana E2E autorizada | POST/retry mismos IDs, GET scoped, aprobación, cierre, activación G8 y asociación G1 | Fixtures de cierre + servicios reales en QA P0-05 |
| G3 reparación/retiro | Dueños G3/G8, con G1 para devolución física: ratificar el acuerdo | Documento versionado, estados/error/idempotencia y pruebas acordadas | Seguimiento comercial y bloqueo explícito; ningún endpoint inventado |
| Facturación.cl | Responsable fiscal de cada empresa + proveedor | Cuenta/perfil de pruebas, emisión y recuperación autorizadas; aprobación explícita antes de producción | Sandbox simulado/prototipo local |
| Meta | Responsable comunicaciones por empresa | WABA/número/templates autorizados, envío QA y webhook verificable | Messaging y webhook locales |
| SMTP | Administrador correo | Verificación TLS/auth y recepción en buzón QA autorizado | Servidor SMTP loopback, 27 pruebas |
| Smart OLT / TV IP | G3/red y administrador TV IP | Contrato/capacidad ratificada, scope y consulta/provisión QA real según autoridad | Presentación local sin inventar disponibilidad técnica |
| VPS/schema/seguridad | Administrador infraestructura/DB/repositorio | Imagen ejecutada, health/ready, HTTPS/CORS, catálogo e historial frescos autorizados, backup/restore QA y cierre documentado de secretos/dumps históricos | Build, validadores de configuración, esquema y runtime estático |

## 7. Riesgos por severidad y GO/NO-GO

- **P0 para publicar/desplegar:** falta ratificación de seguridad del historial de
  respaldos/credenciales; no se confirma vigencia de tokens ni se extraen valores.
  Infraestructura y schema reales no certificados actualmente. Mantener NO-GO
  productivo hasta evidencia del responsable.
- **P1 para afirmar completitud funcional:** CU75/76 y retiro sin contrato G3;
  E2E actual G2/G3/G1 y proveedores no ejecutados; política global financiera de
  clientes compartidos sin decisión adicional. No retirar las guardas existentes.
- **P1 de evidencia:** concurrencia financiera PostgreSQL de P0-03 y pruebas
  omitidas siguen pendientes en QA exclusivo. La certificación P0-05 no cubre
  automáticamente esas transacciones.
- **P1 operativo:** recuperación P0-05 bajo demanda. Definir operador, alarma y
  runbook; no prometer recuperación periódica automática.
- **P2:** 78 advertencias lint y chunk frontend >500 kB; deuda de rendimiento y
  mantenimiento sin fallo funcional demostrado aquí. Evitar refactor en este cierre.

**GO para revisión de este RC local:** tests/build/lint sin errores nuevos, stage
vacío, diff limitado a pruebas/harness/documentación, pruebas negativas de seguridad
intactas y clasificación explícita de pendientes. Se cumple.

**GO para demostración académica integral:** además, recorrido UI QA grabado,
datos sintéticos autorizados, etiquetas de simulación visibles y limitaciones
aceptadas por evaluación. Reparación/retiro y proveedores ausentes deben declararse;
no presentar el sistema completo. Todavía no demostrado.

**GO productivo/intergrupos:** además de lo anterior, cerrar los P0/P1 aplicables,
ratificar acuerdos faltantes, tener catálogo/historial fresco y plan de aplicación
aprobado, secretos gestionados, backup/restore probado y E2E por empresa con evidencia.
Actualmente NO-GO. Ningún resultado local autoriza una escritura remota.

## 8. Instalación y ejecución local reproducible

Requisitos: checkout de esta rama, Node compatible con `package.json`, dependencias
del lockfile y Git/OpenSSL disponibles. Para una instalación nueva, el operador
puede ejecutar `npm ci` (descarga dependencias, no proveedores); no se ejecutó aquí.
No usar `.env.railway`, `docker:railway`, db push, migrate deploy ni bootstrap sobre
bases existentes. No cambiar credenciales para que una prueba pase.

En PowerShell desde el repositorio, las validaciones sin DB son:

```powershell
$env:CRM_INTEGRATION_TESTS = '0'
$env:RUN_DB_INTEGRATION = '0'
$env:RUN_POSTGRES_INTEGRATION_TESTS = 'false'
$env:G1_INTEGRATION_ENABLED = 'false'
$env:G3_INTEGRATION_ENABLED = 'false'
$env:FACTURACION_CL_INTEGRATION_ENABLED = 'false'
$env:WHATSAPP_PROVIDER = 'disabled'
$env:VITE_API_URL = '/api'
npm.cmd --prefix backend test -- --runInBand --silent
npm.cmd --prefix frontend test
npm.cmd run build
npm.cmd run lint
npm.cmd run test:global-tools
npm.cmd run test:frontend-runtime
$qaReport = Join-Path $env:TEMP ('finet-p006-' + [guid]::NewGuid())
npm.cmd run test:i3-release -- --output-dir $qaReport
git diff --check
```

No habilitar las suites omitidas sin un clúster dedicado. Para repetir exclusivamente
la certificación PostgreSQL existente, seguir [el procedimiento P0-05](i4-p0-05-postgresql-qa.md):
build y `node scripts/p0-05-postgresql-qa.cjs <bin PostgreSQL>`. Crea/verifica/desecha
su propio clúster y usa G1 local; reemplaza su evidencia versionada, por lo que hay
que revisar ese diff por separado. **No se repitió en P0-06**, dado que no cambió
ninguna implementación productiva ni su esquema. No conectar ese harness a otra DB.

Para inspeccionar el frontend compilado sin conectarlo a un backend real:

```powershell
npm.cmd --prefix frontend run preview -- --host 127.0.0.1
```

Ese preview sirve la UI; no demuestra login ni flujos comerciales sin API/DB QA.
Para demostración integrada, infraestructura debe entregar una DB nueva exclusiva
con esquema canónico y fixtures sintéticos aprobados, en red local aislada. Arrancar
el backend compilado desde un directorio de ejecución sin `.env` productivo, con
entorno QA explícito y proveedores disabled/mock; validar host/puerto/directorio
antes de habilitar escrituras. Luego apuntar el proxy/API del frontend a ese backend
local y recorrer ambos roles/empresas. No reutilizar un volumen Docker existente:
el compose general tiene nombres/volúmenes persistentes y no acredita aislamiento.
Esta preparación UI queda NOT_TESTED, no se simula mediante una orden insegura.

## 9. Próximas acciones mínimas y entrega académica

1. Revisar estos cinco archivos y autorizar por separado commit/PR; no hay cambios
   de lógica que requieran renegociar contratos intergrupo.
2. En paralelo, infraestructura prepara VPS/imagen/HTTPS y QA exclusivo; ejecutar
   Nginx real y pruebas financieras pendientes sin acceso a clientes reales.
3. G3/G8 ratifican reparación/retiro; G1/G2/G3 coordinan un caso QA por empresa y
   cliente compartido. Registrar request/event/trace, resultado, prueba, captura
   saneada y sección del informe; nunca claves o datos personales reales.
4. Completar capturas del núcleo comercial, permisos y errores recuperables.
   Añadir evidencia real de proveedores solo cuando exista autorización.
5. Para la entrega del **15-11-2026**, presentar el núcleo local verificado y el
   informe de límites. Si falta algún acuerdo externo, registrar la excepción de
   aceptación académica; no etiquetar una simulación como integración productiva.

No se hicieron commit, push, PR, merge de publicación, deploy, operaciones Railway,
envíos reales, pagos, seeds ni migraciones. El único avance de rama fue el
fast-forward solicitado. Artefactos de ejecución quedaron fuera de Git; evidencia
histórica, `-f`, `output/` y respaldos sin modificaciones.
