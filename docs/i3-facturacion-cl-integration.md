# Facturación.cl: emisión por pago en sandbox

## Preparación de cierre — 2026-10-20

La preparación técnica local queda probada; la habilitación productiva sigue bloqueada. El nuevo encargo declara cuentas empresariales propias, pero la configuración privada de esta PC solo acredita un perfil sandbox FiNet y carece de perfil/API Cable Mágico. No se han certificado credenciales productivas, emisores ni folios propios. Consultar la [matriz actual](i3-facturacion-cl-checkpoint.md#preparación-del-cierre-de-ambas-empresas--2026-10-20), que sustituye los pendientes técnicos históricos sin alterar sus evidencias.

**SMTP integrado por empresa.** El emisor entrega a MailService el idEmpresa del TaxPaymentJob; las cotizaciones toman el del Prospecto autorizado. El mapa SMTP_COMPANIES relaciona ese id con FINET o CABLE_MAGICO y selecciona exclusivamente sus variables prefijadas. Si falta empresa, mapa o host propio no se envía; un correo con idEmpresa nunca toma el SMTP global, incluso con mapa vacío. No se copian credenciales entre emisores. El pie de correo procede del remitente seleccionado y no incluye FiNet de forma fija. El trabajador conserva los claims y el bloqueo de resultados inciertos. Se actualizaron ambos compose locales para pasar las variables. Configuración manual y comandos sin envío en [el informe SMTP](i3-smtp-automatic-email.md#smtp-por-empresa--2026-10-20).

**TXT y PDF.** No se modificaron los constructores: boletas 39/41 permanecen TXT; facturas 33/34, XML. El PDF entregado por correo sigue procediendo de la recuperación del documento del proveedor. La corrección FIS-08 renueva el enlace del mismo folio sin emisión adicional y sin reenviar correos ya enviados o inciertos.

**Personalización: investigación y límites comprobados.** Se consultaron el [manual REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php), el [manual WebService](https://www.facturacion.cl/manualintegracion/integracionservicioweb.php) y el [manual DTEPlanoWS](https://www.facturacion.cl/manualintegracion/dteplanows.php) el 20-10-2026. Documentan TXT/XML, recuperación del PDF e impresión. El formato térmico descrito se ofrece sin logotipo; no debe confundirse con un editor del PDF. En el listado REST consultado no figura un método para subir logos o plantillas. Esto no prueba que el producto carezca de personalización: el procedimiento y su disponibilidad por cuenta quedan sin verificar.

Antes de configurar la presentación, solicitar al proveedor o administrador autorizado de cada cuenta:

1. Confirmación de si la personalización es una opción de plataforma o una gestión de soporte, menú exacto y permisos necesarios; ambiente aplicable y disponibilidad por empresa/tipo DTE.
2. Requisitos del logo, formatos, dimensiones, resolución y límites de encabezados, pies, datos comerciales, marca de agua y campos tributarios obligatorios. No asumir tamaños ni editar directamente un PDF oficial.
3. Vista previa o muestra de prueba soportada, sin emitir en producción; confirmar si la configuración visual afecta a documentos existentes o solo futuros.
4. Aprobación de logos y datos fiscales de cada empresa por su responsable; luego obtener un PDF del proveedor y comprobar empresa, folio, importes, referencias y legibilidad, con autorización específica del ensayo y del envío.

En la revisión local inicial no había una sesión del proveedor disponible. El acceso web aportado después por el usuario se verificó en la consulta posterior documentada más abajo, sin cambiar datos. No se inventó una ruta de configuración ni una plantilla que la API no documenta. No se crearon muestras oficiales falsas, se cambiaron documentos emitidos ni se contactó a terceros. Las dos muestras corporativas siguen BLOQUEADAS hasta contar con esos insumos.

**G2 y liberación.** El código actual es compatible localmente con el módulo del PR #51: 259 pruebas y build/lint PASS en un overlay temporal. La ruta G2 devuelve solo información productiva persistida, sin emitir ni ofrecer sandbox como documento real. Incorporar ese PR y los 24 commits pendientes de develop requiere revisión coordinada; esta preparación no realiza merge. PER_PAYMENT_V1 aún necesita aprobación fiscal para operación real. Se mantienen los bloqueos productivos de configuración, emisor, dispatcher y persistencia. No se crearon archivos ni se modificaron los privados.

### Consulta autenticada de Cable Mágico — 2026-10-20

Con el acceso web aportado por el usuario se verificó la sesión de Cable Mágico en modo de consulta. Ruta de lectura confirmada: **Administrador → Integración → Configuración → Credenciales**, con secciones diferenciadas para producción y pruebas. No se exportaron sus valores, no se autenticó la API productiva ni se modificó la cuenta. Los dos bloques API reenviados por el usuario eran el mismo acceso DEMO; no deben presentarse como cuentas API independientes de ambas empresas.

En **Administrador → Integración → Configuración → Campos de Impreso Adicional** se verificaron las opciones de formato, tipo/número de adicional, nombre del campo, ubicación, visibilidad web y ejemplo adjunto. La pantalla requiere habilitar Modificar para editar; no se hizo. Esta opción de campos adicionales no acredita un editor de logos o de toda la plantilla. En el Centro de Ayuda, la búsqueda “logo” no encontró un video; siguen pendientes los permisos/procedimiento exacto y la confirmación del proveedor.

El usuario indicó que los logos serán diseños del equipo y después autorizó crear dos archivos: [propuesta FiNet](logo-propuesto-finet.svg) y [propuesta Cable Mágico Litoral](logo-propuesto-cable-magico.svg). Fueron revisados visualmente, sin recursos externos y con texto convertido a trazados. La identidad queda pendiente de aprobación; no se subieron al proveedor ni se aplicaron a documentos tributarios. La sesión se cerró y las pestañas temporales se retiraron. No se almacenaron las credenciales reenviadas, identificadores fiscales, capturas de la pantalla de claves ni enlaces temporales de acceso a la ayuda.

## Revisión del encargo de ambas empresas — 2026-10-19

El documento recibido `Responsable_2_FacturacionCL_Ambas_Empresas.pdf` parte de `develop@e56be1f1`, no del informe FiNet publicado en `SecurityRealiseMatrizQA@0ad059dc`. En la comparación realizada, las implementaciones de `tax-document-issuance` y `mail` coincidían con develop; los informes del ensayo FiNet del 15 de octubre estaban en nuestra rama. El usuario confirmó que actualmente solo se dispone de la cuenta DEMO del proveedor. No se dispone de habilitación productiva propia acreditada para ninguna de las dos empresas.

La regla de un documento por pago, incluso parcial, está implementada como `PER_PAYMENT_V1` y fue elegida por el usuario para el ensayo. Su aprobación fiscal/administrativa para operación real continúa pendiente. El nuevo correo de una empresa no sustituye las credenciales API, su emisor fiscal, los tipos DTE y los folios autorizados.

| Fase del encargo | Estado contrastado y siguiente paso |
| --- | --- |
| FIS-01: alta de cada empresa | PENDIENTE_EXTERNO. Obtener del proveedor las cuentas y el ambiente de cada emisor, identidad fiscal aprobada, DTE habilitados, modalidad/rangos de folios y charset. No colocar cuentas productivas en variables SANDBOX. |
| FIS-02: persistencia | PENDIENTE_RESPONSABLE_DB. El listado de seis migraciones es histórico; verificar catálogo e historial actuales con una conexión de solo lectura y coordinar respaldo/aplicación con el dueño del esquema. En esta revisión no se accedió a Railway ni se aplicaron migraciones. |
| FIS-03: datos fiscales | Implementado el enlace empresa/cliente/contrato/pago y la validación; falta aprobar los datos de cada emisor/receptor para uso fiscal. La dirección de instalación no certifica domicilio tributario. |
| FIS-04: boleta por empresa | Evidencia histórica separada: Cable Mágico, sandbox del 03-10 con Mailpit; FiNet del CRM, cuenta DEMO del 15-10 con PDF y recepción externa confirmada. Ninguna acredita un emisor productivo propio. |
| FIS-05: factura 33/34 | NO_GO hasta contar con habilitación, folios exclusivos y reglas monetarias aprobadas; pruebas locales no certifican emisión externa. |
| FIS-06: idempotencia y conciliación | Implementadas y cubiertas localmente. El resultado incierto conserva el bloqueo; no se autoriza reemisión automática ni se ensayaron fallos nuevos contra el proveedor. |
| FIS-07: recuperación DATOS_REQUERIDOS | Ya implementada en develop y esta rama: repreparePayment y POST /api/tax-documents/payments/:id/reprepare, con rol, alcance, identidad financiera, auditoría y prohibición si ya existe intención. No se duplicó. |
| FIS-08: PDF, correo y G2 | Se corrige la renovación explícita del enlace del mismo folio. SMTP por empresa y la incorporación coordinada del PR #51 siguen pendientes; ver detalle siguiente. |
| FIS-09: liberación | NO_GO productivo para ambas empresas. Continúan los bloqueos en configuración, emisor y dispatcher. La liberación exige revisión técnica/fiscal, esquema verificado, ensayo autorizado y plan operativo. |

**Corrección local del PDF.** POST `:id/artifacts` vuelve a consultar el enlace del folio existente y a validar el PDF aunque antes estuviera DISPONIBLE y el correo ENVIADO. Conserva el documento GENERADO y los controles de envío: no invoca el procesamiento de un DTE ni reenvía un correo ya enviado o incierto. Un fallo solo afecta el artefacto. Ocho pruebas nuevas usan proveedor y PDF ficticios; no se afirma haber observado un plazo de caducidad real del proveedor.

**Contrato con G2.** Se consultó el [PR #51](https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM/pull/51), abierto, cabeza `d2486b45171aac5d3bfe1930c60d2e7503577a17`, rama `feat/g2-alineacion-contrato`. Ya implementa GET `/api/integrations/g2/payments/:id/tax-document?id_empresa=`, bajo key S2S y alcance de empresa. Lee persistencia sin llamar al proveedor y excluye artefactos sandbox. Devuelve `success/data`, estado, motivo, tipo, folio, fecha, estado de correo y URL validada. Todavía no está incorporado a esta rama ni a develop; no se duplicó ni fusionó. El PR también cambia otros contratos G2, por lo que necesita revisión coordinada. Una lectura G2 no debe convertirse en renovación/emisión con efectos secundarios. Queda pendiente acordar vigencia del enlace o entrega del archivo y realizar la prueba desde el portal G2.

**Correo por empresa (Responsable 1).** El MailService actual selecciona un único SMTP global y sendTaxDocument no recibe idEmpresa. Crear otra casilla no enruta los documentos automáticamente por empresa. Coordinar el contrato de selección/remitente por empresa con el responsable SMTP antes de incorporarlo; nunca usar silenciosamente las credenciales de una empresa para la otra. No se cambiaron sus variables persistentes. Después de la revisión local inicial se probó aisladamente la cuenta SMTP de Cable Mágico proporcionada por el usuario: conexión STARTTLS/autenticación PASS y un único correo de prueba aceptado por Gmail, cuya recepción confirmó el usuario el 2026-10-19. La configuración se usó solo en memoria; no se añadió aún soporte para SMTP_COMPANIES ni SMTP_CABLE_MAGICO_*. Ver el checkpoint para el alcance y la evidencia.

**Configuración privada.** Continuar usando exclusivamente los archivos privados ya existentes e ignorados por Git: `.env.facturacion-private` y `.env.smtp-private`. Los ejemplos versionados contienen únicamente nombres/valores ficticios. Mantener `FACTURACION_CL_INTEGRATION_ENABLED=false` y `FACTURACION_CL_DELIVERY_ENABLED=false` en la configuración persistente mientras se completa el alta. No crear variables productivas ni introducir secretos en variables SANDBOX, VITE, documentación o comandos compartidos. Antes del siguiente ensayo se debe definir empresa, ambiente, alcance y destinatario; para una emisión real se requiere autorización específica.

Ver [matriz y pruebas de esta revisión](i3-facturacion-cl-checkpoint.md#revisión-del-encargo-de-ambas-empresas--2026-10-19). Se consolida el encargo en estos dos documentos existentes; no se crearon las cuatro entregas adicionales propuestas por el PDF, carpetas, ramas ni PR.

## Validación FiNet del 2026-10-15

En `SecurityRealiseMatrizQA`, sobre el código publicado `2369db556f4763df0c0469d688a93fe3b3c0ad06`, se verificó también la empresa FiNet del CRM con una cuenta DEMO del proveedor: autenticación REST, abono de 100 sobre cobro de 200, boleta tipo 39 con folio 9300000141, PDF y replay del mismo pago sin segunda emisión. Ver el [detalle del ensayo](i3-facturacion-cl-checkpoint.md#validación-finet-del-2026-10-15).

No fue necesario cambiar el cliente ni duplicar la integración para FiNet: la configuración existente separa empresas, perfiles y credenciales. Las credenciales recibidas para WebService autenticaron también con REST; no se añadió SOAP ni se interpretó el campo Puerto como un puerto TCP. La consulta de versión mantuvo la discrepancia conocida `version:array`; no se presentó como una versión contractual verificada.

La configuración queda exclusivamente en `.env.facturacion-private`, ignorado por Git: perfil sandbox de FiNet preparado, emisión y entrega persistentes en false. La prueba habilitó el módulo solo en el proceso controlado y en una base temporal propia. El uso de una cuenta DEMO desde la empresa FiNet del CRM no certifica el emisor fiscal de FiNet ni habilita producción. El usuario autorizó un único envío del PDF y Gmail lo aceptó mediante STARTTLS autenticado; el estado quedó ENVIADO. Recuperar de nuevo el mismo documento no produjo otro correo ni una nueva boleta. El usuario confirmó el 2026-10-15 la recepción del correo con el PDF adjunto, cerrando la prueba demo del flujo abono, boleta, PDF y correo para FiNet. Los resultados del 2026-10-03 que siguen son históricos.

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

SMTP_HOST/FROM y configuración SMTP; FACTURACION_CL_DELIVERY_ENABLED=true activa entrega. En el ensayo se usó únicamente Mailpit local, sin relay ni entrega externa. El cierre SMTP del 2026-10-04 incorpora TLS/STARTTLS obligatorios fuera de QA local, autenticación, recuperación de correos y conciliación manual auditada: ver [configuración y resultados actuales](i3-smtp-automatic-email.md).

## Persistencia y operaciones

Migraciones aditivas independientes: 20261003010000_i3_tax_emission_intents, 20261003020000_i3_tax_payment_pipeline y 20261004010000_i3_tax_smtp_delivery. Se aplicaron únicamente a fsm_facturacion_local, contenedor/volumen propio; no a Railway ni a una base compartida. No se modificaron la migración G2 ni init-global.sql. El responsable del esquema compartido debe revisar/incorporar las tres antes de un despliegue. Con flag true y tablas faltantes, el módulo rechaza iniciar.

GET /api/tax-documents/payments/:id: estado, folio, enlace, fingerprint y estado PDF/correo, con JWT/rol de cobranza y pertenencia de empresa/cliente.
POST :id/retry: solo FALLIDO + CONFIRMED_NOT_SENT, sin marcador de envío previo.
POST :id/artifacts: recupera PDF/correo pendiente de una intención GENERADO, sin volver a emitir.
POST :id/reconcile: Administrador, fingerprint, folio positivo, confirmSameDocument=true y observación; registra auditoría. El operador debe contrastar en el proveedor tipo, empresa, receptor, importe y referencia del pago. Que exista un PDF con un folio no prueba automáticamente que sea el mismo pago. Con folio automático y resultado incierto, no hay conciliación automática ni reemisión a ciegas.

La pantalla Cobranza → factura → pago permite consultar documento, comprobante, correo y acciones seguras de recuperación. No se añadieron datos del emisor fiscal al formulario de pago.

## Verificación y evidencia

Ver [checkpoint con resultados y G3](i3-facturacion-cl-checkpoint.md), [Docker local](facturacion-cl-local-docker.md) y [capturas](evidencias/facturacion-cl/2026-10-03/README.md). El ensayo del 2026-10-03 registra 264 tests / 24 suites PASS y PostgreSQL real con dispatcher ficticio. La actualización SMTP del 2026-10-04 registra sus pruebas y límites en [su informe](i3-smtp-automatic-email.md).

Fuentes primarias consultadas: [API REST](https://www.facturacion.cl/manualintegracion/apirestintegracion.php), [boleta TXT](https://www.facturacion.cl/manualintegracion/archivoboletaelectronica.php), [factura XML](https://www.facturacion.cl/manualintegracion/archivofacturaelectronica.php). Diferencias observadas del sandbox (RUT corto, link /plano) están descritas aquí, sin alterar ni atribuirlas al ejemplo del manual.
