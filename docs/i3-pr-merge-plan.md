# Plan de PR y merge — Incremento 3

## Objetivo del PR

Entregar el Incremento 3 completo sobre el esquema global reconciliado: control comercial, Billing, CU-86 como registro manual de documentos tributarios externos, integraciones G1/G3 protegidas por flags, autenticación S2S entrante preparada y release candidate con manifiesto Railway. Facturacion.cl queda expresamente en arquitectura pendiente, sin emisión ni tráfico externo.

## Alcance exacto a revisar

### Base de datos y Prisma

- Proyección Prisma alineada con el contrato global final de 90 tablas y 877 columnas descrito en los informes del incremento.
- `integracion_activacion_g1.payload_snapshot` nullable y tracking para activación/integraciones.
- Modelos Billing y relaciones multiempresa.
- `DocumentoTributarioExterno` aditivo, con identidad única por empresa/tipo/emisor/folio y estados `REGISTRADO`/`ANULADO`.
- Scripts/catálogos globales y verificadores READ ONLY. No se incluye una instrucción para reproducir migraciones G8 históricas sobre Railway.
- Esta etapa no agrega tablas ni columnas para Facturacion.cl.

### Backend y API

- Control comercial, zonas/precios, contratos, clientes, servicios, instalaciones, G1/G3, Billing, pagos, cobranza y auditoría implementados durante el incremento.
- Endpoints CU-86 administrativos para registrar, listar, corregir y anular metadata externa; sin DELETE, emisión o SII.
- Guard S2S `X-API-KEY` con hashes SHA-256, comparación constante, grupo, empresa y rotación; todavía sin ruta de negocio inbound.
- Facturacion.cl: `TaxDocumentIssuer` y provider pendiente con readiness cerrado; no hay endpoint, cliente HTTP, payload DTE, token ni retry.
- Startup productivo rechaza JWT inseguro, CORS inválido y activación prematura de Facturacion.cl.
- Logs de fallos de auditoría/tracking saneados para no volcar errores crudos.

### Frontend

- Flujos del Incremento 3 y UI Billing/CU-86 ya implementados.
- CU-86 conserva acciones de metadata: registrar, corregir y anular.
- No se agregan botones de emitir boleta/factura, enviar SII o reintentar Facturacion.cl.
- `VITE_API_URL` continúa siendo la única variable frontend de API; nunca lleva secretos.
- `frontend/Dockerfile` agrega un stage productivo Nginx que sirve solo `dist`, escucha `PORT`, expone `/health` y resuelve rutas SPA.
- `frontend/nginx.conf.template`, `.dockerignore` y los tests de runtime verifican assets, fallback y aislamiento del contexto.

### Variables y runtime

- Se documentan todas las variables reales en `i3-railway-production-env-manifest.md`.
- Se amplían `.env.example`, `backend/.env.example` y `.env.railway.example` con TLS SMTP y flags Facturacion.cl seguros.
- Nuevas variables de código: `FACTURACION_CL_INTEGRATION_ENABLED=false` y `FACTURACION_CL_COMPANIES=[]`.
- Frontend Railway usa `VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api` durante build y `PORT` inyectada durante runtime. El dominio frontend real se agrega después a `FRONTEND_URL` del backend.
- No se modifica ninguna variable real de Railway en este PR.

### Seguridad

- Keys outbound G1 permanecen secretas en servidor; inbound G8 almacena hashes.
- Config Facturacion.cl no admite campos extra, evitando credenciales en el JSON no secreto.
- No hay secretos o endpoints privados nuevos en Git.
- G1/G3/Facturacion.cl y proveedor Billing permanecen deshabilitados hasta contrato/pruebas.

## Orden recomendado de revisión

1. **Contrato global y Prisma:** informes de reconciliación, auditor y ausencia de DDL no aprobado.
2. **Seguridad/startup:** JWT, CORS, logs, guard S2S, `.gitignore`, scan de secretos.
3. **Billing y consistencia transaccional:** pagos, sobrepago, concurrencia, mora/cortes lógicos, auditoría atómica y multiempresa.
4. **G1/G3:** flags, timeouts, idempotencia, snapshot, errores saneados y ausencia de llamadas al estar deshabilitado.
5. **CU-86:** límites de metadata y separación de `Factura`/`Pago`.
6. **Facturacion.cl:** confirmar que es solo arquitectura bloqueada, sin HTTP, credenciales o UI de emisión.
7. **Frontend y runtime Railway:** API base, CORS, serving productivo del frontend y checklist.
8. **Documentación:** estados y bloqueos deben coincidir con el código final.

## Validaciones requeridas antes de aprobar

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd run prisma:generate
npx.cmd prisma validate --schema backend/prisma/schema.prisma
npm.cmd run db:audit:prisma-global
npm.cmd run test:frontend-runtime
node scripts/audit-secrets-redacted.mjs
git diff --check
```

Además:

- Ejecutar `npm.cmd run env:validate:production` con un entorno seguro y valores reales, sin registrar salida sensible.
- Ejecutar `npm.cmd run db:verify:global:railway`. El resultado actual conecta y encuentra cinco objetos inesperados además de `_prisma_migrations`; deben clasificarse globalmente y obtener `PASS` antes del deploy.
- Construir y ejecutar la imagen frontend con Docker en CI o en un equipo con daemon activo; esta sesión solo pudo hacer build y tests estáticos.
- No ejecutar suites DB/write opt-in sin entorno y autorización explícitos.
- Verificar `GET /api/health` y `GET /api/ready` después del deploy, no antes mediante un cambio de Railway no autorizado.

## Estrategia de merge

- Mantener un único PR desde `feature/incremento3` hacia `develop` con descripción basada en el diff final.
- Exigir revisión de DB/global por responsable común y revisión de integraciones por G1/G3 cuando aplique.
- Resolver conflictos conservando el contrato canónico actualizado; no regenerar o sobrescribir `init-global.sql` a ciegas.
- No hacer squash si el equipo necesita conservar la trazabilidad existente del incremento; seguir la política real del repositorio.
- No mergear con checks rojos, drift global sin explicar, secretos detectados o flags externos activos.

## Verificación post-merge

1. Reejecutar tests/build/lint/Prisma sobre `develop` actualizado.
2. Construir la imagen backend con root `/backend` y la frontend con root `/frontend`.
3. Aplicar el checklist de variables, con G1/G3/Facturacion.cl en false y Billing notifications disabled.
4. Exigir `PASS` del verificador global después de resolver los objetos inesperados.
5. Desplegar el commit exacto aprobado.
6. Comprobar health frontend, health/readiness backend, login, CORS, aislamiento por empresa y GET funcionales.
7. Observar logs saneados y métricas; no probar POST externos como parte del smoke base.
8. Registrar commit, deployment ID, hora, responsable y resultados sin secretos.

## Rollback

- Aplicación: restaurar el deployment anterior conocido como sano.
- Variables: revertir únicamente el cambio documentado en la ventana; no eliminar secretos compartidos.
- DB: este bloque final no agrega DDL. Para cualquier DDL incluido por otras partes del incremento se debe usar el respaldo y rollback del plan global, nunca `prisma migrate reset`.
- Integraciones: volver flags a `false`; conservar estados de tracking para reconciliación y no reintentar automáticamente resultados indeterminados.
- Si una emisión tributaria futura queda en timeout, usar estado `RESULTADO_INDETERMINADO` y conciliación del proveedor; nunca repetir ciegamente.
