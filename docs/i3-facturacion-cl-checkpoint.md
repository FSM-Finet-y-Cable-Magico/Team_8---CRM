# Checkpoint: boleta por pago y solicitud G3

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
