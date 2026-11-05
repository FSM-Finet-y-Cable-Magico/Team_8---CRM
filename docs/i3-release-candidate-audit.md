# Auditoría Release Candidate — Incremento 3

Fecha: 2026-09-29 a 2026-10-01. Rama auditada: `feature/incremento3`, HEAD revalidado: `63404be3`. Codex no ejecutó commit, push, merge, deploy, migraciones, writes Railway ni llamadas externas reales. Este informe incorpora la evidencia comunicada de los smokes G1 manuales y autorizados, incluidos el POST inicial y su repetición idéntica.

## Resultado

Actualización 2026-10-01: el cierre intergrupos G2/G3 está implementado localmente. El RC vuelve a estado **NO-GO para release** hasta aprobar y aplicar la migración aditiva G2, configurar principals G2/G3 en `G8_INTEGRATION_API_KEYS` y completar los smokes autorizados. No se modificó Railway ni se ejecutó tráfico externo en esta etapa.

**READY_FOR_PR_REVIEW / DEPLOYMENT_CONDITIONAL**. No queda un blocker de código conocido para abrir y revisar el PR. El despliegue productivo exige completar variables, validar el commit final y respetar los bloqueos externos listados abajo.

## BLOCKER

### Antes de merge

Ninguno identificado después de las correcciones y validaciones de esta etapa.

### Antes de deploy

1. **Variables críticas no verificadas en Railway.** `FRONTEND_URL`, `NODE_ENV`, proxy y modos deshabilitados deben confirmarse con el manifiesto. El código ahora aborta en producción si `JWT_SECRET` es inseguro o `FRONTEND_URL` no es HTTPS válido.
2. **El commit final aún no existe.** Esta sesión tiene prohibido hacer commit/push; el humano debe revisar y versionar el diff aprobado.
3. **Facturacion.cl no puede habilitarse.** Falta el contrato técnico específico del proyecto; el runtime y el validador abortan si el flag está en `true`.
4. **Railway mantiene cinco objetos sin dueño.** La lectura actual llegó correctamente por TCP Proxy y confirmó 1.522 coincidencias y cero faltantes. `solicitud_instalacion_integracion` ya forma parte del contrato y está en `MATCH`. Dos columnas, una FK, un índice y `solicitud_clave_wifi` permanecen `UNOWNED_EXTRA`; los cinco quedaron en **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** después de revisar estructura, conteos seguros, consumidores y todas las refs Git accesibles. No se modificó la base.
5. **Contrato G2 pendiente de DDL coordinado.** `prospecto.id_plan_interes`, metadatos de pago/comprobante, categoría WiFi única e `integracion_resultado_wifi_g2` están en Prisma, init global y migración preparada, pero no existen todavía en Railway.
6. **Smokes intergrupos pendientes.** No existe un candidato comercial seguro para el POST G8→G3 y se requiere autorización humana. G2 necesita migración y API key configurada antes del smoke S2S. El E2E real G3→G8 continúa pendiente.
7. **Dumps con datos versionados.** Los dos archivos `.dump` son PostgreSQL custom y contienen 59/61 entradas `TABLE DATA`; deben tratarse como potencialmente productivos y bloquean la publicación hasta confirmar origen y anonimización. No fueron extraídos, eliminados ni reescritos.

El procedimiento revisable de migración, rollback lógico y smokes parametrizados está en [i3-intergroup-predeploy-package.md](i3-intergroup-predeploy-package.md). La migración está lista para coordinación; los smokes aún no están habilitados para ejecución.

Los contratos G1/G3/G2 bloquean sus capacidades, pero no el deploy base porque sus flags permanecen deshabilitados.

## HIGH

- **Prueba Docker runtime pendiente.** El stage productivo Nginx, health y fallback SPA están implementados y probados estáticamente, pero el daemon Docker local no estaba activo. CI o un equipo con Docker debe ejecutar la imagen antes del deploy.
- **G1 outbound y conciliación G1 probados en Railway real.** URL, `X-API-KEY`, scope, lecturas, activación, retry idempotente, semántica `PENDIENTE_CIERRE` y asignación activa están confirmados. G1 simuló el cierre técnico; el E2E con G3 real continúa pendiente y el flag sigue en `false`.
- **S2S inbound sin ruta de negocio.** El guard es robusto, pero no hay contrato de operación G1 → G8; configurar hashes no publica una capacidad funcional.

## MEDIUM

- `BILLING_NOTIFICATION_MODE` tiene fallback de desarrollo `mock`. El ejemplo Railway y el checklist ahora exigen `disabled` en producción.
- La validación integral de variables vive en `scripts/validate-production-env.mjs` y debe ejecutarse en el procedimiento. Además se añadieron bloqueos de arranque para JWT, CORS y Facturacion.cl, pero no todos los proveedores opcionales validan su configuración al inicio.
- Los clientes G1/G3 permiten HTTP solo en loopback para pruebas, y exigen HTTPS en destinos remotos. Conservar esta política.
- La comprobación de readiness valida tablas/columnas/tipos/nulabilidad; el auditor global aparte cubre el contrato más amplio. No interpretar `/ready` como auditoría completa de constraints.

## LOW

- Vite informa bundle mayor a 500 kB; es una mejora de rendimiento, no un defecto funcional del RC.
- Persisten advertencias de lint frontend previamente existentes si la corrida final confirma el mismo patrón; deben registrarse sin confundirlas con errores.
- `G8_PUBLIC_API_URL` es documental/operativa y no la consume el backend al atender requests.

## Hallazgos corregidos en esta etapa

- Los fallos de auditoría y tracking G3 ya no escriben el error crudo del driver/proveedor, que podía contener SQL, URL o datos sensibles. Se conservan mensajes y IDs seguros.
- JWT deja de usar silenciosamente el placeholder en producción: el proceso aborta con un código de error sin revelar el valor.
- CORS deja de caer silenciosamente a localhost en producción y exige orígenes HTTPS válidos.
- Los ejemplos incorporan `SMTP_REJECT_UNAUTHORIZED` y `SMTP_HELO`, variables ya consumidas por MailService.
- Se agregó arquitectura Facturacion.cl cerrada, multiempresa y sin HTTP, junto a una validación que rechaza campos de credenciales dentro de `FACTURACION_CL_COMPANIES`.
- Se agregó runtime frontend Nginx con `PORT` dinámico, `/health`, assets con 404 y fallback SPA; `VITE_API_URL` se valida como dato público de build.

## Revisión de secretos y hardcodes

- `.env` y `.env.*` reales están ignorados; solo se versionan ejemplos.
- `G8_INTEGRATION_API_KEYS` acepta hashes SHA-256 y scopes, no API keys literales.
- No se añadieron credenciales de Facturacion.cl ni se copiaron valores Railway.
- Los localhost observados corresponden a defaults de desarrollo, Compose o excepciones loopback; producción queda protegida por `NODE_ENV` y `FRONTEND_URL`.
- La URL pública TomoDAT es un default legacy conocido; token e ID permanecen variables del servidor.
- Los textos de tests con valores ficticios no son credenciales reales.
- Debe conservarse la revisión heurística final con `scripts/audit-secrets-redacted.mjs`; esta no reemplaza GitGuardian ni una revisión de todo el historial.
- La auditoría final confirmó dos backups PostgreSQL custom ya versionados en `output/backups/` desde `46d9a985`. Contienen respectivamente 59 y 61 entradas `TABLE DATA`/`COPY`; no son schema-only. Como `pg_restore` no está disponible y no se extrajeron filas, su origen y anonimización siguen sin demostrarse. Son un blocker de publicación y no se eliminan automáticamente. La única ruta absoluta local detectada en documentación sí se reemplazó por una instrucción portable después de reportarla.

## Docker, startup y cierre

- Backend: build multi-stage Node 22, `npm ci`, `prisma generate`, compilación y runtime sin devDependencies.
- Runtime backend: `node dist/main.js`, escucha en `0.0.0.0:$PORT`, Helmet, CORS allowlist, validation pipe y trust proxy configurable.
- Prisma conecta en el ciclo de módulo y habilita shutdown hooks; una DB inaccesible impide readiness/operación normal.
- No hay migración ni seed automáticos en el CMD productivo.
- `/api/health` prueba proceso; `/api/ready` prueba DB y proyección global de columnas de forma READ ONLY.
- Backend Docker debe construirse con root `/backend`; el repo no contiene `railway.json`, por lo que esa selección depende de configuración Railway y debe verificarse en UI.
- Frontend Docker debe construirse con root `/frontend`; su stage `prod` copia solo `dist` a Nginx y usa `/health` como healthcheck.

## Estado por integración

|Área|Estado RC|Condición|
|---|---|---|
|DB global/Prisma|CONTRACT_CHANGE_PENDING_DDL + UNOWNED_EXTRAS|Canónico propuesto de 92 tablas; Railway conserva 1.522 coincidencias y presenta 26 diferencias esperadas del DDL pendiente, además de cinco extras sin dueño|
|Billing|READY con proveedor de avisos deshabilitado|No ejecutar smoke write sin autorización|
|CU-86 DocumentoTributarioExterno|READY|Sigue como metadata externa manual, separado de Factura/Pago|
|G8 → G1|REAL_RAILWAY_PASS / G1_RECONCILIATION_PASS|Cierre simulado por G1; E2E con G3 real pendiente; no más POST; flag false|
|G1 → G8|NOT_REQUIRED_CURRENT_CONTRACT|No existen operaciones inbound acordadas; `G8_INTEGRATION_API_KEYS=[]` permanece vacío|
|G3|BLOQUEADO_CONTRATO|Flag false|
|G2/notificaciones|PENDIENTE_G2|Modo Billing disabled|
|Facturacion.cl|ARCHITECTURE_READY / PENDIENTE_CONTRATO_FACTURACION_CL|Flag false; sin HTTP ni emisión|

## Criterio de salida

El RC puede avanzar a PR cuando todos los tests/build/lint/Prisma/diff y el auditor de secretos terminen sin errores. Puede avanzar a deploy solo después de aplicar el checklist Railway, verificar frontend runtime y obtener health/readiness correctos. Las integraciones externas se habilitan en ventanas separadas con evidencia y autorización explícita.

## Validación ejecutada en esta etapa

- Backend: 57 suites/497 tests aprobados; 5 suites/8 tests optativos omitidos.
- Herramientas Node globales: 22/22 aprobados; runtime frontend: 3/3 aprobados.
- Build backend y frontend: aprobado; Vite conserva advertencia de bundle >500 kB.
- Lint: 0 errores y 78 advertencias frontend preexistentes.
- Prisma generate/validate: aprobado.
- Auditor Prisma/global estático: ejecutado; 59 tablas modeladas; 822 `MATCH`, 35 `COLUMN_GLOBAL_ONLY`, 325 `OWNER_EXTERNAL`, 50 `INDEX_MISMATCH` y 65 `FK_MISMATCH`, clasificados en el informe de alcance.
- Validador de producción con configuración sintética segura: `PASS`.
- Scan heurístico redacted: ejecutado; 55 coincidencias redactadas (47 del árbol G8 y 8 conservadas del snapshot G1). No se detectaron patrones de alta confianza de private keys, AWS, GitHub, OpenAI/Stripe-like, Google API keys o JWT literales fuera de los backups binarios no inspeccionables. Las coincidencias siguen requiriendo clasificación humana.
- Frontend runtime: 3/3 tests estáticos PASS; build general y build con URL API pública PASS; prueba de contenedor omitida por daemon Docker no disponible.
- Verificador Railway READ ONLY: conexión por TCP Proxy exitosa; `FAIL` por cinco `UNOWNED_EXTRA`, con 1.522 coincidencias y cero faltantes. La extensión G3 está en `MATCH` y `_prisma_migrations` es el único extra permitido. No hubo escrituras.
- `git diff --check`: PASS funcional; solo avisos de conversión LF/CRLF en documentación.
