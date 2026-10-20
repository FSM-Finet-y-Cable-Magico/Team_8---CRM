# Checkpoint: boleta por pago y solicitud G3

## Publicación técnica autorizada — 2026-10-20

El usuario autorizó el commit y push del avance verificado a `SecurityRealiseMatrizQA`. Alcance: código SMTP por empresa, renovación de PDF, pruebas, ejemplos vacíos, compose locales, informes y las dos propuestas SVG autorizadas. No incluye privados, credenciales, cambios de esquema/migraciones, merge a develop/main ni creación de PR. El resultado de publicación se confirma con el SHA remoto en el cierre de la tarea; los apartados anteriores de preparación documentan el trabajo antes de publicar.

Validación técnica disponible: 793 pruebas PASS, cero FAIL, ocho omitidas; build/lint backend, Prisma validate/generate y configuración de los dos compose PASS. Compatibilidad en contenedor temporal con el módulo G2 del PR #51: 259 pruebas PASS y build/lint PASS. Los controles de secretos y diff se vuelven a comprobar sobre exactamente los 19 archivos a publicar (17 modificados y dos SVG nuevos). Las propuestas de identidad continúan pendientes de aprobación y no se han subido al proveedor.

**Para terminar el encargo externo faltan estas comprobaciones concretas:**

1. Configurar el mapa y las variables SMTP por empresa en el entorno privado de ejecución. El código y los compose ya lo admiten; el privado no se completó automáticamente. Un envío con empresa sin su propio mapa/host queda NO_CONFIGURADO.
2. Verificar la API y el ambiente autorizado de cada emisor empresarial. Los dos bloques reenviados son el mismo DEMO; el portal de Cable Mágico fue accesible y muestra secciones de pruebas/producción, pero eso no certifica autenticación API productiva ni la identidad fiscal de FiNet. No introducir credenciales productivas en perfiles SANDBOX.
3. Aprobar los diseños del equipo, confirmar el procedimiento de personalización del proveedor y obtener las dos muestras PDF con su identidad correcta. La pantalla de campos adicionales no acredita un editor completo de logos/plantillas. No alterar después un PDF oficial para aparentar esa configuración.
4. Ejecutar el ensayo integrado por empresa en el ambiente acordado: pago/abono, PDF, correo recibido y repetición sin nuevo pago/DTE/correo. Incorporar coordinadamente el PR #51 y comprobar el consumo desde G2. No se afirma que esas pruebas externas ya se hicieron con dos emisores propios.

La aprobación fiscal de PER_PAYMENT_V1, DTE/folios, revisión del esquema compartido y autorización productiva siguen siendo requisitos independientes antes de operar en producción. Publicar este avance técnico no habilita emisión productiva.

## Preparación del cierre de ambas empresas — 2026-10-20

**Resultado: preparación técnica local PASS; cierre completo del encargo BLOQUEADO por verificaciones externas; producción NO_GO.** Se trabajó sobre `SecurityRealiseMatrizQA@0ad059dc53ee13ebd6ada8fed81dde9aefb20b40`, conservando las modificaciones anteriores. En la preparación inicial no se crearon archivos/carpetas en la PC, ramas ni PR; posteriormente se autorizaron únicamente los dos SVG de propuesta. Esta etapa se preparó sin stage, commit o push; el usuario autorizó después publicar el avance, como se documenta al inicio.

### Matriz del nuevo encargo

| Requisito | Resultado | Evidencia / condición de cierre |
| --- | --- | --- |
| 1. Cuentas empresariales propias | BLOQUEADO | En el privado local solo está configurada FiNet en sandbox; Cable Mágico no tiene perfil ni credenciales API cargados. La afirmación del encargo sobre cuentas reales requiere confirmar ambiente y emisor; no se autenticó con nuevas cuentas. |
| 2. Personalización oficial del PDF | BLOQUEADO | Investigación del manual oficial realizada; no se acredita un procedimiento de logo/plantilla ni un endpoint de personalización. Falta acceso/confirmación del proveedor para cada cuenta. Ver procedimiento de comprobación en el informe de integración. |
| 3. Muestra corporativa FiNet | BLOQUEADO | Faltan logo oficial autorizado, datos fiscales aprobados, configuración del proveedor y autorización del ensayo. La muestra DEMO anterior no acredita el emisor propio. |
| 4. Muestra corporativa Cable Mágico | BLOQUEADO | Mismos requisitos, independientes de FiNet. No se fabricó una boleta oficial ni se alteró un PDF emitido. |
| 5. Constructor y recuperación | PASS_LOCAL | TXT 39/41 y XML 33/34 conservados; 16 pruebas del constructor. Renovación del enlace del mismo folio sin procesar otro DTE, con ocho pruebas adicionales ya incorporadas al spec del emisor. |
| 6. Política tributaria | BLOQUEADO | PER_PAYMENT_V1 implementada, pero falta aprobación fiscal/administrativa para uso real, DTE habilitados, identidad, IVA/redondeo y folios propios. |
| 7. Correcciones técnicas | PASS_LOCAL | Dos fallos de Cobranza resueltos controlando únicamente el reloj Jest. Regresión: 793 PASS, 0 FAIL, 8 omitidas. |
| 8a. SMTP por empresa | PASS_LOCAL | Selección por idEmpresa, credenciales separadas, sin respaldo global para correos con empresa, firma por remitente y PDF separado. 42 pruebas de MailService, incluidas 16 nuevas de aislamiento. |
| 8b. Compatibilidad con G2 | PASS_LOCAL | Overlay temporal del módulo G2 del PR #51 junto a nuestros cambios: 259 pruebas PASS, build/lint PASS. Sin merge ni cambios G2 en la PC. |
| 8c. Prueba externa completa por empresa | BLOQUEADO | FiNet cuenta DEMO con PDF/correo confirmado el 15-10; Cable Mágico envío simple confirmado el 19-10. No constituyen dos emisores empresariales propios con PDF corporativo. Falta configurar el nuevo mapa SMTP en el privado, coordinar Responsable 1 y probar el portal G2. |
| 9. Git y develop | BLOQUEADO | Revisión actualizada: origin/develop e56be1f1, dos commits propios y 24 remotos no incorporados; los módulos Mail publicados coinciden. No se fusionaron ni publicaron cambios antes de revisión. |
| 10. Informe y muestras | BLOQUEADO | Matriz y resultados consolidados en documentos existentes. Faltan las dos muestras oficiales y los respaldos externos para declarar cierre. |

### Verificaciones ejecutadas

Snapshot probado a las 13:27 America/Santiago (2026-10-20T16:27:28.706Z), base 0ad059dc más cambios locales de código y ejemplos. SHA-256 del árbol versionado en ese snapshot: `e354553aa8721e26684b1855927ba0e3ffd39e1f6849a90e90d920f2323fdd2a`. Las actualizaciones posteriores de informes y compose se verificaron por separado; el hash identifica el snapshot de pruebas, no un commit nuevo.

| Control | Resultado |
| --- | --- |
| Backend | 736 PASS, 0 FAIL, 8 omitidas; 69 suites PASS, cinco omitidas |
| Herramientas de esquema / higiene / frontend estático / modelo frontend / prototipo DTE | 22 / 7 / 3 / 6 / 19 PASS |
| Total local | 793 PASS, 0 FAIL, 8 omitidas; QA_LOCAL_READY=true, RELEASE_READY=false |
| MailService / BillingService / ProspectsService | 42 PASS / 24 PASS / 14 PASS |
| Prisma validate y generate | PASS con URL sintética de loopback no accesible |
| Backend build y lint completo | PASS |
| Compose local general y Facturación | PASS de configuración con dos credenciales sintéticas separadas; sin iniciar servicios ni leer privados |
| Conjunto temporal con PR G2 #51 | 259 PASS, 0 FAIL, 0 omitidas; 15 suites; build y lint completos PASS |
| Proveedor, correo externo, Railway y otras integraciones durante la regresión local | Cero accesos / emisiones / envíos nuevos; consulta web posterior descrita por separado |

Las ocho pruebas omitidas pertenecen a cinco suites opt-in de PostgreSQL/CRM; no se contaron como aprobadas. El entorno de pruebas fue un contenedor temporal Node 22 sin privados, montajes ni puertos, con la red desconectada después de instalar dependencias. Los servidores SMTP de las pruebas usan loopback, certificados efímeros y PDFs ficticios; no son evidencia fiscal ni de bandejas externas.

La compatibilidad G2 se probó aplicando únicamente `backend/src/g2-integration/` del PR [#51](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/51), cabeza `d2486b45171aac5d3bfe1930c60d2e7503577a17`, dentro del contenedor. Cubre contrato HTTP, autorización y exclusión de sandbox. El endpoint tributario sigue perteneciendo a ese PR: no se duplicó en esta rama ni se ejecutó su seed. No se acredita una prueba desde el portal real.

### Archivos para revisión

- Selección y servicio SMTP: backend/src/mail/smtp.config.ts, mail.service.ts y tax-document-delivery.port.ts; verificador backend/scripts/check-smtp.cjs.
- Contexto de empresa y recuperación: backend/src/tax-document-issuance/facturacion-cl.issuer.ts y backend/src/prospects/prospects.service.ts.
- Pruebas existentes ampliadas: MailService, FacturacionClIssuer, ProspectsService y reloj de BillingService. La prueba nueva de prospectos comprueba que un administrador de otra empresa conserva el idEmpresa del prospecto para el correo.
- Configuración sin claves: .env.example, backend/.env.example, docker-compose.yml y docker-compose.facturacion-local.yml.
- Informes existentes: este checkpoint, i3-facturacion-cl-integration.md e i3-smtp-automatic-email.md.

### Configuración y publicación pendientes

Completar manualmente el SMTP por empresa en `.env.smtp-private` (archivo ya existente e ignorado), siguiendo el informe SMTP. Mantener los flags fiscales persistentes en false. Las credenciales de emisores reales no se deben colocar en variables SANDBOX. Obtener ambiente y habilitación del proveedor antes de preparar un ensayo externo; no guardar identidad fiscal ni secretos en Git.

Revisión requerida antes de publicar: diff final, secretos, configuración privada excluida y alcance del PR. Auditoría final PASS: git diff --check y Gitleaks del diff sin hallazgos; dos claves comparadas en memoria sin coincidencias en los 609 archivos versionados ni en el diff. Los dos privados siguen ignorados y no versionados. Se comprobaron 17 archivos modificados, cero nuevos y cero staged; BillingService, esquema y migraciones permanecen sin cambios. Este control no certifica otras ramas ni todo el historial. Los resultados fechados del 19-10 y anteriores que siguen conservan su alcance histórico.

### Verificación web posterior de Cable Mágico — 2026-10-20

El usuario reenvió dos bloques de API idénticos a la cuenta DEMO ya utilizada, junto con un acceso web de Cable Mágico. No se agregaron ni modificaron privados, ejemplos o código con esos datos. Esta consulta web se realizó después de la regresión local: no debe confundirse con las cero llamadas externas de aquella ejecución.

| Comprobación posterior | Resultado |
| --- | --- |
| Acceso web a la cuenta Cable Mágico | PASS de autenticación y consulta del portal; no certifica por sí solo identidad fiscal ni habilitación de emisión |
| Administrador → Integración → Configuración → Credenciales | Existen secciones separadas de Ambiente Producción, Ambiente Prueba y acceso web de pruebas, con sus campos. No se exportaron ni guardaron sus valores. |
| Autenticación API empresarial Cable Mágico | BLOQUEADO / no ejecutada; los datos reenviados siguen siendo DEMO, no se certifica la API productiva por la existencia de campos en pantalla |
| Autenticación y portal empresarial FiNet | BLOQUEADO / no ejecutados; no se recibió un acceso empresarial distinto del DEMO repetido |
| Campos de Impreso Adicional | Ruta verificada: Administrador → Integración → Configuración → Campos de Impreso Adicional. Contiene formato de emisión, tipo y número de adicional, nombre, ubicación, visibilidad web y adjunto de ejemplo. Se consultó sin pulsar Modificar/Insertar ni subir archivos. |
| Logos/plantilla completa | No se identificó un editor de logos o de plantilla PDF en las opciones visibles de esta sesión. La búsqueda “logo” en el Centro de Ayuda devolvió “Video no encontrado”. Esto no demuestra que el producto carezca de otras opciones/permisos o gestión de soporte. |
| Nuevos logos | El usuario autorizó crear únicamente dos propuestas, ya generadas y revisadas visualmente: [FiNet](logo-propuesto-finet.svg) y [Cable Mágico Litoral](logo-propuesto-cable-magico.svg). Son SVG con fondo transparente, letras vectorizadas y marca visible de aprobación pendiente. No se subieron al proveedor ni constituyen identidad corporativa aprobada. |
| Datos tributarios, documentos, folios y configuración | Sin cambios. No se emitieron documentos, anularon folios, descargaron documentos de clientes ni probaron nuevas credenciales productivas. |
| Cierre de acceso | Salida confirmada al formulario de acceso y cierre de ambas pestañas temporales; sin guardar contraseña en navegador ni archivos |

La matriz de cierre sigue BLOQUEADA en los emisores independientes y la personalización oficial. La disponibilidad de un portal empresarial y la de una cuenta DEMO compartida son evidencias diferentes. Se requieren confirmación del ambiente/API por empresa, permisos/procedimiento de personalización y aprobación de la identidad visual antes del ensayo final.

## Revisión del encargo de ambas empresas — 2026-10-19

Base local `SecurityRealiseMatrizQA@0ad059dc53ee13ebd6ada8fed81dde9aefb20b40`; referencia `origin/develop@e56be1f1`. La rama tenía dos commits propios y develop 24 no incorporados. Esta revisión no fusionó esas diferencias. Se contrastó el PDF recibido y el PR G2 #51, abierto en la cabeza `d2486b45171aac5d3bfe1930c60d2e7503577a17`. El usuario confirmó que solo existe acceso DEMO por ahora.

| Caso del encargo | Evidencia y límite actual |
| --- | --- |
| F01 FiNet | Ensayo del 15-10: empresa FiNet del CRM con cuenta DEMO, abono, boleta 39, PDF y correo recibido. No certifica emisor propio ni producción. |
| F02 Cable Mágico | Ensayo histórico del 03-10: boleta 39, PDF y Mailpit local. No equivale a recepción externa por la casilla de esa empresa. |
| F03 pago parcial | Evidencia DEMO FiNet del 15-10 y pruebas locales; política fiscal real pendiente. |
| F04 pago duplicado | Replay DEMO del 15-10 y controles locales; no se produjo otro pago/documento. |
| F05 timeout posterior al envío | Cobertura local de resultado incierto; sin ensayo nuevo contra proveedor real. |
| F06 rechazo | Cobertura local preserva el pago; sin rechazo nuevo provocado contra proveedor real. |
| F07 fallo PDF/SMTP | Cobertura local; se añaden ocho pruebas de renovación explícita del PDF y no reemisión/reenvío. |
| F08 cruce de empresa | Cobertura local de alcance; falta ensayo coordinado con dos emisores propios habilitados. |
| F09 factura autorizada | PENDIENTE_EXTERNO: DTE/folios/identidad/reglas monetarias; no se certifica factura 33/34. |
| F10 conciliación incierta | Cobertura local y auditoría; falta ejercicio operativo aprobado con el proveedor. |
| F11 lectura G2 | Implementación en PR #51 ajena a esta rama, excluye sandbox; incorporación/revisión y prueba del portal pendientes. |

La recuperación `DATOS_REQUERIDOS` señalada en FIS-07 ya existe en develop y esta rama, incluidos los controles de autoridad y ausencia de intención previa. La brecha local corregida es FIS-08: recuperar un PDF explícitamente obtenía antes un enlace antiguo o terminaba pronto si el correo estaba enviado. Ahora renueva el enlace del mismo folio y valida el PDF sin emitir otro DTE. Se conserva la exclusión de envíos ya aceptados o inciertos y el claim de SMTP para correo pendiente.

| Verificación ejecutada el 19-10 | Resultado |
| --- | --- |
| Entorno | Contenedor temporal Node 22, snapshot de archivos versionados y dos cambios tributarios; sin privados, montajes, puertos ni red durante las pruebas |
| Código probado | HEAD base 0ad059dc y cambios locales de emisor/spec; fingerprint SHA-256 del snapshot: acc5aeded2fc6f7c881a46246d6a1c717a592f002bc6760e216f775698183772 |
| Nuevas pruebas PDF | 8 PASS: renovación tras cinco estados de correo, fallo al obtener enlace, descarga no PDF y dos recuperaciones con un único envío ficticio |
| Facturación.cl + SMTP | 158 PASS, 11 suites; proveedor simulado y transporte de correo local/ficticio según prueba; ninguna llamada externa |
| Regresión completa backend | 717 PASS, 2 FAIL, 8 omitidas; 68 suites PASS, una FAIL y cinco omitidas |
| Diagnóstico de los dos FAIL | Ambos reproducidos con el código original HEAD 0ad059dc, sin la corrección: “impide último aviso antes del vencimiento efectivo de una prórroga” y “no suspende mientras una prórroga aprobada mantiene la factura vigente”, en billing.service.spec.ts. Sus fixtures usan una prórroga al 10-10-2026 y dependen del reloj real; el 19-10 ya no es futura. Como diagnóstico adicional, con reloj fijo al 08-10-2026 y sin cambios en las fuentes pasan las 24 pruebas de esa suite. El resultado oficial conserva los dos FAIL con la fecha actual. No se modificó Cobranza ni se ocultó la regresión. |
| Herramientas de esquema global | 22 PASS locales; no es una lectura del catálogo de Railway |
| Higiene del repositorio | 7 PASS |
| Frontend estático/modelo | 3 + 6 PASS |
| Prototipo tributario | 19 PASS |
| Total de la aceptación local | 774 PASS, 2 FAIL y 8 omitidas; QA_LOCAL_READY=false y RELEASE_READY=false. Los estados derivados FAIL del informe no representan fallos adicionales de esas suites. |
| Prisma | validate y generate PASS; URL sintética de loopback sin base accesible |
| Backend build / ESLint de los dos archivos | PASS / PASS |
| Accesos externos | Railway 0; emisiones 0; correos externos 0; G1/G2/G3/Meta 0 |

Los ocho casos nuevos verifican el flujo del emisor con mocks; la validación de bytes/host/ruta sigue cubierta en las pruebas existentes de FacturacionClArtifactsClient. No se atribuye a estas pruebas un tiempo de caducidad real del enlace. Las ocho pruebas de integración con base omitidas no se cuentan como verificadas.

**Pendientes para liberar ambas empresas:** cuentas API propias y ambiente confirmado por Facturación.cl; perfiles fiscales/DTE/folios aprobados; validación del esquema compartido por su responsable; aprobación fiscal de PER_PAYMENT_V1; selección de remitente/SMTP por empresa coordinada con Responsable 1; revisión/incorporación del PR #51 y ensayo G2; resolver los dos fallos generales de Cobranza antes de una aceptación global. El segundo correo por sí solo no completa estos puntos. Producción sigue bloqueada en código y configuración.

No se crearon archivos/carpetas nuevos ni se publicó esta revisión con commit, push, PR o merge. Auditoría local: git diff --check PASS; Gitleaks del diff, cero hallazgos; dos claves tomadas en memoria de los privados no aparecen en el diff ni en los 609 archivos versionados. Ambos privados existen, están ignorados y no versionados. Esta comprobación no certifica todas las ramas ni el historial. Repetir el control antes de una publicación. Los apartados fechados que siguen conservan las evidencias históricas, con sus propios commits y ambientes.

### Prueba SMTP aislada de Cable Mágico — 2026-10-19

Posteriormente, el usuario proporcionó la configuración de correo de Cable Mágico (empresa 2) y autorizó un único mensaje a su destinatario de prueba. Las variables SMTP_COMPANIES y SMTP_CABLE_MAGICO_* aún no son consumidas por el MailService de esta rama. Para comprobar la cuenta, se tradujeron sus opciones a la configuración de una sola instancia del servicio, exclusivamente en memoria. Esto valida la cuenta SMTP, no implementa el enrutamiento multiempresa del CRM.

- Runtime temporal del servicio MailService real: imagen de pruebas basada en 2369db5; se comprobó que backend/src/mail no difiere respecto de ese commit. Sin montar repositorio/privados y con sistema de archivos de solo lectura; la entrada privada se transmitió por stdin, sin variables Docker persistentes ni contraseña en argumentos.
- Conexión Gmail, puerto 587, STARTTLS obligatorio, validación de certificado y autenticación: PASS.
- Un único sendTest: SENT, aceptado por Gmail. Asunto: “Prueba SMTP del CRM”. Remitente visible: Cable Magico Litoral. Sin adjuntos ni documento tributario.
- Message-ID del ensayo: bba0cdfa-30ee-c72d-7532-7826f3be2df3@gmail.com. Recepción en bandeja: confirmada por el usuario el 2026-10-19. Queda validado el envío y la recepción del único correo de esta prueba aislada; no acredita todavía el enrutamiento SMTP por empresa dentro del CRM.
- No se guardaron las nuevas credenciales ni se modificó el SMTP persistente de FiNet. No se emitieron documentos, no se accedió a Railway, no hubo reenvíos ni commit/push.

Pendiente: selección del SMTP por idEmpresa coordinada con Responsable 1 y pruebas de ese flujo integrado. Este ensayo aislado no habilita Facturación.cl productivo.

## Validación FiNet del 2026-10-15

Rama `SecurityRealiseMatrizQA`; código de ejecución `2369db556f4763df0c0469d688a93fe3b3c0ad06`. Ensayo registrado a las 13:13 America/Santiago (2026-10-15T16:13:46.526Z). Esta sección documenta FiNet; el checkpoint posterior del 2026-10-03 conserva sus resultados originales.

Se usaron los servicios reales BillingService, FacturacionClIssuer, PrismaTaxIntentStore, cliente REST y recuperador de PDF del commit indicado. No se inició AppModule ni se usó un endpoint del CRM desplegado. PostgreSQL se creó temporalmente como `fsm_finet_sandbox_qa`, con datos ficticios, sin puertos publicados ni volúmenes persistentes. Se cargó el DDL global y las cuatro migraciones tributarias/correo existentes únicamente en esa base. No se modificaron archivos de esquema, migraciones, servicios de negocio ni la integración de Cable Mágico.

| Comprobación actual | Resultado |
| --- | --- |
| Cuenta del proveedor | DEMO; no corresponde a certificación fiscal de FiNet |
| Autenticación REST con configuración privada de FiNet | PASS_SANDBOX; no se publicaron token, usuario ni clave |
| Método SOAP público Online | Disponible; sin autenticación ni emisión |
| Versión REST | CONTRACT_MISMATCH, version:array; discrepancia conocida, no ocultada |
| Empresa local | FiNet, idEmpresa 1; Cable Mágico sin configurar en este proceso |
| Registro del abono | BillingService.registerPayment; pago 1, cobro 1, abono 100 de 200, saldo 100 |
| Orden de ejecución | Pago confirmado en PostgreSQL antes de la solicitud al proveedor |
| Emisión autorizada en cuenta de pruebas | GENERADO, BOLETA tipo 39, folio 9300000141 |
| Replay del mismo pago | PASS_SANDBOX; duplicate=true, un pago, una intención y una única solicitud de procesamiento |
| PDF | DISPONIBLE; HTTPS, 1 página, 4719 bytes; texto confirma folio, receptor ficticio, total 100 y referencias al pago 1/cobro 1 |
| SHA256 del PDF | 2d5ac16fb0f72f69aa2c07a1c46c98d13a5eb6301d31be28987ace919f5830a1 |
| Trabajos tributarios de Cable Mágico | 0 |
| SMTP de este documento | ENVIADO; una aceptación Gmail con STARTTLS y autenticación; mismo PDF verificado |
| Replay de recuperación del correo | PASS_SANDBOX; un envío, un intento SMTP y cero solicitudes de emisión durante esta etapa |
| Recepción del correo externo | PASS_SANDBOX; el usuario confirmó el 2026-10-15 la recepción del único correo con el PDF adjunto |
| Higiene del repositorio | 7 pruebas PASS, 0 FAIL; configuración privada fuera de Git |
| Railway / base compartida / emisión productiva | No utilizados |
| Limpieza de QA | Contenedores y red temporales retirados; datos ficticios eliminados; servicios existentes conservados |

Durante la fase pago/replay/PDF: 2 logins, 1 solicitud de procesamiento, 1 obtención de link y 3 descargas PDF (incluida verificación explícita); el replay no generó otro DTE. La lectura previa de autenticación/versión se realizó por separado y tampoco emitió documentos.

La etapa de correo se completó a las 13:21 America/Santiago (2026-10-15T16:21:27.780Z), después de autorización expresa del destinatario de QA. Se recuperó la intención GENERADO existente, sin procesar otro DTE. El adjunto coincide byte a byte con el PDF comprobado anteriormente. El estado de correo quedó ENVIADO, con un intento; la segunda recuperación no llamó a SMTP. La aceptación del servidor y la recepción en buzón son comprobaciones separadas. El usuario confirmó el 2026-10-15 que recibió el correo con el PDF adjunto; queda validado el flujo demo de FiNet desde el abono hasta la recepción del documento.

La configuración privada de FiNet usa las variables existentes FACTURACION_CL_FINET_SANDBOX_CREDENTIALS, FACTURACION_CL_COMPANIES y FACTURACION_CL_PROFILES. El archivo `.env.facturacion-private` permanece ignorado; ambos flags persistentes de emisión/entrega están en false. No se copiaron valores a código, plantillas, documentación ni comandos. Las credenciales del portal web no se mezclan con las del WebService. Durante el ensayo no se creó otra carpeta o repositorio ni se hicieron commits, push, PR, merges o llamadas G1/G2/G3/Meta. Después de confirmar la recepción del PDF, el usuario autorizó el 2026-10-15 publicar estos dos informes en SecurityRealiseMatrizQA, tras revisar el diff y comprobar que las credenciales privadas queden excluidas. El SHA de ejecución indicado arriba identifica el código probado; la publicación posterior de documentación se comprueba en el historial de la rama.

La prueba valida una boleta demo para la empresa FiNet del CRM. Factura tipo 33/34, emisor fiscal productivo, datos fiscales definitivos, revisión del esquema compartido y despliegue permanecen fuera de esta validación.

## Histórico del 2026-10-03

2026-10-03. Rama feat/i3-facturacion-cl, base de continuación e2a7bbb54064e14c6d3c49cc264784b544a66a99. Se mantiene el merge de I3 1af19cc96e78ad1f4c3b12dc339f2d9332a82784. Sin PR, despliegue, Railway ni emisión productiva.

## Resultado comprobado

**Cable Mágico sandbox: PASS**, desde un pago del CRM hasta boleta, PDF y correo local. Política del usuario: por cada pago, incluidos abonos; primera prueba Boleta. El emisor real quedó registrado detrás de TaxDocumentIssuer y conectado a Billing después del commit. Este checkpoint sustituye el anterior de preparación sin conexión.

| Paso real | Resultado |
|---|---|
| Factura de QA local 4 / contrato 5 | Monto 200, cliente ficticio QA BOLETA SANDBOX - NO COBRAR |
| Abono por interfaz del CRM | Pago 1, 100 pesos, referencia QA-FACTCL-20261003-ONCE-100 |
| Proveedor API PRUEBAS | GENERADO, tipo 39, folio 9234371045, intentos 1 |
| Saldo después de emitir | 100 pendientes; cobro permanece parcial |
| Recuperación del PDF | HTTPS, una página, 4729 bytes; contenido confirma folio, pago 1, cobro 4 y total 100 |
| Correo | ENVIADO y recibido en Mailpit local con dte-39-9234371045.pdf adjunto; no prueba entrega a una casilla externa |
| Referencia de pago duplicada | HTTP 409, sin segundo pago/boleta |
| Recuperación repetida | Misma boleta, intentos 1, sin otro correo |

La recuperación inicial del PDF rechazó el enlace http /plano del sandbox. Se añadió la ruta exacta observada, convirtiéndola a HTTPS y conservando host fijo, límite, firma y prohibición de redirects. Se recuperó la boleta existente mediante /artifacts; no se repitió /procesar. El PDF descargado se inspeccionó visualmente y como texto; los datos son de prueba.

Durante este ensayo: una solicitud /wsds/procesar, cuatro /login y tres /obtenerlink (incluida una lectura diagnóstica), una descarga PDF por el backend. El adjunto se leyó posteriormente desde Mailpit local para QA. Cero llamadas productivas; ninguna contraseña se cambió. Las comprobaciones anteriores de login/versión del 2026-10-02 siguen como historial en tools/facturacion-cl-sandbox/AUDIT.md.

## Solicitud de instalación G3

Caso ficticio QA G8 G3 LOCAL 20261003 - NO INSTALAR, prospecto 4, contrato 6 (Firmado), empresa 2, plan 3. Ubicación y cobertura comercial sintéticas se prepararon exclusivamente en la base local; revisión técnica manual de QA, sin prueba técnica de G3.

La cotización se guardó y su correo fue recibido localmente. El navegador bloqueó su apertura de PDF por su política de seguridad; no se intentó eludirla ni repetir la generación. El selector del contrato quedó sin planes en esta versión de la UI. Se completó únicamente el contrato ficticio y su firma mediante endpoints locales existentes, sin modificar ese formulario.

POST /api/integrations/g3/installations respondió HTTP 201 por la creación del seguimiento **local**: integración 1, FALLIDA_REINTENTABLE, intentos 1, idOtG3=null. Mensaje exacto: “La integracion tecnica con G3 no esta configurada.” requestId fb2f4cd0-f6e6-4f21-934a-bb06d1b6813d, traceId 45434620-dec8-4403-b306-85f0981d604c.

**RECEPCION_G3_NO_VERIFICADA**: no hubo POST externo, despacho ni orden creada en G3. Faltan G3_API_URL y G3_API_KEY de pruebas, y habilitar ese ambiente. Una recepción válida requiere la referencia externa del POST a /api/integraciones/instalaciones y lectura posterior de /api/integraciones/ordenes/{id}?id_empresa=2, cotejando empresa/contrato/requestId. No se usan mocks como prueba de recepción. El código G3 no se modificó.

## Validación del código

- Jest: 24 suites / 264 tests PASS (tax, Billing, Mail, límites CU-86, G2 y G3). Los proveedores en Jest son ficticios.
- PostgreSQL real local: un dispatcher concurrente, replay después de reinicio, conflicto de fingerprint, constraint de GENERADO sin folio, reintento confirmado previo al envío y bloqueo de reenvío incierto PASS. Cero HTTP/SMTP en ese script.
- Compilación TypeScript backend/frontend y ESLint de archivos afectados PASS.
- Prisma validate/generate PASS; las dos migraciones se aplicaron solo a fsm_facturacion_local.
- git diff --check PASS.

[Capturas y salida saneada de pruebas](evidencias/facturacion-cl/2026-10-03/README.md). Los informes previos 234 tests corresponden a la preparación anterior; no son evidencia de esta emisión.

## Límites para operar

Producción sigue bloqueada, FiNet todavía sin credenciales/prueba propia, factura 33/34 sin ensayo real ni política de redondeo asumida. El subconjunto fiscal exige datos/folios explícitos y deja casos no soportados para revisión. Conciliación incierta es manual auditada; no se afirma una consulta automática por idempotencia del proveedor. Las migraciones del esquema compartido requieren revisión de su responsable. SMTP externo no se configuró. Ver [contrato y configuración](i3-facturacion-cl-integration.md).
