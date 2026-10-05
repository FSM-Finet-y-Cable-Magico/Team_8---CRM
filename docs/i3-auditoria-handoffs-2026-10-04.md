# Revisión de la rama frente a los handoffs del Incremento 3

Fecha: 2026-10-04. Rama: `feat/i3-facturacion-cl`. HEAD revisado: `4b128ffc80dd4fb38292cc8d0df246317f72885f`.

**Resultado: avance sustancial en P1 y P3, base técnica disponible en P4, P2 pendiente y cierre integral P5/P6 pendiente. No se acredita el Definition of Done global.**

## Alcance y método

Se leyeron los ocho documentos proporcionados desde el Escritorio: README, plan maestro y handoffs 01–06. Se contrastaron con código, migraciones, configuración, pruebas, historial Git y evidencias del repositorio. Las instrucciones de ejecución que contienen los handoffs se trataron como requisitos de comparación; esta revisión no ejecuta los workstreams, despliegues, emisiones ni cambios de base de datos.

Se distinguen tres niveles: implementación observada en el código actual; evidencia histórica guardada en el repositorio; comprobaciones ejecutadas en esta revisión. No se consultó el estado vivo de Railway, las cuentas externas ni el remoto Git mediante fetch. La presencia local de una variable no prueba vigencia o habilitación de una cuenta.

Al iniciar, el árbol estaba limpio. La rama contiene la base local `feature/incremento3` hasta `1af19cc` y seis commits adicionales, contando el merge. Coincide con la referencia local `origin/feat/i3-facturacion-cl`; esto no garantiza que el servidor remoto no haya cambiado. El diff respecto de la base abarca 75 archivos. No es una rama que contenga exclusivamente el adaptador fiscal: incluye SMTP, Docker de QA y cambios de interfaz.

## Estado por documento

| Documento | Estado observado | Condición pendiente principal |
|---|---|---|
| README del paquete | Referencia organizativa | No contiene desarrollo adicional; remite al plan y a los seis handoffs. |
| 00 Plan maestro | Integración parcial | Actualizar inventario del release, incorporar propuestas de schema y cerrar evidencias reales. |
| 01 Facturacion.cl | Implementado para sandbox, con evidencia histórica de boleta Cable Mágico | FiNet, factura en proveedor, operación productiva y recuperación de datos incompletos. |
| 02 Meta/WhatsApp | No implementado como proveedor externo | Adapter, persistencia técnica, webhook, multiempresa, pruebas y configuración Meta. |
| 03 SMTP | Envío y recuperación técnica implementados; probado históricamente en local | SMTP externo, recuperación del destinatario y separación mediante un puerto de entrega. |
| 04 Frontend/Railway | Runtime productivo preparado; uso local documentado | Probar la imagen Nginx, dominio/CORS, recorrido de UI y aislamiento de variables. |
| 05 QA E2E | Pruebas y scripts parciales disponibles | Matriz unificada y ejecución del release completo sobre el SHA definitivo. |
| 06 Prerrequisitos | Sin cierre operativo verificable | Responsables, cuentas, credenciales, dominio y ventanas de pruebas por empresa. |

## P1 — Facturacion.cl y DTE

### Qué está implementado

- `TaxDocumentIssuanceModule` registra `FacturacionClIssuer` detrás de `TAX_DOCUMENT_ISSUER`. `PendingFacturacionClIssuer` sigue en el árbol, pero ya no es el provider registrado.
- Cliente de autenticación, caché de token por empresa y renovación preventiva por tiempo; constructor de boleta TXT y factura XML; dispatcher restringido a sandbox; cliente de enlaces y PDF.
- Persistencia separada: `TaxPaymentJob` conserva el trabajo y los bytes del documento; `TaxEmissionIntent` conserva identidad, fingerprint, estado, intentos y folio. CU-86 continúa independiente.
- Estados `PENDIENTE`, `EN_PROCESO`, `GENERADO`, `FALLIDO` y `RESULTADO_INDETERMINADO`; claim persistido, marcador de envío y restricciones únicas para contener duplicados.
- Un resultado incierto no se reemite automáticamente. Hay conciliación manual por administrador con auditoría y verificación de artefacto.
- Billing escribe el trabajo local dentro de su transacción y llama al emisor después del commit. G2 registra el pago a través de Billing, por lo que utiliza ese mismo punto de integración. Un fallo posterior de HTTP/SMTP no revierte el pago. Un fallo de persistencia local anterior al commit sí puede abortar la transacción.
- Descarga PDF restringida por host/ruta, HTTPS, tamaño, firma PDF y rechazo de redirecciones. El correo conserva estado separado del DTE.
- La pantalla de pago permite consultar estado/folio, abrir el documento y recuperar ciertos fallos.

La política actual es `PER_PAYMENT_V1`: un documento por pago, incluidos abonos. Los documentos posteriores de la rama la describen como una decisión previamente aprobada. Debe preservarse como decisión explícita al integrar, sin confundir el cobro original con cada pago.

Fuentes de código: [módulo](../backend/src/tax-document-issuance/tax-document-issuance.module.ts), [emisor](../backend/src/tax-document-issuance/facturacion-cl.issuer.ts), [ciclo de intención](../backend/src/tax-document-issuance/tax-emission-intent.service.ts), [persistencia](../backend/src/tax-document-issuance/prisma-tax-intent.store.ts), [Billing](../backend/src/billing/billing.service.ts).

### Qué está probado y qué no

El [checkpoint del 3 de octubre](i3-facturacion-cl-checkpoint.md) y sus [evidencias](evidencias/facturacion-cl/2026-10-03/README.md) registran una boleta tipo 39 de Cable Mágico, folio `9234371045`, desde un abono de QA de 100 pesos: PDF recuperado, saldo parcial conservado y correo recibido en Mailpit. Registran además rechazo del pago duplicado y recuperación sin nueva emisión. Es evidencia histórica guardada, no una emisión repetida en esta revisión.

No hay acreditación equivalente para FiNet, factura 33/34 o producción. Los tests de constructores/HTTP ficticio no reemplazan esas pruebas. El código limita montos/redondeos y otros casos fiscales; los datos insuficientes quedan en `DATOS_REQUERIDOS`.

### Qué falta y cómo completarlo

1. **Recuperación de datos fiscales.** `processPayment()` retorna inmediatamente para `DATOS_REQUERIDOS`; `/retry` solo acepta una intención `FALLIDO/CONFIRMED_NOT_SENT`. Corregir el cliente o perfil no vuelve a preparar ese trabajo. Hace falta una operación autorizada y auditada que valide la ausencia de envío, reconstruya el documento y actualice su identidad de forma coherente. Nunca debe regenerar una intención ya enviada o incierta. Cubrir esta transición con pruebas de concurrencia y duplicados.
2. **Configuración y ensayo por empresa/tipo.** Completar perfil y credenciales de pruebas FiNet, ensayar factura con datos y folios autorizados y confirmar con el responsable fiscal la política de documentos por abono, domicilio, giro y redondeo. La revisión no certifica su tratamiento tributario.
3. **Producción requiere trabajo adicional.** El servicio rechaza empresas habilitadas en `production`, el dispatcher/lector solo aceptan sandbox y `tax_payment_job` restringe `ambiente='sandbox'`. El validador productivo también rechaza el flag habilitado. No basta con reemplazar una contraseña: se necesita un cambio revisado de configuración, código, schema y validaciones, seguido de pruebas acordadas.
4. **Readiness integral.** `getReadiness()` impide emitir si faltan perfil, tablas o credenciales, pero `/api/ready` no publica el estado fiscal. Integrar una señal de capacidad por empresa, sin exponer secretos ni convertir una integración deshabilitada en caída del CRM.
5. **Token rechazado antes del vencimiento esperado.** `authorizedRequest()` no invalida la caché ante 401; `version()` sí lo hace. Completar el manejo para futuras operaciones/lecturas, conservando la prohibición de repetir automáticamente una emisión de resultado incierto.

El contrato REST fue consultado en esta revisión: autentica con `POST /login`, usa token en `Authorization` y documenta **`GET /wsds/procesar` como operación que genera DTE**. La referencia genérica a “POST externo” del handoff no debe interpretarse como obligación de cambiar ese verbo ni como permiso de ejecutar ese GET en un smoke de lectura. [Manual oficial de Facturacion.cl](https://www.facturacion.cl/manualintegracion/apirestintegracion.php).

## P2 — Meta/WhatsApp Business

### Qué existe

El flujo de notificación de `BillingService` valida, crea `log_notificacion`, evento comercial y auditoría. Su estado sigue siendo `Simulado` o `Desactivado`. `backend/.env.example` contiene placeholders comentados de WhatsApp. Existen referencias al canal WhatsApp y tablas relacionadas en el contrato global; ninguna acredita un adapter de envío.

No se encontró `MetaWhatsAppProvider`, puerto de mensajería saliente, módulo registrado de Meta, webhook de validación/status ni pruebas específicas de esos componentes. **Este pendiente es de desarrollo y configuración externa, no solamente de credenciales.**

Fuentes: [Billing](../backend/src/billing/billing.service.ts), [AppModule](../backend/src/app.module.ts), [schema Prisma](../backend/prisma/schema.prisma).

### Cómo desarrollarlo

1. Crear un puerto de dominio para mensajes con `idEmpresa`, `idCliente`, teléfono, template, idioma, variables y correlación; implementar proveedores disabled/mock/meta fuera de Billing.
2. Persistir una intención antes del HTTP; enviar después del commit y actualizar su estado técnico sin perder el evento comercial.
3. Extender mínimamente `LogNotificacion`: actualmente no tiene `provider_message_id`, error técnico ni correlación. Justificar también cómo se preservará el alcance por empresa y la deduplicación. La migración debe ser independiente.
4. Configurar cuentas/números/templates por empresa, validar teléfono E.164 y rechazar asociaciones de empresa incorrectas.
5. Implementar verificación y recepción del webhook, autenticidad, deduplicación y transiciones de enviado/entregado/leído/fallido. Confirmar el contrato vigente en documentación oficial Meta antes de codificar. La página de Meta consultada en esta revisión no fue accesible, por lo que no se fijan aquí versiones Graph ni detalles nuevos de firma.
6. Cubrir los casos del handoff, incluyendo 400/401/429/5xx, timeout y webhook repetido. Después ejecutar el ensayo externo con la cuenta y los destinatarios de pruebas acordados.

## P3 — SMTP y entrega documental

### Qué está implementado

- `MailModule`, `MailService`, Nodemailer `10.0.14` y tipos de desarrollo asociados.
- Cotizaciones y DTE con PDF en memoria, validación de destinatario/adjunto, bloqueo de acceso a archivos/URLs desde Nodemailer y mensajes de error saneados.
- TLS/STARTTLS, validación de certificado/nombre, rechazo de `SMTP_REJECT_UNAUTHORIZED=false`; excepción sin cifrado acotada a QA local explícito.
- Preflight de conexión/autenticación; aceptación SMTP distinguida de entrega final a la casilla.
- Para DTE: estado persistido, claim, Message-ID estable, hasta tres intentos automáticos ante fallos temporales confirmados como no aceptados y conciliación manual de resultados inciertos.
- Recuperación de correo sin reemitir DTE; `/reconcile-email` exige administrador y deja auditoría.

El [informe SMTP](i3-smtp-automatic-email.md) registra ensayos con sockets TLS/STARTTLS, PostgreSQL y Mailpit, reinicio y concurrencia. En el ensayo específico SMTP se usó un documento fiscal simulado; la recepción Mailpit fue real y local. No acredita recepción externa.

### Qué falta y cómo completarlo

1. Configurar cuenta/remitente externos y compilar el backend; ejecutar primero `smtp:check` sin argumentos y después un correo controlado acordado. Verificar tanto aceptación como recepción efectiva. El script envía un mensaje únicamente con `--send-test-to <destinatario>`; omitir ese argumento durante la comprobación sin envío. La configuración debe estar cargada en el entorno del proceso.
2. Resolver `SIN_DESTINATARIO`: el trabajo guarda una copia del email al registrar el pago; la entrega sigue leyendo `job.email`. Cambiar el email del Cliente no corrige el trabajo existente. Agregar una acción de corrección validada/auditada que habilite solo una entrega segura del documento ya generado.
3. Cumplir la frontera P1/P3 del handoff. Hoy `FacturacionClIssuer` inyecta directamente `MailService`; se separó el módulo SMTP, pero falta el puerto de entrega solicitado. Extraer esa interfaz y mantener la orquestación/idempotencia en un componente definido.
4. Si se exige el contrato completo de proveedores, formalizar disabled/mock/smtp. Actualmente la ausencia de host devuelve `not_configured`; los tests sustituyen el transporte, pero no existe un provider mock configurable equivalente al handoff.
5. Completar la operación de conciliación para usuarios: los endpoints existen, pero `PaymentTaxDocument` ofrece consulta/retry/artifacts y mensajes de revisión, sin formulario de conciliación. Se puede cerrar con UI o con un procedimiento administrativo reproducible.

Fuentes: [MailService](../backend/src/mail/mail.service.ts), [configuración SMTP](../backend/src/mail/smtp.config.ts), [emisor y recuperación](../backend/src/tax-document-issuance/facturacion-cl.issuer.ts), [panel del documento](../frontend/src/features/billing/PaymentTaxDocument.tsx).

## P4 — Frontend y Railway

### Qué está implementado

`frontend/Dockerfile` tiene stages dev/build/prod y runtime Nginx; la plantilla usa `PORT`, ofrece `/health`, fallback SPA, caché de assets y 404 para assets inexistentes. `.dockerignore` excluye entornos y dependencias. La base de API usa `VITE_API_URL`; hay tratamiento de sesión expirada por 401 y helper de errores de API.

El HEAD `4b128ff` agregó carga independiente de prospectos, timeout, descarte de respuestas antiguas y estados de carga/error/reintento. Esa mejora es posterior a varias evidencias guardadas; no debe darse por validada por los conteos anteriores.

### Qué falta y cómo completarlo

- Construir y levantar el **stage prod** y verificar HTTP real en `/health`, `/`, una ruta interna, un asset existente y otro inexistente. Los tres tests Node actuales inspeccionan archivos; no arrancan Nginx. El compose fiscal usa Vite dev, por lo que su captura local tampoco acredita este runtime productivo.
- Confirmar dominio frontend y origen HTTPS exacto para CORS. Para servicios separados, compilar con URL absoluta del backend: el Nginx actual no hace proxy `/api`. Omitir esa configuración deja `/api` apuntando al propio frontend.
- Revisar `docker-compose.railway.yml`: usa `target: dev`, `start:dev`/Vite y conexión mediante `.env.railway`. Es un entorno de desarrollo conectado a esa configuración, no la receta del frontend Nginx productivo.
- El servicio frontend de ese compose recibe el mismo `env_file` que backend, que incluye configuración de base de datos. Retirar el env_file compartido del frontend y pasar solo variables públicas/necesarias. Esto prueba exposición al entorno del contenedor frontend, **no demuestra que los secretos estén dentro del bundle**.
- Validar login, roles, cambio de empresa, prospectos, planes/contratos, Billing, tickets, errores 403/5xx y navegación. El checkpoint registró un selector de planes vacío; el último commit corrige carga de prospectos, no documenta cierre de ese selector. Reproducirlo antes de decidir si requiere fix.
- Alinear la rama de despliegue: el plan usa `feature/incremento3`, mientras la guía Railway dice `develop`. El responsable de integración debe fijar una sola rama y SHA candidato.

Fuentes: [Dockerfile](../frontend/Dockerfile), [Nginx](../frontend/nginx.conf.template), [compose Railway](../docker-compose.railway.yml), [guía de despliegue](i3-railway-frontend-deployment.md).

## P5 — QA, G1/G2/G3 y aceptación

Hay 71 archivos `*.spec.ts` en backend, además de pruebas Node, scripts de smoke y evidencias por área. El número de archivos no equivale a suites ejecutadas ni a casos aprobados. Los conteos de 57 suites/497 tests del plan son históricos.

G1 conserva código y evidencia histórica de integración. G2 contiene consulta de facturas/detalle, pago idempotente, comprobante y resultado WiFi con alcance por empresa. G3 contiene instalación, retry de correlación estable, consulta/reconciliación, cierre y autenticación entre grupos. La rama fiscal no modifica G1/G3 respecto de la base local comparada.

La evidencia reciente de G3 registra **seguimiento local fallido por falta de configuración, sin OT externa**. Un HTTP 201 del CRM no acredita recepción en G3. El estado vivo de G2/G3/Railway no se verificó durante esta revisión.

El comprobante de pago de G2 y el documento tributario son entidades distintas en el código y la documentación. `paymentReceipt()` lee `Pago.comprobanteEstado/PdfUrl`; el DTE guarda sus artefactos en `TaxEmissionIntent`. No asumir que emitir el DTE cambia automáticamente el comprobante G2. Si el portal debe exponer el DTE, acordar su contrato y probarlo expresamente.

Falta una matriz única con `CASE_ID`, entorno, precondición, request saneado, esperado, resultado, estado y evidencia; no se encontró un cierre que cubra todos los casos de P5. Preparar esa matriz con UNIT, INTEGRATION_LOCAL, CONTRACT, DRY_RUN, SANDBOX y post-deploy separados. Incluir casos bloqueados, sin contarlos como aprobados ni como bugs demostrados.

La matriz final debe cubrir core/roles/multiempresa, G1 lectura, G2 completo, G3 completo, Facturacion.cl, Meta, SMTP y frontend. Ejecutarla sobre el mismo SHA, schema y configuración candidatos. Conservar los controles de autorización de los smokes existentes; un dry-run no es un E2E real.

Fuentes: [smoke intergrupos](../scripts/smoke-i3-intergroups.ps1), [cierre contractual](i3-intergroup-g2-g3-closure.md), [G2](../backend/src/g2-integration/g2-integration.service.ts), [checkpoint G3](i3-facturacion-cl-checkpoint.md).

## P6 — Prerrequisitos y entorno disponible

La lectura de configuración local se limitó a informar nombres y presencia/ausencia, sin publicar valores ni utilizarlos para conectarse.

| Requisito | Observación local actual | Qué debe confirmarse |
|---|---|---|
| Sandbox fiscal Cable Mágico | Evidencia histórica positiva; credencial no presente en los .env revisados | Recuperar desde canal seguro la configuración de pruebas. |
| Sandbox FiNet y producción fiscal | Sin evidencia de validación propia; credenciales no presentes en los .env revisados | Cuenta, servicio habilitado, tipos DTE, perfil y responsable por empresa. |
| Meta | Sin variables de cuenta/token en los .env revisados | Business/App/WABA/número/token/secret/templates y empresa asociada. |
| SMTP | HOST/USER/PASSWORD/FROM vacíos en `.env` y `.env.railway` | Proveedor, remitente, TLS, autenticación y prueba externa. |
| Frontend público | Guías preparadas; dominio final no acreditado | Dominio HTTPS y CORS en configuración desplegada. |
| G2 | `G8_INTEGRATION_API_KEYS` vacío en los .env revisados | Principal/hash/scopes correctos y entrega privada de la key. |
| G3 | URL/key ausentes o vacíos en los .env revisados | Ambiente QA, key, empresa, candidato y ventana coordinada. |

`.env.facturacion-local` y `backend/.env` no existen en este checkout. Docker no está disponible como comando en esta sesión. Por tanto, las frases “en esta PC ya está aplicado/configurado” de informes previos describen el entorno de aquella ejecución; no deben usarse para asumir el estado actual. No se inspeccionaron gestores de secretos ni variables del servicio Railway: ausencia local no significa inexistencia en esos lugares.

Completar el checklist 06 con responsable, estado por empresa, canal seguro y fecha de última verificación, sin valores secretos. No marcar READY solo por tener placeholders o una captura antigua.

## Schema, seguridad y coordinación del plan maestro

Existen tres migraciones nuevas independientes:

1. `20261003010000_i3_tax_emission_intents`.
2. `20261003020000_i3_tax_payment_pipeline`.
3. `20261004010000_i3_tax_smtp_delivery`.

Prisma incluye los modelos nuevos; `db/global/init-global.sql` y `global-columns.generated.ts` todavía no incluyen las tablas fiscales. Esto respeta la entrega como propuesta aislada, pero deja trabajo para el responsable central: revisar/incorporar el schema, regenerar su contrato de verificación y comprobar el historial de migraciones real. El checklist viejo que exige “solo una migración G2 pendiente” debe actualizarse para el candidato combinado. No aplicar `migrate deploy` sin revisar todas las pendientes ni sobre una base inicializada por SQL global sin reconciliar su historial.

`/api/ready` comprueba columnas del contrato global y conectividad, no todas las constraints ni todos los proveedores. Además puede responder HTTP 200 con `global_schema=DEGRADED`; un smoke debe validar el cuerpo, no solo el código HTTP.

La auditoría estática G2 pasa. Su hash local cambia por CRLF: `2ad14099…`; al normalizar a LF coincide con `c158405a…`, documentado en el paquete anterior. No se encontró con ello un cambio semántico de la migración. Fijar representación y checksum del artefacto de release para evitar confusiones de plataforma.

Los dos dumps `output/backups/before-crm-final.dump` y `output/backups/crm-before-develop-20260911.dump` siguen versionados. El informe previo los clasifica como dumps con datos, sin anonimización acreditada. Su revisión/remediación sigue siendo parte del criterio de publicación final. No se extrajeron ni alteraron aquí. Los `.env` privados consultados no están trackeados; eso no certifica limpieza completa del árbol, capturas o historial. La clave TLS de `backend/src/mail/fixtures` está documentada como fixture pública de loopback, no como credencial de operación.

Los informes RC antiguos que dicen “Facturacion.cl sin HTTP/emisión” quedaron superados por el checkpoint sandbox. Conservarlos como historial y generar un resumen actualizado del candidato, evitando mezclar pruebas antiguas con las capacidades del HEAD actual.

## Validaciones de esta revisión

| Comprobación | Resultado actual |
|---|---|
| Rama/HEAD/diff/historial local | Verificados; árbol limpio al inicio. |
| `npm.cmd run test:frontend-runtime` | PASS: 3/3; inspección estática de archivos, sin contenedor. |
| Pruebas Node del prototipo y sonda fiscal | PASS: 19/19; transporte ficticio, sin emisión externa. |
| `npm.cmd run test:global-tools` | 13 casos PASS y una suite que no carga por falta de `@prisma/client`. No es un PASS global ni un fallo funcional demostrado. |
| `node scripts/audit-i3-g2-migration.mjs` | PASS estático; no conecta ni aplica SQL. |
| Jest backend | No pudo arrancar: `jest` ausente. |
| Build backend/frontend | No pudieron arrancar: `nest` y `tsc` ausentes. |
| Lint backend/frontend | No pudo arrancar: `eslint` ausente. |
| Prisma validate/generate | No ejecutado; no están instaladas las dependencias backend. |
| `git diff --check` | PASS antes del informe. |
| Docker/Nginx/PostgreSQL/SMTP en vivo | No ejecutados en esta revisión. |
| Emisión fiscal, mensajes Meta, correo externo, Railway | Sin llamadas de negocio ni cambios en esta revisión. |

Las pruebas de 264 casos fiscales y 191/201 casos SMTP/regresión son evidencia histórica documentada, no se suman como una nueva suite completa: pueden solaparse y no cubren necesariamente el último commit frontend.

Para repetir la validación completa, preparar dependencias desde el lockfile con `npm ci`, generar el cliente Prisma y ejecutar test/build/lint/validate. Para integraciones de base de datos usar únicamente una base QA explícita y las instrucciones de [Docker fiscal local](facturacion-cl-local-docker.md); revisar primero su estado real, porque las tres migraciones SQL no son una receta para repetir sin control. Registrar comandos, SHA, entorno, resultados y omisiones.

## Orden de trabajo recomendado

1. **Reproducibilidad y responsables.** Recuperar configuración QA por canal seguro, preparar dependencias/Docker y completar la tabla P6. Fijar rama/SHA candidato y responsables P1–P6.
2. **Meta y casos pendientes.** Implementar P2; completar recuperación de datos fiscales/email, puerto SMTP y operación de conciliación. Separar cambios por alcance para revisión.
3. **Integración del schema.** Revisar las tres propuestas fiscales junto al estado real G2/Prisma; actualizar canónico y contrato de readiness desde el carril central.
4. **Validación local completa.** Ejecutar backend/frontend, pruebas PostgreSQL locales, Nginx prod y recorrido UI. Cerrar el selector de planes si se reproduce.
5. **Pruebas externas controladas.** Sandbox por empresa y tipo DTE, SMTP a casilla real, Meta y G2/G3 coordinados. Adjuntar evidencia con entorno inequívoco.
6. **Candidato final.** Resolver dumps/secretos, actualizar manifiesto/checklists, ejecutar matriz P5 y publicar resultados por área. El despliegue y la habilitación productiva pertenecen a una etapa posterior coordinada.

La conclusión útil para continuar es: **P1/P3 ya tienen una base reutilizable; P2 requiere desarrollo; P4 requiere validación/configuración; P5/P6 deben cerrar la entrega con evidencia del ambiente real.** Esta revisión agregó únicamente este informe y no modificó la implementación.
