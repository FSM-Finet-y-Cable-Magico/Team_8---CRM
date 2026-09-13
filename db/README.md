# Base de datos CRM

Esta carpeta contiene los scripts usados por PostgreSQL 15 al iniciar con Docker Compose.

## Orden de carga

1. `init/01_schema.sql`: copia del archivo `mere_finet.sql`.
2. `init/02_local_adjustments.sql`: columnas requeridas por la guia y por autenticacion local.
3. `init/03_seed.sql`: empresas, roles, usuario administrador y categorias base.
4. `init/04_seed_demo.sql`: planes y datos iniciales para los casos de uso.
5. `init/05_seed_cable_magico.sql`: datos completos de prueba para Cable Magico.
6. `init/06_seed_incremento2.sql`: cobranza e inventario avanzado.
7. `init/07_seed_portal_monitoring_tvip.sql`: portal cliente, TV IP y monitoreo.
8. `init/08_seed_reunion_duenos_servicios_contratos.sql`: servicios multiples, planes, zonas, solicitudes, observaciones y contratos digitales.

Los scripts de `init` solo se ejecutan cuando PostgreSQL crea un volumen nuevo. Si
se agregan scripts incrementales despues de crear el volumen local, hay que aplicarlos
manualmente sobre la base existente.

Para agregar los datos de Cable Magico a una base existente:

```powershell
Get-Content db\init\05_seed_cable_magico.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

Para actualizar una base local antigua con los incrementos recientes:

```powershell
Get-Content db\init\06_seed_incremento2.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
Get-Content db\init\07_seed_portal_monitoring_tvip.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
Get-Content db\init\08_seed_reunion_duenos_servicios_contratos.sql | docker exec -i finet-crm-db psql -U postgres -d fsm_db -v ON_ERROR_STOP=1
```

## Usuario inicial

```text
Correo: admin@finet.local
Password: Admin2026!
```

La password se guarda con hash bcrypt en `usuario.password_hash`.
