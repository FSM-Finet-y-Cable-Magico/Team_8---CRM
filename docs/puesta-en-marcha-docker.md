# Puesta en marcha con Docker y Railway

Esta guia documenta dos modos independientes:

- Docker local completo: frontend, backend y PostgreSQL local.
- Docker con Railway: frontend y backend locales conectados al PostgreSQL remoto.

## Requisitos

- Docker Desktop instalado y con estado `Engine running`.
- WSL 2 habilitado en Windows.
- Repositorio clonado en una ruta local, por ejemplo:

```powershell
C:\CODE\WAMP\www\Proyectos\Team_8---CRM
```

## Variables locales

Desde la raiz del proyecto, crear `.env` a partir del ejemplo:

```powershell
copy .env.example .env
```

Si la maquina ya tiene PostgreSQL local usando `5432`, cambiar en `.env`:

```env
POSTGRES_PORT=5433
```

Con ese ajuste, el contenedor PostgreSQL sigue usando `5432` internamente, pero desde Windows se accede por `localhost:5433`.

## Levantar servicios

```powershell
docker compose up --build -d
```

Servicios esperados:

| Servicio | Contenedor | URL / puerto |
| --- | --- | --- |
| Frontend | `finet-crm-frontend` | `http://localhost:5173` |
| Backend API | `finet-crm-backend` | `http://localhost:3000/api` |
| PostgreSQL | `finet-crm-db` | `localhost:5433` si se cambio `POSTGRES_PORT` |

Credenciales iniciales:

```text
Correo: admin@finet.local
Password: Admin2026!
```

## Ver estado y logs

```powershell
docker compose ps
docker compose logs backend --tail 80
docker compose logs frontend --tail 80
docker compose logs db --tail 80
```

`http://localhost:3000/api` puede responder 404 porque no hay ruta raiz de API. Para validar backend, probar una ruta real o iniciar sesion desde el frontend.

## Cargar datos demo locales

El seed base solo crea empresas, roles, usuario admin y categorias de falla. Para probar el primer incremento con datos completos, aplicar:

```powershell
Get-Content db\demo_seed.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

Este seed agrega planes, clientes, prospectos, contratos, equipos, tickets y ordenes de trabajo de prueba. No se ejecuta automaticamente y no apunta a Railway.

## Ver base de datos

Conexion para DBeaver, pgAdmin o TablePlus:

```text
Host: localhost
Port: 5433
Database: fsm_db
Username: postgres
Password: postgres
```

Por terminal:

```powershell
docker exec -it finet-crm-db psql -U postgres -d fsm_db
```

## Reiniciar y apagar

Reiniciar un servicio:

```powershell
docker compose restart frontend
docker compose restart backend
```

Apagar sin borrar datos:

```powershell
docker compose down
```

Apagar borrando la base local:

```powershell
docker compose down -v
```

Usar `down -v` solo cuando se quiera recrear la base desde cero, porque borra el volumen `postgres_data`.

## Railway

Railway puede usarse como base compartida o entorno de demo del equipo. Railway expone `DATABASE_URL` y permite conexiones externas mediante su TCP Proxy. Desde un contenedor Docker ejecutado en el computador se debe usar la URL publica del proxy, no una direccion privada `*.railway.internal`.

### Preparar las variables

Crear el archivo privado desde la plantilla:

```powershell
Copy-Item .env.railway.example .env.railway
```

Editar `.env.railway` y reemplazar `DATABASE_URL` por la URL publica entregada por Railway. El archivo real esta ignorado por Git y no debe confirmarse en commits.

### Levantar Docker conectado a Railway

```powershell
npm run docker:railway
```

Servicios esperados:

| Servicio | URL |
| --- | --- |
| Frontend Railway | `http://localhost:5174` |
| Backend Railway | `http://localhost:3001/api` |
| PostgreSQL | Railway mediante TCP Proxy |

Este modo usa `docker-compose.railway.yml` y deliberadamente no crea un contenedor PostgreSQL local. El backend recibe `DATABASE_URL` desde `.env.railway`.

Para revisar el estado y los logs:

```powershell
docker compose --env-file .env.railway -f docker-compose.railway.yml ps
docker compose --env-file .env.railway -f docker-compose.railway.yml logs backend --tail 100
```

Para apagarlo:

```powershell
npm run docker:railway:down
```

Los puertos alternativos permiten mantener simultaneamente el stack local en `5173/3000` y el stack conectado a Railway en `5174/3001`.

### Backend local sin Docker conectado a Railway

Si solo se ejecuta NestJS desde la terminal, copiar la URL publica a `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:REEMPLAZAR_PASSWORD@REEMPLAZAR_HOST_PROXY:REEMPLAZAR_PUERTO/railway?schema=public
```

Luego ejecutar:

```powershell
npm run prisma:generate
npm run dev:backend
```

### Seguridad

- No escribir credenciales reales en `docker-compose*.yml`, `.env.example`, documentacion ni commits.
- No ejecutar seeds, `prisma db push` o scripts SQL contra Railway sin respaldo y coordinacion del equipo.
- Si una contrasena fue compartida en texto plano o dentro de un documento, se recomienda rotarla desde Railway.
