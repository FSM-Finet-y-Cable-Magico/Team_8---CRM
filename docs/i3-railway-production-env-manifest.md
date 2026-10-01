# Manifiesto de variables Railway — Incremento 3

Fecha de auditoría: 2026-09-29. Alcance: servicio backend G8 en Railway y build del frontend. Este documento no contiene valores secretos. `RAILWAY_ACTION` indica la acción humana recomendada; durante esta etapa no se modificó Railway.

Convenciones: **REQUIRED** significa necesario para arrancar o para declarar el despliegue productivo listo. **CONDITIONAL** significa obligatorio solo al habilitar la capacidad asociada. Los defaults corresponden al código actual.

## Base de datos y proceso

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`DATABASE_URL`|REQUIRED|SECRET|Prisma|Conexión PostgreSQL global|URI `postgresql://...`|ninguno|Protocolo PostgreSQL, host y DB; sin placeholder|Sí|ninguna|KEEP; ya existe, no copiar ni revelar|
|`PORT`|REQUIRED en Railway, inyectada|NON_SECRET|Nest `main.ts`|Puerto HTTP|entero 1–65535|`3000`|rango válido|Sí|ninguna|KEEP Railway-provided|
|`NODE_ENV`|REQUIRED|NON_SECRET|Nest/CORS y dependencias|Modo productivo|`production`|`development`|valor `production` en Railway|Sí|desactiva origen devtunnels|ADD/VERIFY `production`|
|`FRONTEND_URL`|REQUIRED|NON_SECRET|Nest CORS|Orígenes permitidos|una o más URL HTTPS separadas por coma|localhost|validador exige HTTPS sin query/hash|Sí|ninguna|ADD con URL pública real del frontend|
|`TRUST_PROXY_HOPS`|REQUIRED|NON_SECRET|Nest/Express|Confiar proxy Railway|entero 0–10|`0`|en Railway usar `1`|Sí|ninguna|ADD/VERIFY `1`|
|`REQUEST_TIMEOUT_MS`|OPTIONAL|NON_SECRET|Servidor Node|Timeout de requests|entero 1000–120000|`30000`|rango|Sí|ninguna|ADD/VERIFY `30000`|
|`POSTGRES_DB`|OPTIONAL para backend|NON_SECRET|Servicio PostgreSQL/Compose|Nombre DB administrada|identificador PostgreSQL|depende del servicio|no lo lee la aplicación|No|ninguna|KEEP si lo administra el servicio DB|

## Autenticación de usuarios

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`JWT_SECRET`|REQUIRED|SECRET|SecurityModule|Firmar JWT|cadena aleatoria ≥32 caracteres|placeholder inseguro|validador rechaza corto/placeholder|Sí|ninguna|KEEP; ya existe, rotar solo con plan de cierre de sesiones|
|`JWT_EXPIRES_IN`|OPTIONAL|NON_SECRET|SecurityModule|Duración JWT|duración compatible con JWT, p. ej. `8h`|`8h`|prueba funcional de login|Sí|ninguna|ADD/VERIFY `8h`|

## Integración G8 → G1

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`G1_INTEGRATION_ENABLED`|REQUIRED|NON_SECRET|HttpG1InventoryClient|Gate común de GET y POST G1|`true`/`false`|`false`|mantener `false` hasta aprobar el E2E con cierre originado por G3 real; conciliación simulada G1 ya aprobada|Sí|flag principal G1|KEEP `false`|
|`G1_API_URL`|CONDITIONAL|NON_SECRET|HttpG1InventoryClient|Base URL pública G1|Origen HTTPS exacto, sin `/api`, credenciales, query ni hash|ninguno|obligatoria si flag `true`|Sí|G1|ADD/VERIFY `https://backend-production-6ada.up.railway.app`|
|`G1_API_KEY`|CONDITIONAL|SECRET|HttpG1InventoryClient|Header literal `X-API-KEY`|cadena opaca sin CR/LF|ninguno|obligatoria si flag `true`|Sí|G1|KEEP; ya existe, confirmar por canal seguro|
|`G1_REQUEST_TIMEOUT_MS`|OPTIONAL|NON_SECRET|HttpG1InventoryClient|Timeout G1|entero 1–60000|`8000`|rango|Sí|G1|KEEP/VERIFY `8000`|

## Autenticación entrante G1 → G8

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`G8_INTEGRATION_API_KEYS`|OPTIONAL e inactiva|SECRET si alguna vez contiene hashes|IntegrationApiKeyGuard|Infraestructura inbound reservada|JSON `[{keyId,group,sha256,companies,active}]`|`[]`|mantener arreglo vacío bajo el contrato actual|Sí|G1 no consume operaciones G8|KEEP `[]`|
|`G8_PUBLIC_API_URL`|OPTIONAL|NON_SECRET|scripts/documentación|Base pública G8|HTTPS terminada en `/api`|ninguno|URL válida|No|ninguna|ADD/VERIFY `https://team8-crm-production-3be0.up.railway.app/api`|

No existe ni se necesita una segunda credencial HTTP G8 → G1. G1 confirmó el uso exclusivo de la key literal en `X-API-KEY`; no crear otra variable.

## G3, cobertura y geocodificación

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`COVERAGE_TECHNICAL_PROVIDER`|OPTIONAL|NON_SECRET|CoverageDomainService|Proveedor de cobertura|`G3` o `LEGACY_TOMODAT`|`G3`|enum del servicio|Sí|selecciona proveedor|ADD/VERIFY `G3`|
|`G3_INTEGRATION_ENABLED`|OPTIONAL|NON_SECRET|HttpG3IntegrationClient|Gate G3|`true`/`false`|`false`|mantener false sin contrato|Sí|G3|ADD/VERIFY `false`|
|`G3_API_URL`|CONDITIONAL|NON_SECRET|clientes G3|Base URL G3|HTTPS; HTTP solo loopback|ninguno|obligatoria si se habilita|Sí|G3|ADD vacía o variable sin valor; no habilitar|
|`G3_API_KEY`|CONDITIONAL|SECRET|clientes G3|Autenticación G3|cadena opaca|ninguno|obligatoria si contrato lo exige|Sí|G3|ADD solo por canal seguro|
|`G3_REQUEST_TIMEOUT_MS`|OPTIONAL|NON_SECRET|cliente G3|Timeout|entero|`8000`|rango operativo|Sí|G3|ADD/VERIFY `8000`|
|`GEOCODING_PROVIDER`|OPTIONAL|NON_SECRET|GeocodingService|Modo geocodificación|`MANUAL` o `HTTP`|`MANUAL`|enum|Sí|geocodificación|ADD/VERIFY `MANUAL`|
|`GEOCODING_API_URL`|CONDITIONAL|NON_SECRET|GeocodingService|Endpoint geocoder|HTTPS|ninguno|obligatoria con `HTTP`|Sí|GEOCODING_PROVIDER|dejar sin configurar en modo manual|
|`TOMODAT_API_URL`|CONDITIONAL|NON_SECRET|LegacyTomodatCoverageProvider|API legacy|HTTPS|URL pública TomoDAT|validación URL|Sí|solo `LEGACY_TOMODAT`|KEEP/REMOVE si no se usa legacy|
|`TOMODAT_COMPANY_ID`|CONDITIONAL|NON_SECRET|LegacyTomodatCoverageProvider|Empresa TomoDAT|entero positivo|ninguno|junto a token|Sí|legacy|KEEP sin valor si deshabilitado|
|`TOMODAT_API_TOKEN`|CONDITIONAL|SECRET|LegacyTomodatCoverageProvider|Token TomoDAT|cadena opaca|ninguno|junto a empresa|Sí|legacy|KEEP sin valor si deshabilitado|

## G2

No hay cliente ni variable runtime G2 en el código actual. WhatsApp/proveedor de notificaciones continúa `PENDIENTE_G2`; los nombres comentados en los ejemplos no constituyen contrato ni deben cargarse en Railway todavía.

## Billing y monitoreo

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`BILLING_CUT_DAYS`|OPTIONAL|NON_SECRET|Billing/Commercial|Días para corte lógico|entero positivo|`5`|fallback 5|Sí|ninguna|ADD/VERIFY `5`|
|`BILLING_NOTIFICATION_MODE`|REQUIRED para RC|NON_SECRET|BillingService|Canal de avisos|`disabled`, `mock`, `provider`|`mock`|enum|Sí|proveedor avisos|ADD `disabled` en producción hasta contrato|
|`COMMERCIAL_PLAN_EXPIRY_ALERT_DAYS`|OPTIONAL|NON_SECRET|CommercialControlBook|Ventana alerta planes|entero positivo|`7`|fallback 7|Sí|ninguna|ADD/VERIFY `7`|
|`MONITORING_RECENT_HOURS`|OPTIONAL|NON_SECRET|MonitoringService|Ventana de dato reciente|número positivo|`24`|fallback seguro|Sí|ninguna|ADD/VERIFY `24`|

## Correo SMTP

Todas son condicionales a `SMTP_HOST`. Si host está vacío, el envío queda deshabilitado.

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`SMTP_HOST`|OPTIONAL|NON_SECRET|MailService|Servidor SMTP|hostname|vacío|host válido|Sí|actúa como gate|KEEP vacío hasta proveedor|
|`SMTP_PORT`|CONDITIONAL|NON_SECRET|MailService|Puerto SMTP|entero|`587`|1–65535|Sí|SMTP_HOST|ADD/VERIFY `587`|
|`SMTP_SECURE`|CONDITIONAL|NON_SECRET|MailService|TLS implícito|boolean|`false`|boolean|Sí|SMTP_HOST|ADD/VERIFY según proveedor|
|`SMTP_STARTTLS`|CONDITIONAL|NON_SECRET|MailService|Upgrade STARTTLS|boolean|`true`|boolean|Sí|SMTP_HOST|ADD/VERIFY según proveedor|
|`SMTP_REJECT_UNAUTHORIZED`|CONDITIONAL|NON_SECRET|MailService|Validar certificado|boolean|`true`|mantener true en producción|Sí|SMTP_HOST|ADD `true`|
|`SMTP_USER`|CONDITIONAL|SECRET|MailService|Usuario SMTP|cadena|vacío|usuario y password juntos|Sí|SMTP_HOST|ADD por canal seguro|
|`SMTP_PASSWORD`|CONDITIONAL|SECRET|MailService|Clave SMTP|cadena|vacío|usuario y password juntos|Sí|SMTP_HOST|ADD por canal seguro|
|`SMTP_FROM`|CONDITIONAL|NON_SECRET|MailService|Remitente|email|vacío|email permitido|Sí|SMTP_HOST|ADD según proveedor|
|`SMTP_FROM_NAME`|OPTIONAL|NON_SECRET|MailService|Nombre remitente|texto|`CRM FiNet`|longitud operativa|Sí|SMTP_HOST|ADD/VERIFY|
|`SMTP_HELO`|OPTIONAL|NON_SECRET|MailService|Nombre EHLO|hostname|hostname local|hostname aceptado|Sí|SMTP_HOST|ADD solo si proveedor lo requiere|

## Facturacion.cl

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`FACTURACION_CL_INTEGRATION_ENABLED`|REQUIRED para RC|NON_SECRET|FacturacionClConfigService y validador|Gate de integración|`true`/`false`|`false`|el validador de producción rechaza `true` mientras falta contrato|Sí|flag principal|ADD `false`|
|`FACTURACION_CL_COMPANIES`|OPTIONAL|NON_SECRET|FacturacionClConfigService|Mapa multiempresa sin credenciales|JSON `[{idEmpresa,alias,environment,enabled}]`|`[]`|keys exactas, IDs/alias únicos, ambiente sandbox/production|Sí|Facturacion.cl|ADD `[]` o filas con `enabled:false`|

No se definen usuario, RUT, clave, token, URL ni formato de DTE en variables porque faltan onboarding y contrato técnico específicos del proyecto. Inventar sus nombres daría una falsa garantía de integración.

## Frontend y herramientas fuera del runtime backend

|NAME|REQUIRED / OPTIONAL|SECRET / NON_SECRET|CONSUMER|PURPOSE|FORMAT|DEFAULT|VALIDATION|NEEDED_AT_STARTUP|FEATURE_FLAG_RELATION|RAILWAY_ACTION|
|---|---|---|---|---|---|---|---|---|---|---|
|`VITE_API_URL`|REQUIRED al build frontend|NON_SECRET|Vite/frontend|Base API visible al navegador|URL pública HTTPS terminada en `/api`|`/api`|es pública y queda embebida; nunca debe contener secretos|Build|ninguna|SET `https://team8-crm-production-3be0.up.railway.app/api` en servicio frontend|
|`PORT`|REQUIRED en runtime frontend, inyectada|NON_SECRET|Nginx|Puerto HTTP frontend|entero válido|`8080` en imagen|Railway debe inyectarla; Nginx escucha `${PORT}`|Sí|ninguna|KEEP Railway-provided; no fijar manualmente|
|`API_PROXY_TARGET`|OPTIONAL dev|NON_SECRET|Vite dev server|Proxy local|URL|`http://127.0.0.1:3000`|solo desarrollo|No|ninguna|DO NOT SET en producción|
|`BACKEND_PORT`, `FRONTEND_PORT`, `RAILWAY_BACKEND_PORT`, `RAILWAY_FRONTEND_PORT`|OPTIONAL local|NON_SECRET|Docker Compose|Mapeo de puertos local|entero|varios|solo Compose|No|ninguna|DO NOT SET en backend Railway salvo necesidad de Compose|
|`GLOBAL_DB_REPORT_PATH`, `GLOBAL_DB_CATALOG_PATH`, `G1_SNAPSHOT_PATH`, `G1_SMOKE_*`, `ALLOW_G1_ACTIVATION_WRITE`, `ALLOW_RAILWAY_BILLING_WRITE_TEST`, `RUN_DB_INTEGRATION`, `CRM_INTEGRATION_TESTS`, `RUN_POSTGRES_INTEGRATION_TESTS`|OPTIONAL herramientas/tests|depende; rutas/IDs no deben tratarse como runtime|scripts/tests|Auditorías y smokes controlados|según script|ninguno|gates explícitos|No|pruebas|DO NOT SET en servicio productivo|

## Variables nuevas necesarias antes del siguiente deploy

Sin alterar las ya existentes, agregar o verificar: `NODE_ENV=production`, `FRONTEND_URL=<frontend HTTPS real>`, `TRUST_PROXY_HOPS=1`, `REQUEST_TIMEOUT_MS=30000`, `JWT_EXPIRES_IN=8h`, `BILLING_NOTIFICATION_MODE=disabled`, `FACTURACION_CL_INTEGRATION_ENABLED=false`, `FACTURACION_CL_COMPANIES=[]` y `SMTP_REJECT_UNAUTHORIZED=true`. Para G1, verificar la URL pública confirmada, mantener el flag en `false` y conservar `G8_INTEGRATION_API_KEYS=[]`.

En el servicio frontend, `VITE_API_URL` es variable de build y `PORT` es variable runtime inyectada. El backend requiere `FRONTEND_URL` solo después de que Railway genere el dominio HTTPS frontend real.
