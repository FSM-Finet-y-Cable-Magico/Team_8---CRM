# Facturación.cl: emisión por pago en sandbox

Estado al 2026-10-03, rama feat/i3-facturacion-cl: **SANDBOX_BOLETA_VERIFICADA / PRODUCCION_NO_CERTIFICADA**. La API de pruebas de Cable Mágico generó una boleta desde un abono confirmado, se recuperó su PDF y se recibió el correo en una bandeja SMTP local. No acredita entrega a una casilla externa ni certificación SII/producción. FiNet requiere sus propias credenciales/perfil y prueba independiente.

## Flujo implementado

La regla aprobada por el usuario es un documento por cada pago, incluso parcial (PER_PAYMENT_V1). Billing conserva Pago y saldo; dentro de su transacción Serializable escribe un TaxPaymentJob con la identidad y bytes del documento. Ese paso solo utiliza PostgreSQL. Después del commit llama al TaxDocumentIssuer real, FacturacionClIssuer. Un fallo HTTP/SMTP nunca revierte ni convierte en fallido el pago confirmado. Si la persistencia local falla antes del commit, se aborta la transacción, sin llamadas externas.

El trabajador recupera trabajos persistidos cada 15 segundos. La intención identifica empresa + sandbox + PAYMENT:idPago, y conserva fingerprint de contexto y bytes. Claim y marcador de envío se escriben antes de procesar en el proveedor. La autenticación precede al marcador: un fallo confirmado anterior a procesar admite reintento explícito; nunca hay reintento automático de /wsds/procesar.

Estados: PENDIENTE → EN_PROCESO → GENERADO, FALLIDO o RESULTADO_INDETERMINADO. Una respuesta incompatible, timeout o caída tras el envío queda por conciliar. Trabajos EN_PROCESO antiguos se ponen en cuarentena. Un cambio de perfil detiene el trabajo para revisión, sin reconstruirlo silenciosamente. El marcador de envío impide otra emisión desde procesos/reinicios concurrentes.

El PDF y el correo tienen estados separados. Se obtiene el enlace del folio generado; se exige HTTPS, host fijo www.facturacion.cl, rutas /sistema/descargar.php o /plano/descargar.php, sin redirects, máximo 5 MB y firma PDF. El enlace HTTP observado en el sandbox para /plano se convierte a HTTPS ANTES de la solicitud; no se realiza una descarga HTTP. Antes de SMTP se toma un claim persistido; una entrega incierta queda bloqueada para evitar reenvíos automáticos. Un fallo de PDF/SMTP conserva GENERADO y el pago.

## Datos fiscales y límites

La empresa, cliente, factura y pago proceden de las relaciones de G8; G2 no determina el tipo tributario. Se usa el tipo BOLETA/FACTURA guardado en Factura o el valor por defecto explícito del perfil. El total es el pago individual, no el total de cobro original. Cada detalle referencia el idPago y el idFactura. El RUT del cliente se valida con dígito verificador y nunca se reemplaza por un RUT auxiliar.

Nombre, email y RUT: Cliente. Dirección/comuna/ciudad: campos de instalación del Contrato. Giro para factura: Cliente.datosTecnicos.giroTributario, dato explícito de G8; su ausencia bloquea factura. Revisar esos datos para un despliegue fiscal, pues dirección de instalación no certifica por sí sola domicilio tributario.

El perfil fija tipo 39/41, charset y servicio 1/2/3 para boleta. Períodos/día límite provienen del cobro cuando corresponden. Boleta usa folio 0 únicamente en modo provider_auto explícito; el proveedor devuelve un folio positivo. Su campo Email queda vacío para evitar entrega adicional del proveedor: el correo es una etapa propia.

La identidad de acceso 1-9 se observó en Credenciales API de PRUEBAS y se permite solamente para el perfil sandbox de boleta; no es una identidad de cliente ni un emisor habilitado para factura. No se modificó el validador común de RUT.

Factura XML 33/34 conserva un rango positivo de folios exclusivo, configurado explícitamente. Se reserva con lock transaccional y restricción única. IVA debe ser explícito y exacto, sin redondeo inventado. Pesos fraccionarios, datos insuficientes, tratamientos mixtos, descuentos o falta de folios dejan DATOS_REQUERIDOS. No se certificó una factura real en el proveedor; solo se probó la boleta autorizada. CU-86 conserva su registro manual independiente; un folio externo o CU-86 ya registrado para la factura impide emitir automáticamente hasta revisión.

## Configuración del servidor

Defaults: FACTURACION_CL_INTEGRATION_ENABLED=false; FACTURACION_CL_COMPANIES=[]; FACTURACION_CL_PROFILES=[]; FACTURACION_CL_DELIVERY_ENABLED=false. Ninguna credencial se expone en VITE, logs o Git.

Mapa de empresas sin secretos: [{idEmpresa,alias,environment:"sandbox",enabled:true}]. Aliases previstos FINET y CABLE_MAGICO; nunca compartir credenciales entre empresas.

Perfil aprobado: [{idEmpresa,approved:true,issuerRut,defaultDocumentType:"BOLETA",receipt:{tipoDte:39,encoding:"utf8",serviceIndicator:3}}]. La aprobación documenta la configuración del ensayo; no certifica el perfil comercial productivo. Una factura requiere además invoice:{tipoDte:33,vatRate:"19",folioFrom:"…",folioTo:"…"}, o tipo 34 sin vatRate; confirmar rango exclusivo y política fiscal antes de habilitarlo.

Secretos por empresa: FACTURACION_CL_CABLE_MAGICO_SANDBOX_CREDENTIALS y FACTURACION_CL_FINET_SANDBOX_CREDENTIALS, JSON {usuario,rut,clave} de API PRUEBAS. La empresa/RUT debe coincidir con el perfil. Producción permanece bloqueada por el servicio y por el validador productivo existente. No reutilizar las credenciales reales en estas variables: ambas credenciales usan el mismo origen REST y el ambiente efectivo depende de su procedencia.

SMTP_HOST/FROM y configuración SMTP existente; FACTURACION_CL_DELIVERY_ENABLED=true activa entrega. En el ensayo se usó únicamente Mailpit local, sin relay ni entrega externa.

## Persistencia y operaciones

Migraciones aditivas independientes: 20261003010000_i3_tax_emission_intents y 20261003020000_i3_tax_payment_pipeline. Se aplicaron únicamente a fsm_facturacion_local, contenedor/volumen propio; no a Railway ni a una base compartida. No se modificaron la migración G2 ni init-global.sql. El responsable del esquema compartido debe revisar/incorporar ambas antes de un despliegue. Con flag true y tablas faltantes, el módulo rechaza iniciar.

GET /api/tax-documents/payments/:id: estado, folio, enlace, fingerprint y estado PDF/correo, con JWT/rol de cobranza y pertenencia de empresa/cliente.
POST :id/retry: solo FALLIDO + CONFIRMED_NOT_SENT, sin marcador de envío previo.
POST :id/artifacts: recupera PDF/correo pendiente de una intención GENERADO, sin volver a emitir.
POST :id/reconcile: Administrador, fingerprint, folio positivo, confirmSameDocument=true y observación; registra auditoría. El operador debe contrastar en el proveedor tipo, empresa, receptor, importe y referencia del pago. Que exista un PDF con un folio no prueba automáticamente que sea el mismo pago. Con folio automático y resultado incierto, no hay conciliación automática ni reemisión a ciegas.

La pantalla Cobranza → factura → pago permite consultar documento, comprobante, correo y acciones seguras de recuperación. No se añadieron datos del emisor fiscal al formulario de pago.

## Verificación y evidencia

Ver [checkpoint con resultados y G3](i3-facturacion-cl-checkpoint.md), [Docker local](facturacion-cl-local-docker.md) y [capturas](evidencias/facturacion-cl/2026-10-03/README.md). 264 tests / 24 suites PASS; comprobación adicional con PostgreSQL real y dispatcher ficticio de concurrencia/reinicio/cuarentena. TypeScript, ESLint, Prisma y diff-check aprobados según el checkpoint.

Fuentes primarias consultadas: [API REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php), [boleta TXT](https://www.facturacion.cl/manualintegracion/archivoboletaelectronica.php), [factura XML](https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php). Diferencias observadas del sandbox (RUT corto, link /plano) están descritas aquí, sin alterar ni atribuirlas al ejemplo del manual.
