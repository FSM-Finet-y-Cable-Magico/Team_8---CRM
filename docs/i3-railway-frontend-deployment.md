# Despliegue del frontend en Railway — Incremento 3

Este procedimiento describe una ejecución humana futura. Esta etapa no creó servicios, dominios ni deployments en Railway.

## Configuración del servicio

|Campo Railway|Valor|
|---|---|
|Nombre sugerido|`Team_8---CRM-Frontend`|
|Repository|El mismo repositorio de G8|
|Branch|`develop`, después del merge aprobado|
|Root Directory|`/frontend`|
|Builder|Dockerfile|
|Dockerfile Path|`Dockerfile`, relativo al Root Directory; equivale a `/frontend/Dockerfile` desde la raíz del repo|
|Build variable|`VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api`|
|Runtime variable|`PORT`, inyectada por Railway|
|Healthcheck Path|`/health`|
|Public Networking|Generate Domain|

No configurar API keys, `JWT_SECRET`, `DATABASE_URL`, passwords o tokens como `VITE_*`. Vite reemplaza estas variables durante el build y sus valores quedan públicos dentro del bundle descargado por el navegador.

## Runtime incluido

`frontend/Dockerfile` usa tres stages:

1. `dev`, conservado para Docker Compose local.
2. `build`, con Node 22, `npm ci`, `ARG VITE_API_URL` y `npm run build`.
3. `prod`, con Nginx 1.30 Alpine y únicamente `dist` más la plantilla de configuración.

El runtime:

- escucha `0.0.0.0:$PORT` y también IPv6 cuando está disponible;
- sirve `/usr/share/nginx/html`;
- responde `200` en `/health`;
- devuelve 404 para assets inexistentes bajo `/assets/`;
- usa `index.html` como fallback para rutas React;
- no contiene `src`, `node_modules` ni devDependencies;
- no hace proxy a la API: el bundle utiliza la URL absoluta configurada en build.

## Secuencia humana en Railway

1. Después del merge, crear un servicio nuevo desde el mismo repositorio.
2. Seleccionar la rama `develop`.
3. Establecer Root Directory `/frontend` y builder Dockerfile.
4. Configurar la variable pública de build:

   ```text
   VITE_API_URL=https://team8-crm-production-3be0.up.railway.app/api
   ```

5. Configurar Healthcheck Path `/health`. No definir manualmente `PORT`; Railway la inyecta.
6. Generar el dominio público del frontend.
7. Copiar el origen HTTPS exacto, sin path, query ni fragmento.
8. En el servicio backend, configurar:

   ```text
   FRONTEND_URL=https://<dominio-frontend-real>
   ```

9. Si existen varios frontends autorizados, usar una lista separada por comas. Cada elemento debe ser un origen HTTPS exacto.
10. Desplegar únicamente el commit revisado y comprobar frontend `/health`, backend `/api/health`, backend `/api/ready`, login y CORS.

No usar un dominio conceptual o inventado para `FRONTEND_URL`; solo el dominio realmente generado por Railway.

## Verificación posterior esperada

```text
GET https://<frontend-real>/health        -> 200, texto ok
GET https://<frontend-real>/              -> 200, index.html
GET https://<frontend-real>/clientes      -> 200, index.html (SPA fallback)
GET https://<frontend-real>/assets/<real> -> 200
GET https://<frontend-real>/assets/<bad>  -> 404
```

En DevTools/Network, las peticiones API deben apuntar a `https://team8-crm-production-3be0.up.railway.app/api`. La respuesta CORS del backend solo debe aceptar el origen frontend configurado.

## Rollback

- Restaurar el deployment frontend anterior.
- Restaurar `FRONTEND_URL` anterior en el backend si el dominio cambió.
- No cambiar `VITE_API_URL` en runtime: requiere un nuevo build porque está incorporada al bundle.
- No modificar la base de datos ni las integraciones externas durante este rollback.
