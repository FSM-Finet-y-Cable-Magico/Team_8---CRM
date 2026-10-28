# Facturación.cl: emisión por pago y preparación productiva

## Candidato auditado para publicación — 2026-10-28

Se preparó el commit de producción controlada para SecurityRealiseMatrizQA, con merge a develop posterior y separado. La auditoría encontró y corrigió una ruta de recuperación manual que no comparaba el perfil tributario original del trabajo: ahora un cambio de perfil bloquea recuperación/conciliación antes de consultar un folio de otro emisor. La rotación de credenciales del mismo perfil sigue permitida; ocho casos nuevos cubren ambos ambientes.

Regresión con dependencias exactas en laboratorio sin privados y con red interna: 852 PASS, cero FAIL, nueve omitidas. Build/lint backend, build frontend y Prisma PASS. PostgreSQL temporal: 16 PASS, quince solapados y un caso integrado adicional; cobertura única 853 PASS y ocho omitidas restantes, sin sumarlas dos veces. Migración aplicada únicamente al fixture temporal. Detalles, límites y huella del candidato en el checkpoint.

Perfiles locales completos: ambas empresas con boleta 39, IVA incluido, IndServicio 3 y UTF-8. Los accesos privados no se publican ni se cargan automáticamente desde Git. Los flags y empresas siguen desactivados, Railway intacto. Publicar la preparación no activa emisión, despliega, aplica migraciones compartidas o hace merge. RELEASE_READY continúa false hasta las comprobaciones del entorno final.

## Estado vigente: perfiles completos de FiNet y Cable Mágico — 2026-10-28

El usuario confirmó boletas tipo 39 con IVA incluido e IndServicio 3 para ambas empresas. FACTURACION_CL_PROFILES del privado productivo existente contiene ahora los dos perfiles completos y approved:true: BOLETA, tipoDte 39, serviceIndicator 3, encoding utf8 y RUT normalizado de su propio bloque de API. Se retiraron los borradores obsoletos. No se alteraron las credenciales ni otras variables activas.

Parser del backend, resolutor real de credenciales y validador estructural productivo PASS en memoria. Ambas empresas seleccionan su bloque exclusivamente y rechazan las credenciales de la otra. El constructor real conserva el monto bruto de un ejemplo sintético, usa IndMntNeto=0 y no agrega IVA otra vez; folio automático, sin email al proveedor. Sin nuevos archivos, cambios de código, solicitudes externas o acceso a bases en este cierre. No se presenta como Jest/build/regresión completa.

Los accesos reales ya pasaron login y versión 1.2.8.1 con HTTP 200 para ambas empresas en el recorrido anterior de hoy; las credenciales permanecieron iguales. Los PDF de referencia son ambos de FiNet y no muestran IndServicio: el dato 3 proviene de la confirmación del usuario. Ya no falta ese campo para los perfiles.

Los cuatro flags siguen false y ambas empresas enabled:false. approved:true expresa aprobación del perfil local, no activación ni certificación fiscal. Los perfiles están completos para la preparación; Railway y la emisión permanecen sin activar. Sigue la revisión del candidato/esquema y carga privada en el entorno final antes del despliegue. No se aplicaron migraciones, iniciaron servicios, hicieron commits, push, PR o merges. Detalle actual y alcance de las verificaciones en el primer apartado del checkpoint.

## Actualización vigente de Cable Mágico — 2026-10-28

Cable Mágico (idEmpresa 2) ya autentica mediante el bloque privado corregido por el usuario: POST /login PASS, HTTP 200. El lector real de esta rama consultó GET /wsds/version con su token en memoria: PASS, HTTP 200, versión 1.2.8.1. FiNet queda fuera de esta comprobación y los fallos del 22-10 conservados más abajo son históricos para Cable Mágico.

Se corrigió una incompatibilidad limitada a la lectura de versión. El proveedor devolvió un array con un único string numérico; ahora tanto FacturacionClReadClient como verify-test-api aceptan esa forma además del string documentado y conservan version:array como evidencia. No se aceptan listas ambiguas, valores arbitrarios o HTTP fallidos. No se tocaron controles de emisión ni valores privados.

Dos recorridos reales en total, cada uno con un login y una consulta de versión; el segundo usó el lector del CRM y permitió contrastar el comprobador contra las mismas respuestas en memoria sin conexiones adicionales. Sesenta comprobaciones locales dirigidas PASS (22 del comprobador y 38 del lector real con Node); Jest y build/lint completos no se ejecutaron por falta de dependencias locales y Docker apagado. Los resultados generales del 22-10 son históricos y no equivalen a validar otra vez toda la rama.

No hay perfil fiscal aprobado para Cable Mágico en FACTURACION_CL_PROFILES; los cuatro flags siguen false y no se habilitó emisión. Login PASS no acredita identidad fiscal ni autorización de boletas productivas. Faltan los parámetros aprobados del perfil y la revisión del entorno/esquema final. Cero documentos, correos nuevos o bases consultadas; Railway y los tres privados intactos. Sin nuevos archivos/carpetas, stage, commit, push, merge o PR. Detalle de solicitudes, pruebas y límites en el inicio del checkpoint.

Actualización de diagnóstico del 22-10: una consulta adicional de login por empresa permitió recuperar el mensaje saneado **«Clave de empresa no es valida.»**, HTTP 200 y sin token para ambas. No se cambiaron valores, código ni políticas; cero emisiones. Corresponde confirmar la clave de integración asociada a cada RUT con su administrador/proveedor, sin deducir el ambiente por el nombre de usuario ni cambiar SMTP/Railway. La evidencia y el número de solicitudes están al inicio del checkpoint. Los diagnósticos posteriores de este documento conservan su alcance histórico.

## Aclaración vigente de accesos y activación — 2026-10-22

El usuario confirmó que los bloques guardados son los accesos productivos recibidos. Se registra su declaración sin reclasificarlos como DEMO por el nombre de usuario. El rechazo por DEMOFE de nuestro verificador es una precaución local; no identifica por sí solo el ambiente remoto.

El diagnóstico independiente de solo autenticación con los valores guardados, seguido de la inspección saneada de la forma de respuesta, devolvió para ambas empresas HTTP 200 con error:string y sin token esperado o alternativo. No se consultó versión ni se emitió. Fueron cuatro logins en total, sin otras combinaciones ni reintentos automáticos; no se guardaron cuerpos remotos, valores o tokens. Los privados y flags no se modificaron. Este resultado acredita un fallo del login según el contrato esperado, no su causa ni la naturaleza fiscal de la cuenta.

Antes de otra conexión corresponde confirmar la habilitación REST y el bloque API completo de cada emisor con el administrador/proveedor, o recibir una corrección contractual. No se debilitan controles ni se pide sustituir claves solo por el nombre. SMTP de ambas empresas está verificado y la preparación de código/migración sigue probada localmente. El perfil inicial será de boleta según elección previa; sus parámetros deben confirmarse y no requiere un rango de factura. Procedimiento, consulta sin secretos y pendientes de entrega en [preparación de producción](i3-production-deployment-readiness.md). Railway permanece intacto; sin commit/push/PR.

## Estado vigente: preparación productiva local verificada — 2026-10-22

**Alcance completado: preparar el código y la migración para ambos ambientes, sin datos reales ni activación.** Los apartados posteriores son registros históricos de las etapas anteriores; sus bloqueos absolutos de producción describen el código que existía en esas fechas. El estado vigente es el de este apartado y del checkpoint del 22 de octubre. Preparación local no equivale a despliegue, certificación fiscal ni acceso productivo verificado.

### Código y controles

- Configuración, dispatcher, persistencia y recuperación admiten sandbox y production. Producción exige además FACTURACION_CL_PRODUCTION_ENABLED=true, integración habilitada, empresa habilitada, perfil aprobado, credenciales de su ambiente y esquema compatible. Los valores persistentes de esta PC siguen deshabilitados.
- Cada empresa usa exclusivamente su bloque PRODUCTION_CREDENTIALS o SANDBOX_CREDENTIALS según el ambiente. No hay fallback entre empresas o ambientes. En producción se exige RUT válido y coincidente con el perfil; se rechaza el usuario DEMO conocido como medida local de seguridad. Un login o READY_PRODUCTION solo acredita la comprobación técnica correspondiente, nunca certificación del emisor.
- El trabajo conserva su ambiente desde la transacción de pago. Claims, huella, envío, recuperación, consultas de folio y trabajador se delimitan por empresa/ambiente. Cambiar la configuración detiene el procesamiento de trabajos del otro ambiente con ENVIRONMENT_CHANGED; el historial se consulta con el ambiente almacenado. No se transforma un pago anterior para volver a emitirlo.
- Se conservan PER_PAYMENT_V1, la unicidad del pago, la marca durable previa al procesamiento, el bloqueo de resultados inciertos y la entrega del PDF sin nueva emisión. SMTP mantiene la selección por empresa y la ausencia de fallback global.
- El validador productivo comprueba estructura y activación explícita; el frontend distingue configuración productiva de pruebas. Los dos Compose locales transmiten las variables y validan con datos sintéticos. docker-compose.railway.yml permanece intacto.

### Migración autorizada y ensayada

El usuario autorizó crear únicamente [la migración 20261022010000_i3_tax_production_preparation](../backend/prisma/migrations/20261022010000_i3_tax_production_preparation/migration.sql) y su carpeta. Se creó y se aplicó exclusivamente en PostgreSQL temporal con datos ficticios. No se editaron migraciones históricas, modelos Prisma ni esquemas compartidos.

~~~sql
BEGIN;
ALTER TABLE tax_payment_job DROP CONSTRAINT tax_payment_job_ambiente_check;
ALTER TABLE tax_payment_job ADD CONSTRAINT tax_job_environment_check
  CHECK (ambiente IN ('sandbox', 'production'));
DROP INDEX tax_job_reserved_folio_key;
CREATE UNIQUE INDEX tax_job_reserved_folio_key
  ON tax_payment_job (id_empresa, ambiente, tipo_dte, folio_esperado)
  WHERE folio_esperado <> '0';
COMMIT;
~~~

La tabla de intenciones ya admitía ambos ambientes. El cambio conserva id_pago único y las filas sandbox existentes; los folios reservados se distinguen por empresa, ambiente y tipo DTE. La prueba comprobó preservación de la fila anterior, separación de folios y rechazo de duplicados y ambientes desconocidos. El arranque productivo requiere la nueva restricción y el índice válido con las cuatro columnas esperadas. Antes de aplicarlo fuera del laboratorio, el responsable del esquema debe revisar el estado real y las migraciones pendientes; no ejecutar despliegues de migraciones indiscriminadamente.

### Evidencia de esta etapa

Regresión 2026-10-22T18:05:53.706Z (15:05 America/Santiago): **826 PASS, cero FAIL, nueve omitidas**. Build y lint backend, build frontend, Prisma validate/generate y los dos Compose locales PASS. Ensayo adicional con PostgreSQL real temporal: 16 PASS, cero FAIL; quince se solapan con la regresión y uno es el caso integrado opt-in ejecutado por separado. Por tanto, no sumar 826 + 16: quedan ocho casos opt-in ajenos sin ejecutar.

El ensayo integrado utilizó dos empresas ficticias, transporte fiscal simulado, PDF ficticio y correo simulado. Verificó pago → intención → procesamiento → recuperación PDF → entrega, concurrencia/repetición sin duplicar, aislamiento por empresa, timeout incierto sin reenvío y cambio de ambiente sin reprocesar. No es evidencia de emisión tributaria ni de recepción SMTP externa.

Gitleaks sobre el diff y la nueva migración PASS; búsqueda literal de los secretos privados actuales en los archivos versionados y la migración: cero coincidencias. Los tres privados están ignorados y no versionados; no se imprimieron sus valores. Esta revisión no certifica todo el historial Git. Código/configuración/migración actuales coinciden con los 26 archivos probados; detalles y hashes en el checkpoint.

### Comprobación posterior de SMTP, sin mensaje

El 22-10 a las 15:50 America/Santiago quedó registrada la autenticación SMTP de FiNet y Cable Mágico con los bloques privados completados manualmente. Dos conexiones STARTTLS con verificación de certificado y cero mensajes. Solo se completaron los dos HOST Gmail públicos que seguían vacíos; no se cambiaron claves ni se copiaron a fuentes/argumentos. Se ejecutó el código actual de MailService en memoria con Nodemailer 10.0.14, sin cargar el backend completo, bases de datos ni configuración fiscal. Detalles en el inicio del checkpoint.

Los bloques locales están listos para autenticar; el despliegue debe cargar esas variables en el backend autorizado. Esta comprobación no certifica recepción en bandeja ni activa Facturación.cl. Railway sigue intacto por decisión del usuario. Sin nuevos archivos, contenedores, commit, push o PR.

### Activación posterior, fuera de este ensayo

Falta verificar los accesos API propios y el emisor de cada empresa en el ambiente autorizado; aprobar perfiles, DTE/folios y la regla fiscal; cargar en el entorno acordado las variables SMTP prefijadas ya verificadas localmente; revisar y aplicar el esquema en el entorno acordado, y coordinar la integración/consumo G2. Los logos y las muestras corporativas del proveedor conservan sus pendientes externos. La activación y el primer ensayo externo requieren un alcance acordado por separado. No se usaron datos de clientes, Railway, emisiones reales ni correos externos en esta etapa.

La revisión automática rechazó cargar archivos privados desde docker-compose.railway.yml por riesgo de exponer credenciales y por falta de autorización específica para ese archivo. La propuesta no se aplicó. Para revisión futura, consistiría únicamente en añadir al backend, junto al env_file existente, entradas opcionales path/required:false para .env.smtp-private y .env.facturacion-production-private; sin copiarlos a imágenes, mostrarlos, iniciar servicios ni ejecutar SQL. Antes de usar esa vía debe confirmarse dónde se ejecutará Compose y la disponibilidad de los privados allí. Después de revisar la recomendación, el usuario decidió mantener Railway intacto. La propuesta queda fuera del alcance actual; se continúa con los campos privados y las verificaciones locales, sin modificar esa configuración ni el entorno Railway. La matriz de configuración manual vigente está en el checkpoint.

Sin stage, commit, push, PR ni merge en esta etapa; HEAD continúa 3d2c2ed9e93ef77ce266633e8270aeeb1a738c4b en SecurityRealiseMatrizQA.

## Preparación de accesos productivos — 2026-10-22

El usuario confirmó que desea preparar producción y autorizó crear los privados necesarios. Se creó únicamente .env.facturacion-production-private en la raíz, ignorado por Git, fuera de los contextos Docker actuales y con seis campos vacíos: usuario, rut y clave de API de Ambiente Producción para FINET y CABLE_MAGICO. No se copiaron credenciales del chat, SMTP ni sandbox; los privados anteriores se conservaron.

Este archivo prepara una comprobación independiente. No habilita la emisión productiva del CRM: configuración, emisor y persistencia conservan sus bloqueos. Los flags INTEGRATION_ENABLED, DELIVERY_ENABLED y PRODUCTION_PREFLIGHT_ENABLED permanecen false en la plantilla. La comprobación puede habilitarse únicamente en el proceso de verificación una vez completados los campos, sin cambiar flags persistentes de emisión.

La herramienta existente tools/facturacion-cl-sandbox/verify-test-api.mjs admite ahora --production-company 1 o --production-company 2. Carga exclusivamente PRODUCTION_PREFLIGHT_COMPANIES y el secreto PRODUCTION_CREDENTIALS de la empresa seleccionada; nunca toma credenciales SANDBOX o de otra empresa. Solo llama a POST /login y GET /wsds/version con destino fijo, TLS y sin redirects/reintentos. No usa base de datos, folios, /procesar, recuperación de PDF ni SMTP.

El resultado muestra environmentEvidence=OPERATOR_DECLARED, issuerIdentityVerified=false, productionReady=false y cero solicitudes de emisión. Un login correcto prueba autenticación, no la identidad fiscal ni la habilitación de documentos. La cuenta DEMO conocida se rechaza antes de conectar aunque se etiquete como producción. La discrepancia version:array conserva el estado UNEXPECTED_RESPONSE.

Pruebas del verificador: 19 PASS, cero FAIL, incluidas 14 nuevas sobre producción; credenciales ficticias, cero accesos al proveedor. La regresión general y su resultado actual se registran en el checkpoint. Falta que el usuario complete manualmente los accesos productivos y que se confirmen perfil fiscal, DTE/folios, esquema compartido, contrato G2, diseño PDF y alcance de la primera operación real. Este avance no elimina esos requisitos ni declara producción habilitada.



### Carga manual y comprobación de accesos — 2026-10-22

El usuario confirmó haber guardado los accesos. En los dos bloques se habían reemplazado los nombres de las propiedades JSON por los datos, dejando valores vacíos. Se normalizó únicamente ese formato dentro del mismo privado, conservando exactamente usuario/RUT/clave introducidos; se añadieron comillas externas seguras para dotenv. No se copiaron secretos a otros archivos ni se crearon respaldos.

| Empresa | Resultado de la comprobación sin emisión |
| --- | --- |
| FiNet | DEMO_CREDENTIALS_NOT_PRODUCTION. La identidad introducida coincide con la cuenta DEMO conocida; se rechazó antes de conectar. Login y versión no ejecutados. |
| Cable Mágico | Login FAIL, HTTP 200, sin token válido según el contrato esperado; versión NOT_RUN. No se acredita autenticación ni ambiente fiscal a partir del estado HTTP. |

El preflight se habilitó solamente en el proceso hijo; los tres flags persistentes continúan false. Cero solicitudes de emisión, correos, conexiones a base de datos o Railway; no hubo reintentos ni pruebas con otras combinaciones. No se imprimieron cuerpos remotos, credenciales ni tokens.

Siguiente paso: sustituir manualmente el acceso DEMO de FiNet por el de API de Ambiente Producción y verificar/copiar nuevamente el acceso API de Cable Mágico desde su sección de credenciales. El resultado de Cable Mágico no permite afirmar por sí solo si la causa es la clave, el usuario/RUT, permisos o una discrepancia contractual. Mantener la emisión bloqueada hasta resolver la autenticación y el resto de requisitos productivos. No se desplegó, emitió, hizo commit/push ni creó PR en esta comprobación.



### Aclaración del DEMO y datos empresariales posteriores — 2026-10-22

El usuario reenvió los dos mensajes del proveedor: contienen el mismo acceso DEMO y el mismo portal de consulta. También aportó razón social, RUT y dirección de ambas empresas y un correo comercial de Cable Mágico. Se validó el dígito verificador de los dos RUT empresariales y se contrastaron en memoria con los campos introducidos; no se guardaron esos datos fiscales ni secretos nuevos en fuentes versionadas.

Se ejecutó una comprobación adicional estrictamente de autenticación/versión, sin emitir:
- DEMO compartido, usando el privado sandbox existente: login PASS, HTTP 200. Versión HTTP 200, UNEXPECTED_RESPONSE con forma version:array; se conserva la discrepancia contractual.
- FiNet empresarial: el usuario DEMO combinado con el RUT empresarial sigue rechazado localmente por DEMO_CREDENTIALS_NOT_PRODUCTION, antes de conectar. Este resultado no es un rechazo de contraseña por el proveedor.
- Cable Mágico empresarial: se descartó únicamente el formato con puntos del RUT, sin modificar el archivo ni la identidad; login FAIL HTTP 200, sin token, versión NOT_RUN. No se probaron otras contraseñas ni combinaciones.

Las credenciales DEMO sí autentican en el servicio. Eso no demuestra acceso productivo a los emisores reales, y reemplazar el RUT del acceso DEMO por el RUT fiscal de una empresa mezcla identidades. Los nombres, domicilios y RUT fiscales permiten preparar la identidad empresarial, pero no reemplazan las credenciales API entregadas para ella.

El manual oficial diferencia acceso API, acceso web y ambientes, y describe el campo Puerto de SOAP para impresión automática; el cliente actual usa REST. No se cambia el protocolo para eludir el resultado de autenticación. Pendiente confirmar con proveedor/administrador el bloque completo de API de Ambiente Producción de cada emisor y su habilitación. Los flags siguen false: cero nuevas emisiones, correos o conexiones a Railway; no se modificaron privados en esta comprobación.


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
