# Firma de contratos por correo

Estado: implementación para revisión en una rama independiente. CONTRACT_SIGNATURE_ENABLED=false por defecto. La publicación de esta rama fue autorizada después de la auditoría; no autoriza PR, merge, despliegue, migración compartida ni activación.

## Qué se implementa

La generación del PDF utiliza buildContractSnapshot como puerta única de lectura. El flujo manual conserva su funcionamiento. La firma por correo usa el mismo PDF revisado, sin regenerar sus páginas: conserva el original y agrega una hoja de constancia con pdf-lib. Es aceptación mediante correo y código de un solo uso; no implementa certificado de firma avanzada ni acredita por sí sola que el titular del correo sea una persona determinada.

La solicitud conserva el PDF original, los datos que lo originaron, el PDF con constancia y las huellas en una única tabla G8. Los PDFs de firma no dependen del disco efímero de la aplicación. Este almacenamiento también contiene datos personales y exige acceso restringido, respaldo, recuperación y política de conservación aprobada antes de uso real.

La generación con firma habilitada prepara un borrador. Al enviar se comprueban destinatario, datos obligatorios, correspondencia con el PDF y empresa. Si el PDF fue generado antes de activar la función debe regenerarse para disponer de snapshot. Los datos técnicos opcionales inválidos se omiten en la generación histórica; para firma se exige corregirlos antes de enviar.

El enlace personal usa un fragmento de URL; no se transmite en la ruta, query, Referer o logs de acceso. La página lo mantiene solo en memoria y lo retira de la barra. No hay JWT ni cookies en las llamadas públicas. El token aleatorio tiene 256 bits y solo se guarda su SHA-256. El código tiene seis cifras, caduca a los diez minutos y se almacena con HMAC usando un secreto independiente. El enlace vence a las 48 horas. Hay cinco envíos y cinco errores de código por solicitud, espera de 60 segundos y un límite por IP de 30 llamadas/minuto por proceso. Los límites de código son persistentes y se conservan con múltiples instancias; el límite general por IP debe complementarse en el proxy.

Antes de aceptar se exige descarga del PDF, la huella calculada por el navegador, consentimiento explícito y código correcto. La versión del consentimiento incluye la huella de su texto; un cambio no se acepta desde una página abierta con la versión anterior. Se releen los datos y la versión; cualquier cambio relevante anula la solicitud sin sobrescribir el contrato. Una nueva versión o firma manual invalida las solicitudes pendientes. La firma, estado comercial y auditorías se guardan en la misma transacción. Los conflictos serializables se reintentan de forma limitada.

SMTP queda fuera de la transacción. Una firma confirmada no se revierte porque falle el correo. El envío del documento firmado tiene una toma de trabajo persistente: repetir la firma no vuelve a emitirlo. Un resultado SMTP incierto queda identificado para revisión; no hay reenvío automático que pueda duplicar mensajes.

## Rutas

JWT y roles: GET/POST /api/contracts/:id/signature, PATCH /api/contracts/:id/signature/cancel y GET /api/contracts/:id/signature/download.

Públicas: POST /api/contract-signatures/view, /pdf, /code y /sign. El token va en el cuerpo y nunca se registra. El estado interno no devuelve el enlace ni el código. La página es /firmar y las llamadas públicas no llevan la sesión del CRM.

## Preparación privada

No se creó ningún archivo privado nuevo ni se leyeron credenciales existentes. Completar manualmente la configuración del backend en el archivo privado que el operador ya utiliza; nunca versionarlo:

- CONTRACT_SIGNATURE_ENABLED=false durante revisión.
- CONTRACT_SIGNATURE_PUBLIC_URL: origen HTTPS real del CRM, sin ruta, query o credenciales.
- CONTRACT_SIGNATURE_COMPANIES: lista JSON de IDs de empresas autorizadas, por ejemplo [1,2].
- CONTRACT_SIGNATURE_OTP_SECRET: 32 bytes aleatorios representados por 64 dígitos hexadecimales. Crear con node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))" únicamente en una terminal privada. No enviar el resultado al chat.
- SMTP_COMPANIES y SMTP por empresa: se reutiliza la configuración privada existente, sin copiar valores al repositorio.
- CONTRACT_SIGNATURE_LEGAL_APPROVED y CONTRACT_SIGNATURE_EVIDENCE_BACKUP_CONFIRMED quedan false hasta que existan las aprobaciones.

Cambiar el secreto invalida códigos pendientes; se debe coordinar su rotación. MAIL_PROVIDER=mock solo permite completar firma en NODE_ENV=test. En producción se exige smtp, HTTPS y ambos acuerdos de activación.

## Ensayo y activación

Aplicar la migración 20261110010000_i4_contract_signature únicamente a una base temporal nueva. El canónico suma una tabla; no cambia columnas existentes. No aplicar aquí a Railway o VPS. Ejecutar la regresión, auditoría Prisma/global y la prueba optativa de PostgreSQL con marcador de base aislada.

Antes de habilitar datos reales: obtener revisión de esquema de todos los grupos; configurar responsables y protección de ramas; verificar permisos mínimos del rol G8; ensayar respaldo y restauración de la nueva tabla; acordar conservación y acceso a evidencias; revisar el texto de consentimiento con el responsable legal; verificar remitentes y dominio HTTPS; aprobar el procedimiento de incidentes de SMTP incierto. La plantilla de WhatsApp y Meta queda fuera de esta entrega, pendiente de su aprobación externa.

La instalación se solicita mediante el flujo existente después de la firma. Firmar no crea OT ni toca inventario o activa servicio automáticamente. El equipo debe probar ese recorrido en sus portales y aprobar su visualización.

Referencias técnicas: [PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument) y [protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Repetir PostgreSQL QA

`npm run test:signature:postgres` requiere NODE_ENV=test, QA_CONTRACT_SIGNATURE_DB_URL y QA_CONTRACT_SIGNATURE_RUN_ID del clúster temporal. El nombre debe ser qa_contract_signature_<marcador hexadecimal de 32 caracteres>, rol qa_contract, host loopback y puerto 5432; el servidor debe tener qa_signature.run_id con el mismo marcador. El spec verifica además base vacía y no utiliza DATABASE_URL. El procedimiento automatizado de este trabajo preparó un PostgreSQL 15 exclusivo, cargó el canónico anterior y después la migración aditiva. No reutilizar una base compartida ni cambiar estos controles para hacer pasar la prueba. Las credenciales de QA se generan al ejecutar y desaparecen al eliminar el contenedor.

## Auditoría de cierre local del 9 de noviembre de 2026

Rama: feat/firma-contratos-fase-0. Base: develop en 57789765550173b65a5777fd3d1d2ab4a2457b51. La auditoría se realizó antes del commit y la publicación de la rama; sus referencias de publicación se consultan en Git. No se abrió PR ni se autorizó merge. Las referencias de los planes no se modificaron.

| Fase | Estado verificable | Pendiente |
|---|---|---|
| A Controles del repositorio | Workflow preparado y comandos comprobados localmente | Ejecutar el workflow en GitHub tras revisión; configurar usuarios reales en CODEOWNERS y protección de ramas. La conexión de GitHub respondió 403 al consultar permisos. |
| B Coordinación | Reglas y ownership documentados a partir de ownerOf() | Aprobación del esquema y responsables de G1, G2, G3 y G8. |
| C Datos y PDF | Pruebas de datos válidos, ausentes, mal formados y separación por empresa | Recorrido visual de aceptación del equipo en su ambiente aprobado. |
| D Lectura única | buildContractSnapshot alimenta generación y verificación | Ninguna tarea de desarrollo local pendiente en esta fase. |
| E Firma manual | Estado comercial, cliente/prospecto y auditoría transaccionales; repetición protegida | Publicación y despliegue después de revisión. |
| F Firma por correo | Backend, pantalla pública, solicitud interna, correo, límites, snapshot y constancia probados en base exclusiva | Revisión del esquema, parámetros privados y aprobaciones de activación. WhatsApp/Meta no implementado; queda para una plantilla aprobada. |
| Activación real | Desactivada por defecto; puertas de configuración y documentación preparadas | Instalación aprobada de la migración, permisos mínimos G8, respaldo/restauración, conservación y revisión del consentimiento. |

Resultados finales:

- Backend completo: 93 suites y 1752 pruebas aprobadas, sin fallos. Hay 35 pruebas optativas omitidas en esa ejecución: las 26 de firma se ejecutaron aparte en PostgreSQL exclusivo y las otras 9 dependientes de otros ambientes no se ejecutaron.
- Firma con PostgreSQL 15 real: 26 pruebas aprobadas, incluyendo ambas empresas, identidad compartida, concurrencia entre dos clientes Prisma, códigos, expiración, rollback, índice parcial, CHECK de evidencia y correo incierto. Los transportes de correo son simulados; esta prueba no acredita entrega SMTP real ni validez legal.
- Frontend: 151 pruebas aprobadas, incluidas descarga con huella, consentimiento y bloqueo de un PDF alterado.
- Herramientas globales: 37 pruebas aprobadas. Runtime del frontend: 3 pruebas aprobadas.
- Compilación de backend y frontend aprobada. ESLint en los archivos de aplicación modificados y contratos aprobado sin avisos. git diff --check aprobado.
- La proyección Prisma no tiene divergencias bloqueantes. Los objetos físicos externos, índices parciales y relaciones fuera de la proyección conservan sus diferencias documentadas; no se eliminan para hacer pasar la auditoría.
- Migración ensayada desde el canónico anterior y repetida en una base temporal. Los bytes completos del esquema previo se conservaron; solo se añadió la propuesta G8.
- PDF original y constancia de dos páginas renderizados y revisados visualmente con datos ficticios. El original conserva su huella y el resultado agrega una sola página.
- No se usaron credenciales privadas ni se modificaron servicios existentes, despliegues, VPS o Railway. Las plantillas .env contienen campos SMTP vacíos y parámetros de firma desactivados. Los archivos privados siguen ignorados por Git.

Para que el nuevo control automático pase con la base actual se corrigió una simulación de categorías en la prueba HTTP de tickets; no se modificó la lógica productiva de tickets. Se sustituyeron cinco etiquetas visibles que exponían códigos de grupos por nombres del portal y de la solicitud de instalación; sus acciones y permisos permanecen iguales.

Antes de publicar conviene revisar por separado la migración y el esquema, y después la aplicación. Este informe no acredita aprobación de otros grupos, protección activa de GitHub, configuración privada completa, envío real de correo de firma, pruebas en portales ajenos ni activación tributaria o contractual real.

## Configuración manual después de la revisión

Para mantener separadas las claves, el operador puede crear manualmente `C:/Users/lenovo/Desktop/Team_8---CRM/.env.signature-private`; se verificó que Git lo ignora. No se creó ese archivo ni se completó ningún secreto durante este trabajo. Copiar únicamente las variables CONTRACT_SIGNATURE de las plantillas públicas y completar URL, empresas y secreto de firma en privado, dejando ENABLED=false y ambos acuerdos de activación en false durante la preparación. SMTP sigue en sus archivos privados existentes; no copiarlo al frontend ni usar variables VITE para claves.

El nombre del archivo no hace que Docker lo lea automáticamente. En el despliegue aprobado, el operador debe pasar esas variables al backend mediante su configuración privada de entorno o un override revisado. Los Compose de Railway y de la VPS se dejaron intactos. Antes de habilitar hay que verificar la migración y permisos en el ambiente aprobado; no basta con cambiar el flag.

En la demostración: generar PDF, enviar desde la ficha, abrir el enlace del correo, descargar y revisar, solicitar código, aceptar y firmar. Reabrir o actualizar la ficha del contrato para consultar el estado y descargar la constancia. La preparación de instalación se realiza después mediante el recorrido que ya existe.

Cierre de temporales confirmado: se eliminaron los dos contenedores exclusivos de QA y los PDF/PNG temporales de inspección. Los servicios locales existentes continuaron en ejecución. No se conservaron los clientes, contratos o credenciales sintéticas de ese entorno.

## Publicación para revisión

Se autorizó publicar únicamente feat/firma-contratos-fase-0. En la comprobación previa, origin/develop apuntaba a 57789765550173b65a5777fd3d1d2ab4a2457b51 y origin/main a 5801f8be9e20b683854122e1b389bb0b0b74e2f1. Sus árboles eran idénticos: main solo añadía el commit de merge del PR 73. Publicar esta propuesta no activa la firma ni acredita las aprobaciones pendientes.
