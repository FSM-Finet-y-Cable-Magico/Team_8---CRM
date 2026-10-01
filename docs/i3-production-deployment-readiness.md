# Preparación de despliegue de producción

Estado: **PREPARADO_LOCAL / NO DESPLEGADO**. Este documento no autoriza merge, deploy, cambios Railway, smoke de escritura ni activación G1.

## Configuración del servicio

- Railway debe usar `backend/` como root y `backend/Dockerfile`.
- La imagen de producción compila Nest y Prisma y ejecuta `node dist/main.js` con `NODE_ENV=production`.
- `main.ts` escucha `PORT` en `0.0.0.0`, valida el rango del puerto, habilita shutdown hooks y aplica `REQUEST_TIMEOUT_MS` entre 1 y 120 segundos.
- `TRUST_PROXY_HOPS` acepta 0..10. En Railway se propone `1`; debe confirmarse contra la topología real antes del despliegue.
- En producción, CORS acepta solo los orígenes HTTPS listados en `FRONTEND_URL`. El wildcard de `*.devtunnels.ms` queda limitado a desarrollo.
- Helmet y `ValidationPipe` global continúan activos.

## Variables

|Variable|Condición|
|---|---|
|`DATABASE_URL`|Obligatoria; PostgreSQL válido y no placeholder.|
|`JWT_SECRET`|Obligatoria; al menos 32 caracteres y no placeholder.|
|`PORT`|Obligatoria en runtime Railway; entero 1..65535.|
|`FRONTEND_URL`|Uno o más orígenes HTTPS separados por coma.|
|`TRUST_PROXY_HOPS`|0..10; propuesto 1 en Railway.|
|`REQUEST_TIMEOUT_MS`|1.000..120.000; default 30.000.|
|`G1_INTEGRATION_ENABLED`|Debe permanecer `false` hasta smoke y autorización operativa.|
|`G1_API_URL`, `G1_API_KEY`|Obligatorias solo si se activa G1. La key es la entregada por G1.|
|`G1_REQUEST_TIMEOUT_MS`|1..60.000; default 8.000.|
|`G8_PUBLIC_API_URL`|Opcional; si existe debe ser HTTPS y terminar en `/api`. Valor documentado: `https://team8-crm-production-3be0.up.railway.app/api`.|
|`G8_INTEGRATION_API_KEYS`|Opcional mientras no exista endpoint inbound; JSON con hashes SHA-256 y scopes, nunca keys reales.|

Variables SMTP, TomoDAT y otros módulos siguen siendo opcionales para no bloquear capacidades independientes.

## Validador

Ejecutar en el entorno preparado, sin pasar secretos como argumentos:

```powershell
npm.cmd run env:validate:production
```

`scripts/validate-production-env.mjs` informa solamente estados y códigos de error; no imprime valores. Verifica formatos, dependencias condicionales de G1, configuración multikey S2S y el bloqueo Facturacion.cl. El contrato G1 observado solo usa `X-API-KEY`; la función de una segunda credencial permanece `PENDIENTE_CONFIRMACION_G1_CREDENCIAL_SECUNDARIA` hasta recibir confirmación explícita.

## Health y verificaciones

Con prefijo global `/api`:

- `GET /api/health`: liveness de la aplicación, sin dependencia de BD.
- `GET /api/ready`: consulta la BD en transacción `READ ONLY`, con timeout, y verifica tablas/columnas/tipos/nulabilidad del contrato generado. No realiza llamadas externas.

Orden recomendado para el operador:

1. revisar diff, contrato e informes y realizar merge por el flujo acordado;
2. cargar secretos desde el gestor de Railway, sin pegarlos en Git o logs;
3. ejecutar el validador en un entorno con la misma configuración;
4. desplegar backend con root `/backend`;
5. comprobar `/api/health` y `/api/ready`;
6. mantener G1 desactivado hasta ejecutar el smoke GET con credencial legítima;
7. no ejecutar POST G1 hasta coordinar IDs, series y autorización;
8. ejecutar el smoke Billing de escritura solo en una ventana autorizada y con su flag explícito.

## Smokes pendientes

- `npm.cmd run smoke:g1:readonly`: preparado, pero no ejecutado contra G1 real porque no hay key configurada legítimamente en este entorno.
- `npm.cmd run smoke:billing:write`: preparado y **no ejecutado**. Aborta antes de conectarse salvo `ALLOW_RAILWAY_BILLING_WRITE_TEST=1`, se niega a correr con `NODE_ENV=production`, usa datos `TEST_G8_BILLING_*` dentro de una única transacción y fuerza rollback.
- POST G1, migraciones, reconcile y cambios de variables Railway: no ejecutados.

La advertencia Vite por un chunk cercano a 590 kB no impide el build, pero conviene planificar code splitting. La validación visual Billing sigue pendiente porque esta sesión no dispone del navegador integrado y el frontend no tiene framework de tests de componentes.

## Continuación frontend y Railway del 2026-09-30

El frontend ya tiene runtime productivo Nginx, `PORT` dinámico, `/health` y fallback SPA. Sus tests de configuración están en `npm.cmd run test:frontend-runtime`; el daemon Docker local no estaba activo, por lo que falta una prueba HTTP real de la imagen antes del deploy. Ver [readiness frontend](i3-frontend-production-readiness.md) y [configuración del servicio Railway](i3-railway-frontend-deployment.md).

La lectura Railway mediante `.env.railway` y TCP Proxy funciona. El contrato esperado coincide por completo, pero el verificador retorna `FAIL` por cinco objetos adicionales no aprobados, aparte de `_prisma_migrations`. Ejecutar `npm.cmd run db:verify:global:railway` y resolverlos mediante acuerdo global antes del deploy. Ver [verificación READ ONLY](i3-railway-readonly-verification.md).
