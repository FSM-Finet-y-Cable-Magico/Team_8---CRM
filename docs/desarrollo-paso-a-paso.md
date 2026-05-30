# Desarrollo paso a paso

## 1. Preparar variables

Copiar `.env.example` a `.env`. Para Docker no es obligatorio cambiar valores en desarrollo, pero `JWT_SECRET` debe cambiar antes de publicar.

## 2. Levantar ambiente reproducible

```powershell
docker compose up --build
```

Servicios esperados:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- PostgreSQL: `localhost:5432`, base `fsm_db`

## 3. Entrar al sistema

```text
Correo: admin@finet.local
Password: Admin2026!
```

## 4. Validar conexion y flujo minimo

1. Iniciar sesion.
2. Cambiar selector de empresa entre Consolidado, FiNet y Cable Magico.
3. Validar un RUT desde el modulo RUT.
4. Crear un prospecto desde Prospectos.
5. Revisar que el evento aparezca en Auditoria.

## 5. Importacion masiva

Usar CSV, XLS o XLSX con columnas:

```text
rut,nombre,apellido,email,celular,direccion,tipo_registro,estado
```

`tipo_registro` acepta `cliente` o `prospecto`. Si se omite, se importa como prospecto.

## 6. Conexion local sin Docker

Si se usa PostgreSQL local, cargar los scripts en este orden:

```powershell
& "C:\Program Files\PostgreSQL\15\bin\createdb.exe" -U postgres fsm_db
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d fsm_db -f db/init/01_schema.sql
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d fsm_db -f db/init/02_local_adjustments.sql
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d fsm_db -f db/init/03_seed.sql
```

Luego crear `backend/.env`:

```text
DATABASE_URL="postgresql://postgres:TUPASSWORD@localhost:5432/fsm_db?schema=public"
JWT_SECRET="un_secreto_local"
JWT_EXPIRES_IN="8h"
PORT=3000
FRONTEND_URL="http://localhost:5173"
```

## 7. Comandos de desarrollo

```powershell
npm install
npm run prisma:generate
npm run dev
```

## 8. Primer incremento implementado

- CU43: `POST /api/auth/login`, `GET /api/auth/me`.
- CU44: `GET /api/users`, `GET /api/users/roles`, `PATCH /api/users/:id/role`.
- CU45: `GET /api/companies`, `GET /api/companies/summary?scope=...`.
- CU46: `GET /api/audit`.
- CU15: `POST /api/rut/validate`.
- CU11: `POST /api/imports/clients`.
- CU01: `POST /api/prospects`, `GET /api/prospects`.
