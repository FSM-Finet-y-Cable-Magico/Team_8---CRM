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
6. Gestionar el prospecto: actualizar pipeline, verificar factibilidad, generar cotizacion, registrar plan y crear OT.

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
- CU02: `PATCH /api/prospects/:id/pipeline`.
- CU06: `POST /api/prospects/:id/feasibility`.
- CU03: `POST /api/prospects/:id/quotes`, `GET /api/prospects/:id/quotes/:quoteId/pdf`.
- CU04: `POST /api/prospects/:id/loss`.
- CU12: `POST /api/prospects/:id/contracts`.
- CU17: `POST /api/prospects/:id/install-orders`.
- CU08: `PATCH /api/customers/:id/status`.
- CU14: `GET /api/customers/:id/history`.
- CU53: `POST /api/inventory/movements`.
- CU54: `PATCH /api/inventory/equipment/:id/status`.
- CU62: `GET /api/inventory?scope=...`.
- CU20: `POST /api/inventory/equipment/:id/install`.
- CU59: `POST /api/inventory/equipment/:id/install`.
- CU23: `POST /api/tickets`, `GET /api/tickets`.
- CU24: `PATCH /api/tickets/:id/category`.
- CU25: `PATCH /api/tickets/:id/priority`.
- CU26: `PATCH /api/tickets/:id/status`.
- CU21: `POST /api/tickets/:id/diagnosis`.
- CU07: `PATCH /api/work-orders/:id/complete-installation`.
- CU10: `PATCH /api/work-orders/:id/complete-installation`.
- CU33: `GET /api/reports/export?type=clientes|prospectos|tickets|inventario&format=csv|xlsx`.

## 9. Flujo recomendado para probar casos 14 a 28

1. Entrar como `admin@finet.local`.
2. Abrir Clientes, seleccionar un cliente, cambiar estado y cargar historial.
3. Abrir Inventario, crear un equipo, registrar un movimiento y cambiar estado logico.
4. Vincular un equipo disponible a un cliente con MAC y puerto OLT.
5. Abrir Tickets, crear ticket por RUT, clasificar categoria, asignar prioridad y avanzar estado.
6. Registrar diagnostico tecnico para resolver ticket y actualizar estado final del servicio.
7. Abrir OTs, completar una orden de instalacion y verificar que el cliente quede Activo.
8. Abrir Reportes y descargar CSV/XLSX de clientes, prospectos, tickets e inventario.

## 10. Nota sobre base de datos compartida

Los bloques 2 y 3 no agregan columnas ni modifican scripts de estructura. Para mantener compatibilidad con la base global, la factibilidad usa:

- `prospecto.estado_pipeline` para avanzar o marcar perdida.
- `prospecto.motivo_perdida` cuando no hay cobertura.
- `cotizacion.factibilidad_verificada` como evidencia de factibilidad positiva.
- `log_auditoria.valor_nuevo` para observaciones y trazabilidad.

Para router/ONU se mantiene la misma logica: la serie queda en `unidad_equipo.numero_serie` y MAC/OLT se documentan en `unidad_equipo.diagnostico_tecnico` y `orden_trabajo.observaciones` cuando corresponde. No se requiere alterar `db/init/01_schema.sql`, `db/init/02_local_adjustments.sql` ni `db/init/03_seed.sql`.
