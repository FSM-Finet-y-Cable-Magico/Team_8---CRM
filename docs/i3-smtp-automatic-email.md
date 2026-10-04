# SMTP y correo automático - cierre técnico local

Fecha: 2026-10-04. Rama: `feat/i3-facturacion-cl`. Base de continuación: `db5093ee7f2f268a183487b5b17794254c04ace5`.

El envío automático y su recuperación quedaron implementados y verificados en Docker localhost. **La cuenta SMTP externa sigue pendiente**: el usuario pidió avanzar todo lo posible y publicar la rama, sin aportar servidor/cuenta. Este resultado no acredita entrega a una casilla externa ni habilita producción fiscal o G3.

## Comportamiento

Se sustituyó el cliente SMTP escrito a mano por Nodemailer 10.0.14. El mismo servicio conserva las cotizaciones y los documentos tributarios, con PDF en memoria. No lee adjuntos desde rutas o URLs ni registra el diálogo SMTP o las credenciales. Una dirección única y un nombre de archivo validado impiden añadir destinatarios o comandos a través de campos del formulario.

SMTP admite TLS desde la conexión (habitualmente 465) o STARTTLS obligatorio (habitualmente 587). Se verifican certificado y nombre del servidor, con TLS mínimo 1.2. Un certificado no confiable, la falta de STARTTLS o una autenticación rechazada detienen el envío. `SMTP_REJECT_UNAUTHORIZED=false` es rechazado. El único modo sin cifrado exige autorización explícita de configuración, destino loopback/Mailpit, ausencia de autenticación y entorno distinto de producción.

Antes de enviar se verifica conexión/TLS/autenticación sin DATA. Esta comprobación no prueba que el proveedor acepte un remitente o que el mensaje llegue a la bandeja del destinatario. El resultado ENVIADO corresponde a aceptación SMTP; la entrega real se confirma por separado.

Para el DTE ya GENERADO, PostgreSQL conserva claim, contador y próxima fecha de correo. El trabajador revisa pendientes cada 15 segundos; un fallo temporal confirmado como no aceptado programa hasta tres intentos totales, con esperas de 60 y 300 segundos. Dos procesos o reinicios no envían simultáneamente el mismo correo. Message-ID es estable por intención, pero no se lo considera una garantía de deduplicación del proveedor.

Un corte/timeout durante el envío sin respuesta final queda RESULTADO_INDETERMINADO, aunque la biblioteca identifique el error como CONN. Un claim abandonado por cinco minutos también queda por verificar. No hay reenvío automático de esos casos. La pérdida de QUIT después de la aceptación no convierte el correo en fallido.

Rechazos definitivos o agotamiento de intentos quedan FALLIDO. El usuario con permiso de cobranza puede recuperar el correo después de corregir la causa; ese paso usa la boleta existente y conserva el contador total. Si falló la descarga del PDF, queda visible para recuperación explícita. No hay reemisión de DTE, cambio del pago ni del saldo desde esta etapa.

## Verificación realizada

| Ensayo | Resultado |
|---|---|
| Mail, emisor, Billing y prospectos | 191 pruebas / 15 suites PASS |
| Regresión G2, G3, CU-86 y autenticación entre grupos | 201 pruebas / 14 suites PASS; 4 pruebas PostgreSQL de otra configuración quedaron omitidas |
| Sockets locales TLS + STARTTLS con AUTH | PASS; certificado/nombre verificados y credenciales solo después del cifrado |
| Certificado no confiable, hostname incorrecto, ausencia de STARTTLS, AUTH rechazada | Bloqueados antes de DATA |
| Rechazo RCPT 450/550 y DATA 451, timeout/corte, pérdida de QUIT | Clasificación y límites PASS |
| PostgreSQL real + Mailpit real | Recuperación tras fallo temporal inyectado y reinicio; dos procesos concurrentes; un mensaje con un adjunto |
| Repetición tras envío | Sin segundo correo; documentos anteriores conservados |
| TypeScript backend/frontend, ESLint, Prisma y diff check | PASS |

La prueba PostgreSQL/Mailpit usa **documento y proveedor simulados para QA SMTP**. El PDF declara que no tiene valor tributario. El fallo inicial fue inyectado; la aceptación y recepción posterior en Mailpit sí fueron reales. Se ejecutó con el backend habitual detenido para evitar trabajo ajeno. Se limpiaron únicamente las filas sintéticas de ese ensayo; se conserva el correo en el buzón local y su captura. Cero llamadas al proveedor fiscal y cero emisiones nuevas.

La boleta `9234371045` emitida en la API PRUEBAS el 2026-10-03 conserva su estado. No se reutiliza la captura nueva como evidencia de una segunda emisión. Las pruebas de G3 usan respuestas ficticias y no acreditan que G3 haya recibido una orden.

[Evidencias del ensayo SMTP](evidencias/smtp/2026-10-04/README.md).

## Configuración externa pendiente

El responsable debe aportar servidor, puerto, cuenta y remitente autorizado. La contraseña de aplicación o credencial SMTP se guarda solo en variables privadas del backend; no es la contraseña de Facturación.cl. El alcance actual es usuario/contraseña SMTP y selección AUTH compatible. OAuth2 no está configurado; si el proveedor exige OAuth2, requiere una configuración adicional antes de conectarlo.

Ejemplo sin secretos, para STARTTLS:

```dotenv
SMTP_HOST=smtp.del-proveedor
SMTP_PORT=587
SMTP_SECURE=false
SMTP_STARTTLS=true
SMTP_REJECT_UNAUTHORIZED=true
SMTP_ALLOW_INSECURE_LOCAL=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_FROM_NAME=CRM FiNet
SMTP_HELO=crm-finet.local
SMTP_TIMEOUT_MS=15000
```

Para TLS implícito: puerto 465, `SMTP_SECURE=true`, `SMTP_STARTTLS=false`. Para una CA privada confiable pueden configurarse `SMTP_TLS_CA` (PEM o saltos `\n`) y `SMTP_TLS_SERVERNAME`; se conserva la verificación del certificado. No usar los certificados de `src/mail/fixtures` fuera de los tests.

El envío de DTE requiere además `FACTURACION_CL_DELIVERY_ENABLED=true` y el perfil sandbox aprobado de su empresa. SMTP_HOST vacío desactiva el transporte. Los defaults publicados permanecen vacíos/deshabilitados; la excepción Mailpit está solo en el archivo privado local.

## Comprobación operativa

Desde la raíz del repositorio, después de instalar dependencias:

```powershell
npm run build -w backend
# Archivo privado ignorado por Git; sin contraseña en argumentos.
node --env-file=.env.smtp-private backend/scripts/check-smtp.cjs
```

El comando comprueba conexión, cifrado y autenticación **sin enviar un mensaje**. No llamar a esta comprobación desde el arranque. Solo para una prueba solicitada hacia un destinatario concreto:

```powershell
node --env-file=.env.smtp-private backend/scripts/check-smtp.cjs --send-test-to destinatario-autorizado@dominio
```

Ese mensaje de texto indica que es una prueba SMTP y no es un cobro/DTE. La aceptación SMTP no se reporta como entrega externa verificada.

La migración aditiva `20261004010000_i3_tax_smtp_delivery` añade contador, próxima fecha y error saneado al correo. Se aplicó solo a `fsm_facturacion_local`, después de las dos migraciones de facturación anteriores. El responsable del esquema compartido debe revisar las tres antes de desplegar. No se modificaron la migración G2 ni el esquema global.

Para repetir el ensayo PostgreSQL/Mailpit, únicamente en esta base local, después de reconstruir la imagen del backend y con Mailpit funcionando:

```powershell
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml stop backend
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml run --rm --no-deps backend sh -c "npx prisma generate && npm run build && node scripts/verify-smtp-local.cjs"
docker compose --env-file .env.facturacion-local -f docker-compose.facturacion-local.yml up -d --no-deps backend
```

El ensayo verifica destino Docker `db/fsm_facturacion_local`, SMTP `mailpit:1025` y ausencia de otro trabajo/correo pendiente. No debe ejecutarse mientras el backend habitual procesa su cola. El fallo temporal es simulado y no llama al proveedor fiscal. El certificado/clave de loopback publicado es una fixture de test; ninguna clave de operación forma parte del repositorio.

## Conciliación de correo incierto

`GET /api/tax-documents/payments/:id` incluye estado, contador, próxima fecha y error saneado del correo. `POST :id/artifacts` recupera un fallo confirmado, sin emitir otro documento. RESULTADO_INDETERMINADO no puede reenviarse con esa acción.

Solo Administrador puede usar `POST :id/reconcile-email` con `{fingerprint,outcome,verified:true,observation}`. `outcome` es `accepted` o `not_accepted`. Debe contrastar registros SMTP o el buzón con el destinatario, Message-ID y documento antes de declararlo. La operación compara identidad/estado/contador y persiste auditoría en la misma transacción; **no manda correo ni emite DTE**. `accepted` marca ENVIADO por verificación manual. `not_accepted` deja FALLIDO para una recuperación explícita posterior. La declaración del operador no constituye una consulta automática al proveedor de correo.

Fuentes primarias: [transporte SMTP y verify de Nodemailer](https://nodemailer.com/smtp), [referencia de errores](https://nodemailer.com/errors). Las políticas de reintento y conciliación son decisiones de este CRM verificadas por sus tests, no garantías de entrega del proveedor.
