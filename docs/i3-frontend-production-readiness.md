# Frontend productivo — Release Candidate Incremento 3

## Estado

**FRONTEND_RUNTIME_IMPLEMENTED / BUILD_VERIFIED / STATIC_RUNTIME_TESTED / DOCKER_RUNTIME_TEST_NOT_EXECUTED**.

El frontend ya tiene un runtime productivo real compatible con Railway. La imagen final usa Nginx y contiene solo los archivos compilados. El servicio escucha el `PORT` inyectado, expone `/health`, preserva fallback SPA y trata assets inexistentes como 404.

## Cambios

- Stage `prod` en `frontend/Dockerfile` con `nginx:1.30-alpine`.
- `ARG VITE_API_URL=/api` disponible durante el build.
- Plantilla `nginx.conf.template` con `listen ${PORT}`.
- `/health` simple, sin backend ni base de datos.
- Cache inmutable para assets con hash y `no-cache` para navegación SPA.
- `.dockerignore` excluye entornos, dependencias y artefactos locales.
- Tres tests Node para stages, aislamiento del runtime, PORT, health, assets, fallback SPA y exclusiones.

## Seguridad

- El runtime no recibe secretos.
- `VITE_API_URL` es pública y queda incorporada al bundle.
- El contenedor final no copia `.env`, código fuente, `node_modules` ni devDependencies.
- No hay proxy genérico, listado de directorios ni fallback de assets inexistentes hacia HTML.
- El dominio frontend no está hardcodeado; se configura después en `FRONTEND_URL` del backend.

## Validaciones

`npm.cmd run test:frontend-runtime`: 3/3 PASS.

El build frontend con `VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api` terminó correctamente y se comprobó que la URL aparece en un solo asset compilado.

El Docker CLI 29.4.1 está instalado, pero el daemon local no estaba activo (`docker_engine` inexistente). No se construyó ni arrancó la imagen: `DOCKER_RUNTIME_TEST_NOT_EXECUTED`. Antes del deploy productivo, CI o un equipo con Docker activo debe verificar `/health`, `/`, un asset real, un asset inexistente y una ruta SPA.

## Configuración Railway

Ver [i3-railway-frontend-deployment.md](i3-railway-frontend-deployment.md). Valores principales:

- Root Directory: `/frontend`.
- Dockerfile relativo al root: `Dockerfile`.
- Build variable: `VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api`.
- Runtime: `PORT` inyectada por Railway.
- Healthcheck: `/health`.
- Backend `FRONTEND_URL`: origen HTTPS real generado para el frontend.

## Criterio restante

No queda un blocker de implementación frontend conocido para PR. Antes del deploy debe construirse/ejecutarse la imagen en Docker o en un deployment de revisión y comprobar el serving HTTP real. Esta comprobación no requiere un backend funcional ni llamadas externas.
