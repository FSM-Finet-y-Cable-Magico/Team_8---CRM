# Firma de contratos por correo — corrección para segunda revisión

Fecha: 10 de noviembre de 2026. Rama local: **fix/firma-prepr-privado-g8**.
Base develop: 57789765550173b65a5777fd3d1d2ab4a2457b51.
Implementación publicada que se corrige: bfeb69a93f5eb661e9deb93d64d57b2d65b5c376.
El 10 de noviembre de 2026 el usuario autorizó el commit y la publicación de esta rama para revisión. El SHA se consulta en Git. No se autorizaron PR, merge, despliegue ni cambios en VPS o Railway.
CONTRACT_SIGNATURE_ENABLED=false se mantiene como valor inicial.

## Política de firma

La asignación al flujo automático es independiente de que el envío esté disponible.
Se configura por empresa con CONTRACT_SIGNATURE_AUTOMATIC_COMPANIES; si esa variable no está definida,
se consulta CONTRACT_SIGNATURE_COMPANIES. Una lista automática vacía explícita no usa ese respaldo.

La asignación se conserva en un evento mínimo de la auditoría existente (ASIGNAR_FIRMA_AUTOMATICA),
sin PDF, snapshot, token, OTP ni consentimiento. También se reconoce la auditoría de solicitudes y firmas de la versión anterior.
Se registra dentro de la transacción al crear el contrato, generar el PDF o consultar su política con autorización.
La consulta de estado puede registrar esa asignación bajo bloqueo: es una escritura de política, no una emisión ni firma.
La conservación de esos eventos debe incluirse en la política de retención y recuperación de G8.

Una vez asignado, un contrato automático no admite confirmación manual aunque se apague el servicio,
se retire su empresa de la configuración, venza el enlace o falle el correo.
El modo legado requiere simultáneamente la empresa en CONTRACT_SIGNATURE_MANUAL_COMPANIES
y el contrato en CONTRACT_SIGNATURE_MANUAL_CONTRACTS. Las listas parten vacías.
Un modo desconocido rechaza la confirmación manual.

Se verifica la política bajo bloqueo en las dos rutas manuales:
PATCH /api/contracts/:id/confirm-signature y
PATCH /api/contracts/:id/digital-contract/sign-status con Firmado manualmente.
La UI usa el estado del servidor, oculta la acción y limpia un formulario abierto si cambia la ficha o su política.
Una nueva aceptación exige Pendiente firma contrato y un PDF vigente de la misma empresa.
Los reintentos autorizados conservan la primera fecha, el origen y los estados comerciales o financieros.

## Evidencia privada de G8

Se retiró la propuesta de tabla pública y su modelo Prisma.
El canónico global, su inventario, el datasource, search_path y /ready coinciden con la base develop.

La migración independiente es db/g8/migrations/001_contract_signatures.sql.
Crea g8_contratos.solicitud_firma, con 29 columnas, claves e índices privados y referencias lógicas
a empresa, contrato, documento y versión. No crea FKs ni triggers hacia public.
El repositorio usa nombres calificados y valores SQL parametrizados con la misma transacción del contrato.

El propietario autorizado aplica la migración; el rol de ejecución no debe ser propietario ni superusuario.
db/g8/provision-access.sql recibe el nombre del rol mediante psql -v g8_runtime_role=<rol>.
Otorga USAGE del esquema y SELECT/INSERT/UPDATE de sus tablas; no CREATE ni DELETE.
No ejecutarlo sobre una base compartida hasta que el equipo revise la migración y el plan de respaldo.

La tabla conserva original, snapshot, huellas, PDF con constancia, consentimiento, OTP y resultados de entrega.
El original admite hasta 4 MiB y el PDF sellado hasta 5 MiB, coincidiendo con el límite de adjuntos SMTP.
El validador privado comprueba catálogo, límites e índices independientemente del verificador global.
El aprovisionamiento real y el ensayo de respaldo/restauración siguen pendientes del ambiente aprobado.

## Aceptación y entrega

El enlace lleva un token aleatorio de 256 bits en el fragmento y se retira de la barra.
Se persiste su SHA-256; el OTP de seis cifras se guarda con HMAC y un secreto independiente.
El enlace vence a las 48 horas y el código a los 10 minutos.
Se exigen revisión/descarga del PDF, huella correcta, consentimiento versionado y código válido.
Hay cinco envíos y cinco errores de código por solicitud y espera de 60 segundos.
El límite general de 30 llamadas/minuto por IP es por proceso; el proxy debe complementarlo.

Se releen empresa, estado, documento, versión y snapshot bajo bloqueo.
Anular el documento o sustituir su versión invalida la solicitud pendiente y limpia el OTP en la misma transacción.
Una versión anulada no revive cambiando su etiqueta.
La firma guarda evidencia, documento, transición comercial y auditoría atómicamente.
No coloca una fecha electrónica en fechaFirmaManual ni crea OT, pago o servicio activo.

Los correos se envían después del commit. Una toma persistente evita reenvíos al repetir la firma.
Un rechazo SMTP confirmado queda FALLIDO; un resultado incierto queda INDETERMINADO o EN_PROCESO.
Solo FALLIDO permite recuperación autorizada; los inciertos requieren revisión operativa sin reenvío automático.
La recuperación vuelve a comprobar la empresa habilitada antes de enviar y no duplica la aceptación.

## Rutas y pantallas

Internas, con JWT/roles y autorización por empresa:
GET/POST /api/contracts/:id/signature,
PATCH /api/contracts/:id/signature/cancel,
GET /api/contracts/:id/signature/download,
POST /api/contracts/:id/signature/retry-delivery.

Públicas: POST /api/contract-signatures/view, /pdf, /code y /sign.
El token va en el cuerpo y no se registra. Las respuestas internas no devuelven token ni OTP.
El PDF firmado histórico puede descargarse con el envío apagado, previa autorización y verificación de integridad.

Prospectos permite generar/descargar documentos antes de existir cliente o servicio.
La acción de envío requiere el permiso del operador, la empresa disponible y un PDF elegible.
Pendientes de activación usa fechaFirmaEfectiva y origenFirma en la proyección de G8:
fecha electrónica privada o fecha manual existente, orden descendente y desempate por ID.
Los históricos sin fecha mantienen su ausencia. Las API de G1/G2/G3 conservan su contrato.

## Configuración privada

No se leyeron ni modificaron archivos privados para estas correcciones.
El operador configura sus valores fuera de Git; no debe pegarlos en informes ni capturas.

- CONTRACT_SIGNATURE_ENABLED=false durante revisión.
- Las listas de empresas automáticas, de envío y del legado manual deben acordarse explícitamente.
- CONTRACT_SIGNATURE_PUBLIC_URL: origen HTTPS aprobado, sin ruta adicional, credenciales o parámetros.
- CONTRACT_SIGNATURE_OTP_SECRET: 32 bytes aleatorios en 64 caracteres hexadecimales.
- SMTP_COMPANIES y SMTP por empresa: reutilizan la configuración privada existente.
- CONTRACT_SIGNATURE_LEGAL_APPROVED y CONTRACT_SIGNATURE_EVIDENCE_BACKUP_CONFIRMED siguen false hasta su aprobación.

La rotación del secreto invalida códigos pendientes y debe coordinarse.
El transporte simulado solo admite aceptación en NODE_ENV=test.
La firma por código de correo no implementa firma avanzada ni basta por sí sola para habilitar nuevas
contrataciones de telecomunicaciones: falta el mecanismo de verificación admitido y aprobado para uso comercial,
con almacenamiento, acceso y recuperación acordados.

## Ensayos reproducibles y evidencia

Consultar evidencias/firma-prepr/REVISION.md y resultados.json para comandos, resultados, diff y pendientes.
Las pruebas usan Node 22, PostgreSQL 15 exclusivo, datos ficticios, correo simulado/loopback y red externa bloqueada.
Nunca utilizar una URL de Railway o VPS para los scripts QA.

npm run test:signature:postgres exige NODE_ENV=test, QA_CONTRACT_SIGNATURE_DB_URL,
QA_CONTRACT_SIGNATURE_RUN_ID y QA_CONTRACT_SIGNATURE_DENIED_URLS (roles G1/G2/G3 simulados).
Se conserva la exigencia de rol qa_contract, loopback:5432, nombre de base con marcador de 32 hexadecimales,
GUC independiente qa_signature.run_id, base inicialmente vacía y ausencia de alternativa a DATABASE_URL.
Preparar primero el canónico y luego la migración privada con propietario distinto.

scripts/i4-contract-signature-off-qa.cjs exige una segunda base vacía qa_signature_off_<marcador>,
solo con el canónico público, y QA_SIGNATURE_OFF_DB_URL con el mismo rol y marcador.
Arranca AppModule, comprueba HTTP /ready y el legado manual; no instala el esquema privado.

scripts/i4-contract-signature-recovery-qa.cjs arranca un proceso nuevo después de terminar la suite PostgreSQL:
lee las firmas persistidas con el envío apagado y verifica sus huellas sin correos.
Las credenciales de esos entornos se generan al ejecutar, no se versionan y desaparecen con el entorno temporal.

La entrega es para segunda revisión local. Se distinguen los resultados automáticos, el recorrido integral
de portales y las aprobaciones del ambiente. No se declara producción lista ni aceptación al 100 %.
