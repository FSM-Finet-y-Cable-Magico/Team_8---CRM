# Checklist de despliegue Railway — Incremento 3

Este procedimiento es para ejecución humana en Railway. No incluye secretos ni autoriza escrituras de base de datos, deploy o activación de integraciones.

## 1. Precondiciones

- [ ] Confirmar rama/commit aprobados y revisión de PR completada.
- [ ] Confirmar respaldo reciente de PostgreSQL y responsable de rollback.
- [ ] Ejecutar localmente tests, build, lint, `prisma validate`, auditor de proyección y `git diff --check`.
- [ ] Confirmar que el verificador global READ ONLY sigue en PASS contra un catálogo fresco.
- [ ] Confirmar que no se incluyeron `.env`, credenciales, dumps ni reportes con valores sensibles.
- [ ] Mantener `G1_INTEGRATION_ENABLED=false`, `G3_INTEGRATION_ENABLED=false` y `FACTURACION_CL_INTEGRATION_ENABLED=false`.

## 2. Servicio backend: Variables

En Railway: proyecto → servicio backend → **Variables**.

- [ ] Comparar nombre por nombre con [el manifiesto](i3-railway-production-env-manifest.md).
- [ ] Verificar referencias Railway para `DATABASE_URL`; no copiar el valor a chats, capturas o Git.
- [ ] Verificar `JWT_SECRET` existente y con al menos 32 caracteres. No rotarlo dentro de este despliegue salvo plan explícito de cierre de sesiones.
- [ ] Configurar `NODE_ENV=production`.
- [ ] Configurar `FRONTEND_URL` con cada origen HTTPS exacto, separado por coma y sin path/query/hash.
- [ ] Configurar `TRUST_PROXY_HOPS=1` y `REQUEST_TIMEOUT_MS=30000`.
- [ ] Configurar `BILLING_NOTIFICATION_MODE=disabled` hasta existir proveedor autorizado.
- [ ] Configurar `FACTURACION_CL_INTEGRATION_ENABLED=false` y `FACTURACION_CL_COMPANIES=[]`.
- [ ] Mantener `G8_INTEGRATION_API_KEYS=[]` hasta acordar la ruta inbound, sus operaciones y scopes. Luego cargar solo hashes SHA-256, nunca keys literales.
- [ ] Si SMTP no está contratado, mantener `SMTP_HOST` vacío. Si se configura, exigir TLS/certificado válido y cargar usuario/password por el gestor de secretos.
- [ ] No crear una variable para la credencial secundaria G1 hasta que G1 entregue nombre, transporte y validación exactos.
- [ ] Usar **Raw Editor** solo para nombres/valores ya aprobados; revisar dos veces antes de guardar. No pegar el contenido en tickets o PR.

Ejecutar fuera de Railway, con un entorno seguro que contenga los valores reales:

```powershell
npm.cmd run env:validate:production
```

Resultado exigido: `RESULT: PASS`. El comando no imprime valores sensibles.

## 3. Configuración de build y runtime

En servicio backend → **Settings**:

- [ ] Root directory: `/backend` si Railway construye con `backend/Dockerfile`.
- [ ] Builder/Dockerfile apunta al Dockerfile de backend y usa Node 20.
- [ ] Start command efectivo: `node dist/main.js` (ya definido por la imagen).
- [ ] Healthcheck path: `/api/health`.
- [ ] Puerto: usar el `PORT` inyectado por Railway; no fijar un puerto público diferente.
- [ ] Reinicio: política limitada y observable; no ocultar fallos continuos de configuración.
- [ ] Confirmar dominio público HTTPS del backend y conservar `/api` como prefijo.

La imagen genera Prisma y compila en build. No ejecuta `prisma migrate`, seed ni reconciliación al arrancar. Esa separación debe conservarse.

## 4. Frontend

- [ ] Crear servicio separado sugerido `Team_8---CRM-Frontend` desde el mismo repositorio y rama `develop` después del merge.
- [ ] Configurar Root Directory `/frontend`, builder Dockerfile y path relativo `Dockerfile`.
- [ ] Definir `VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api` durante el build.
- [ ] Mantener `PORT` administrada por Railway y configurar Healthcheck Path `/health`.
- [ ] No definir ninguna variable `VITE_*` que contenga API keys, tokens, passwords o `DATABASE_URL`.
- [ ] Generar el dominio público, copiar su origen HTTPS exacto y agregarlo a `FRONTEND_URL` del backend antes de validar login.
- [ ] Verificar `/health`, `/`, un asset real, un asset inexistente y una ruta SPA. Ver [procedimiento frontend](i3-railway-frontend-deployment.md).

## 5. Base de datos

- [ ] No ejecutar las migraciones históricas G8 automáticamente sobre la base global.
- [ ] Ejecutar `npm.cmd run db:verify:global:railway`, que carga `.env.railway` sin imprimir la conexión y consulta en transacción READ ONLY.
- [ ] Resolver por acuerdo global los cinco objetos inesperados observados el 2026-09-30 y repetir hasta obtener `PASS`.
- [ ] Si aparece drift, detener deploy; no usar `migrate resolve` para ocultarlo.
- [ ] No ejecutar seed en producción.
- [ ] Si un cambio de esquema futuro es aprobado, aplicar el procedimiento global con respaldo, dry-run, ventana y verificación independiente.

## 6. Deploy controlado

- [ ] Crear deployment desde el commit exacto revisado.
- [ ] Revisar logs de build: instalación, `prisma generate`, compilación y ausencia de secretos.
- [ ] Revisar logs de arranque: conexión Prisma exitosa, listener en `0.0.0.0:$PORT`, sin loop de reinicios.
- [ ] No habilitar G1, G3, Facturacion.cl, SMTP ni notificaciones provider durante el deploy base.

## 7. Verificación posterior, solo lectura

- [ ] `GET /api/health` devuelve 200 y `application: UP`.
- [ ] `GET /api/ready` devuelve 200, `database: UP`, `global_schema: READY`, cero columnas ausentes/diferentes y `g1_payload_snapshot: READY`.
- [ ] `GET <frontend>/health` devuelve 200 y `GET <frontend>/<ruta-SPA>` devuelve `index.html`.
- [ ] `g1_configured` y `g3_configured` pueden ser `false`; eso no bloquea módulos independientes.
- [ ] Login administrativo válido y una consulta GET representativa por empresa funcionan.
- [ ] Un origen web no listado por CORS queda rechazado.
- [ ] No aparecen URLs de DB, JWT, API keys, SMTP password, payloads completos o datos personales en logs.
- [ ] La UI muestra Billing con notificaciones deshabilitadas y conserva CU-86 como registro manual de metadata.

## 8. Integraciones posteriores

### G1

- [ ] Obtener confirmación escrita del contrato `X-API-KEY` y de la credencial secundaria.
- [ ] Validar primero el smoke GET autorizado con IDs de prueba.
- [ ] Ante 401/403, detenerse: no probar encabezados, hashes o claves alternativos.
- [ ] Un POST de activación requiere autorización explícita, datos coordinados e idempotencia observable.
- [ ] Solo después de aprobar la prueba, cambiar `G1_INTEGRATION_ENABLED` en una ventana controlada.

### Facturacion.cl

- [ ] Recibir onboarding/certificación, ambientes, credenciales por empresa, formatos habilitados, tipos DTE y contrato de errores.
- [ ] Acordar idempotencia y reconciliación para timeout/resultado indeterminado antes de implementar HTTP.
- [ ] Validar sandbox con datos ficticios y evidencia del proveedor.
- [ ] Mantener el flag `false` hasta una nueva revisión; el validador actual rechaza `true` deliberadamente.

## 9. Rollback

- [ ] Si falla health/readiness, restaurar inmediatamente el deployment anterior desde Railway.
- [ ] Revertir solo variables agregadas/cambiadas durante la ventana; no rotar/borrar secretos sin coordinación.
- [ ] Como esta entrega no requiere DDL, el rollback esperado es aplicación/variables. Si un operador añadió DDL fuera de alcance, usar su plan de rollback aprobado y respaldo.
- [ ] Conservar logs saneados, commit, hora y decisión; no copiar valores sensibles al incidente.
