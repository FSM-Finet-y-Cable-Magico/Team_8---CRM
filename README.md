# Team 8 - CRM FiNet

Sistema CRM integral para FiNet y Cable Magico Litoral, orientado a centralizar
la gestion comercial, tecnica, de clientes, inventario, tickets y reportes
operativos del servicio.

**Stack:** NestJS - Prisma - PostgreSQL 15 - React - Vite - TypeScript - Docker Compose

---

## Requisitos previos

- [Node.js](https://nodejs.org/) v20.11 o superior
- npm v9 o superior
- Git
- Docker Desktop, recomendado para levantar la base local sin instalar PostgreSQL
- PostgreSQL 15, solo si se ejecuta el proyecto sin Docker

---

## Instalacion

### 1. Clonar el repositorio

```bash
git clone https://github.com/FSM-Finet-y-Cable-Magico/Team_8---CRM.git
cd Team_8---CRM
```

### 2. Configurar variables de entorno

Crear un archivo `.env` en la raiz del proyecto usando `.env.example` como base.
Las credenciales reales o compartidas deben pedirse al equipo por el canal privado.

```env
POSTGRES_DB=fsm_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=5432

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fsm_db?schema=public
JWT_SECRET=change_me_in_local_env
JWT_EXPIRES_IN=8h

BACKEND_PORT=3000
FRONTEND_PORT=5173
VITE_API_URL=/api
API_PROXY_TARGET=http://127.0.0.1:3000
```

> No subir credenciales reales al repositorio.

### 3. Instalar dependencias

```powershell
npm install
npm run prisma:generate
```

---

## Puesta en marcha con Docker

Desde la raiz del proyecto:

```powershell
docker compose up --build
```

Servicios esperados:

| Servicio | URL / puerto |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3000/api` |
| PostgreSQL | `localhost:5432` o el valor definido en `POSTGRES_PORT` |

El contenedor de PostgreSQL carga automaticamente los scripts iniciales:

```text
db/init/01_schema.sql
db/init/02_local_adjustments.sql
db/init/03_seed.sql
db/init/04_seed_demo.sql
```

Credenciales iniciales:

```text
Correo: admin@finet.local
Password: Admin2026!
```

Usuarios demo:

```text
comercial@finet.local  (rol Comercial)
soporte@finet.local    (rol Soporte)
terreno@finet.local    (rol Terreno)
```

Todos los usuarios demo usan la contrasena `Admin2026!`.

Guia detallada: `docs/puesta-en-marcha-docker.md`.

---

## Puesta en marcha local sin Docker

1. Agrega PostgreSQL 15 al PATH o usa la ruta absoluta:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
```

2. Crea la base y carga los scripts:

```powershell
createdb -U postgres fsm_db
psql -U postgres -d fsm_db -f db/init/01_schema.sql
psql -U postgres -d fsm_db -f db/init/02_local_adjustments.sql
psql -U postgres -d fsm_db -f db/init/03_seed.sql
psql -U postgres -d fsm_db -f db/init/04_seed_demo.sql
```

3. Crea `backend/.env` basado en `backend/.env.example`.

4. Instala dependencias, genera Prisma y levanta el proyecto:

```powershell
npm install
npm run prisma:generate
npm run dev
```

---

## Correr la aplicacion por separado

### Backend

```powershell
npm run dev:backend
```

Backend disponible en `http://localhost:3000/api`.

### Frontend

```powershell
npm run dev:frontend
```

Frontend disponible en `http://localhost:5173`.

Para compartir la aplicacion con VS Code Ports, publica solo el puerto del
frontend (`5173`). El frontend llama a `/api` y Vite reenvia esas peticiones al
backend local, por lo que PostgreSQL (`5432`) no debe exponerse publicamente.

---

## Estructura del proyecto

```text
Team_8---CRM/
|-- backend/                  # API REST - NestJS + Prisma
|   |-- prisma/
|   |   `-- schema.prisma     # Modelo Prisma basado en PostgreSQL
|   `-- src/
|       |-- auth/             # Login, JWT y sesion de usuario
|       |-- users/            # Usuarios y perfiles por rol
|       |-- companies/        # Selector FiNet / Cable Magico / consolidado
|       |-- prospects/        # Prospectos, pipeline, cotizacion y contratos
|       |-- customers/        # Clientes, estados e historial
|       |-- tickets/          # Tickets, categorias, prioridad y diagnostico
|       |-- inventory/        # Equipos, movimientos e instalacion de router/ONU
|       |-- work-orders/      # Ordenes de instalacion y cierre tecnico
|       |-- reports/          # Exportacion CSV/XLSX
|       |-- audit/            # Registro de acciones relevantes
|       `-- rut/              # Validacion de RUT chileno
|
|-- frontend/                 # React + Vite + TypeScript
|   `-- src/
|       |-- App.tsx           # Vistas principales del CRM
|       |-- api.ts            # Cliente HTTP hacia el backend
|       `-- styles.css        # Estilos base de la interfaz
|
|-- db/
|   |-- init/                 # Schema, ajustes locales y seeds iniciales
|   `-- demo_seed.sql         # Datos demo para ejercitar casos de uso
|
|-- docs/                     # Guias de desarrollo y estado del incremento
|-- docker-compose.yml        # Orquestacion local
|-- package.json              # Scripts del monorepo
`-- requerimientos.txt        # Resumen de alcance funcional
```

---

## Modulos principales

### Comercial y CRM

1. Registro de prospectos comerciales.
2. Actualizacion del pipeline de ventas.
3. Verificacion de factibilidad tecnica.
4. Generacion de cotizaciones en PDF.
5. Registro de perdida de prospectos.
6. Contratacion de planes y generacion de ordenes de instalacion.

### Clientes y soporte

1. Actualizacion de estado operativo del cliente.
2. Consulta del historial completo del cliente.
3. Registro de tickets asociados a RUT existente.
4. Clasificacion por categoria de falla.
5. Asignacion de prioridad y actualizacion de estado.
6. Registro de diagnostico tecnico post-visita.

### Inventario y operaciones tecnicas

1. Registro de movimientos de inventario.
2. Actualizacion del estado logico de equipos.
3. Filtro de inventario por empresa propietaria.
4. Instalacion de router/ONU y vinculacion con cliente.
5. Cierre de ordenes de instalacion y activacion de clientes.

### Administracion y reportes

1. Autenticacion de empleados con correo corporativo.
2. Gestion de perfiles por rol.
3. Selector de vista FiNet, Cable Magico o consolidado.
4. Auditoria de acciones relevantes.
5. Exportacion de reportes operativos en CSV o Excel.

---

## Primer incremento cubierto

El primer incremento contempla 28 casos de uso implementados o demostrables con
datos locales:

- CU43: autenticacion de empleado.
- CU44: gestion de perfiles por rol.
- CU45: selector de vista por empresa.
- CU46: auditoria de acciones.
- CU15: validacion de RUT chileno.
- CU11: importacion CSV/XLS/XLSX.
- CU01: registro de nuevo prospecto comercial.
- CU02: actualizacion del pipeline de prospectos.
- CU06: verificacion de factibilidad tecnica.
- CU03: generacion de cotizacion PDF.
- CU04: registro de motivo de perdida.
- CU12: registro de plan contratado.
- CU17: generacion de orden de instalacion.
- CU08: actualizacion de estado del cliente.
- CU14: consulta de historial completo del cliente.
- CU53: registro de movimiento de inventario.
- CU54: actualizacion de estado logico de equipo.
- CU62: visualizacion de inventario por empresa.
- CU20: instalacion de router/ONU.
- CU59: vinculacion de equipo instalado al cliente.
- CU23: registro de ticket de soporte.
- CU24: clasificacion de ticket por categoria de falla.
- CU25: asignacion de prioridad del ticket.
- CU26: actualizacion de estado del ticket.
- CU21: registro de diagnostico tecnico.
- CU07: cierre de instalacion y activacion de cliente.
- CU10: calculo de tiempo de conversion.
- CU33: exportacion de reportes operativos.

Documentacion relacionada:

- Guia operativa: `docs/desarrollo-paso-a-paso.md`
- Estado del incremento: `docs/estado-primer-incremento.md`
- Cobertura de casos de uso: `docs/casos-uso-primer-incremento.md`

---

## Base de datos

La base local usa PostgreSQL 15 y se inicializa desde `db/init/01_schema.sql`.
El modelo incluye tablas para empresas, usuarios, roles, clientes, prospectos,
contratos, tickets, ordenes de trabajo, inventario, reportes y auditoria.

Para cargar datos demo adicionales en Docker:

```powershell
Get-Content db\demo_seed.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

Si se trabaja con una base compartida, coordinar cualquier cambio de schema con
el equipo antes de ejecutar migraciones o scripts destructivos.

---

## Trabajo con ramas

Flujo sugerido para participar desde una rama propia:

```powershell
git checkout develop
git pull origin develop
git checkout -b arreglolevi
```

Despues de realizar cambios locales:

```powershell
git status
git add README.md
git commit -m "docs: actualiza README del CRM Grupo 8"
git push origin arreglolevi
```

Luego crear un Pull Request desde `arreglolevi` hacia `develop`.
