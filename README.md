# Team 8 - CRM FiNet

Ambiente base para el primer incremento del CRM de FiNet y Cable Magico Litoral.

## Stack

- Backend: Node.js, NestJS, Prisma.
- Frontend: React, Vite, TypeScript.
- Base de datos: PostgreSQL 15 con el schema de `db/init/01_schema.sql`.
- Orquestacion: Docker Compose.

## Puesta en marcha con Docker

1. Copia `.env.example` a `.env` y ajusta secretos locales si corresponde.
2. Ejecuta:

```powershell
docker compose up --build
```

3. Abre `http://localhost:5173`.
4. Usa el usuario inicial:

```text
Correo: admin@finet.local
Password: Admin2026!
```

Guia detallada de Docker, puertos y base local: `docs/puesta-en-marcha-docker.md`.

El contenedor de PostgreSQL carga automaticamente:

- `db/init/01_schema.sql`
- `db/init/02_local_adjustments.sql`
- `db/init/03_seed.sql`
- `db/init/04_seed_demo.sql`

`04_seed_demo.sql` agrega datos minimos para ejercitar los 28 casos de uso:
planes comerciales, usuarios por rol y un cliente demo. Todos los usuarios demo
comparten la contrasena `Admin2026!`:

```text
comercial@finet.local  (rol Comercial)
soporte@finet.local    (rol Soporte)
terreno@finet.local    (rol Terreno)
```

Para probar el primer incremento con datos demo locales:

```powershell
Get-Content db\demo_seed.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

## Puesta en marcha local sin Docker

1. Agrega PostgreSQL 15 al PATH o usa la ruta absoluta:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
```

2. Crea la base y carga scripts:

```powershell
createdb -U postgres fsm_db
psql -U postgres -d fsm_db -f db/init/01_schema.sql
psql -U postgres -d fsm_db -f db/init/02_local_adjustments.sql
psql -U postgres -d fsm_db -f db/init/03_seed.sql
psql -U postgres -d fsm_db -f db/init/04_seed_demo.sql
```

3. Crea `backend/.env` basado en `backend/.env.example`.
4. Instala dependencias y genera Prisma:

```powershell
npm install
npm run prisma:generate
npm run dev
```

## Primeros casos cubiertos

- CU43: autenticacion de empleado.
- CU44: gestion de perfiles por rol.
- CU45: selector de vista por empresa.
- CU46: auditoria de acciones.
- CU15: validacion de RUT chileno.
- CU11: importacion CSV/XLS/XLSX.
- CU01: registro de nuevo prospecto comercial.

Guia operativa: `docs/desarrollo-paso-a-paso.md`.
Estado de casos de uso: `docs/estado-primer-incremento.md`.
