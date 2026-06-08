# Puesta en marcha local con Docker

Esta guia documenta el flujo recomendado para levantar el CRM en desarrollo local sin depender de Railway ni de una instalacion manual de PostgreSQL.

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

Railway puede usarse como base compartida o entorno de demo del equipo. Para desarrollo local se recomienda Docker con base local, asi se evitan cambios accidentales en la base compartida.

No copiar una `DATABASE_URL` de Railway en `.env` local sin coordinarlo con el equipo.
