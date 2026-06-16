# Base de datos CRM

Esta carpeta contiene los scripts usados por PostgreSQL 15 al iniciar con Docker Compose.

## Orden de carga

1. `init/01_schema.sql`: copia del archivo `mere_finet.sql`.
2. `init/02_local_adjustments.sql`: columnas requeridas por la guia y por autenticacion local.
3. `init/03_seed.sql`: empresas, roles, usuario administrador y categorias base.
4. `init/04_seed_demo.sql`: planes y datos iniciales para los casos de uso.
5. `init/05_seed_cable_magico.sql`: datos completos de prueba para Cable Magico.

Los scripts de `init` solo se ejecutan cuando PostgreSQL crea un volumen nuevo. Para
agregar los datos de Cable Magico a una base existente, ejecutar manualmente:

```powershell
Get-Content db\init\05_seed_cable_magico.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

## Usuario inicial

```text
Correo: admin@finet.local
Password: Admin2026!
```

La password se guarda con hash bcrypt en `usuario.password_hash`.
