# Accesos y base de datos demo

Esta guía sirve para levantar el CRM local y compartir una base de pruebas.

## Base sintética compartida para el CRM local

El archivo [seed-crm-local.sql](../db/seed-crm-local.sql) recrea los registros operativos de FiNet y Cable Mágico en el PostgreSQL de Docker local. Conserva empresas, usuarios, roles, planes y catálogos. Los nombres son ficticios y los correos usan `example.invalid`. La carga incluye antecedentes simulados de G2 y G3 y se ejecuta íntegramente en PostgreSQL.

Con el Compose local iniciado, desde la raíz de la rama en PowerShell:

```powershell
docker compose exec -T backend npx --no-install prisma migrate deploy --schema prisma/schema.prisma
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
# Ensayar y verificar los datos. PostgreSQL revierte la transacción.
Get-Content -Raw -Encoding UTF8 db/seed-crm-local.sql | docker compose exec -T db psql -X -U postgres -d fsm_db
# Reemplazar los datos operativos locales después de verificar la carga.
Get-Content -Raw -Encoding UTF8 db/seed-crm-local.sql | docker compose exec -T db psql -X -U postgres -d fsm_db -v aplicar=true
```

| Caso | Buscar en FiNet |
| --- | --- |
| Prospecto nuevo, cotización enviada y firma pendiente | Martina Rivas, Josefa Cisternas y Gabriel Saavedra |
| Contrato firmado por instalar, orden asignada, en curso y cliente ausente | Paula Valdés, Catalina Yáñez, Nicolás Olivares y Fernanda Correa |
| Cambio WiFi remoto y escalamiento con visita | María Paz Araya y Marcelo Riquelme |
| Pago parcial, convenio con cuotas y prórroga vigente | Felipe Rojas, Francisca Mora y Álvaro Barrientos |
| Varias facturas vencidas, último aviso, suspensión y retiro | Constanza Molina, Verónica Céspedes, Cristóbal Pizarro y Macarena Ortega |
| Al día con documento externo, alta sin facturas y segundo plan por firmar | Andrés Salinas, Javiera Henríquez y Rodrigo Cárdenas |

## Copia histórica de demostración

## Requisitos

- Tener Docker Desktop instalado y abierto.
- Tener el repositorio clonado.
- Tener el archivo de base de datos demo en la carpeta `db/`.

Archivo actual de la base demo:

```text
db/fsm_db_local_demo-20260701-192530.dump
```

Si el archivo se envia por WhatsApp, Drive, correo o pendrive, debe quedar copiado dentro de la carpeta `db/` del proyecto.

## Cargar la base de datos

Desde la carpeta raiz del proyecto, ejecutar:

```powershell
docker compose up -d db
docker cp db/fsm_db_local_demo-20260701-192530.dump finet-crm-db:/tmp/fsm_db_local_demo.dump
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges -U postgres -d fsm_db /tmp/fsm_db_local_demo.dump
docker compose up -d
```

Con eso queda cargada la base `fsm_db` y se levantan backend y frontend.

Una vez iniciado el backend con el esquema actual, retira las fichas de prueba incompletas que incluye la copia histórica:

```powershell
Get-Content db/cleanup-legacy-demo.sql | docker compose exec -T db psql -X -U postgres -d fsm_db
```

La limpieza se puede repetir. Solo aplica a la copia de demostración local y verifica las identidades y sus relaciones.

## Abrir el sistema

Frontend:

```text
http://localhost:5173
```

Backend API:

```text
http://localhost:3000/api
```

Base de datos local:

```text
localhost:5433
Base: fsm_db
Usuario: postgres
Password: postgres
```

No es necesario abrir la base de datos para usar el sistema. Solo se usa internamente por Docker.

## Usuarios demo

Cada rol tiene dos usuarios: uno para FiNet y otro para Cable Magico.

| Empresa | Rol | Correo | Contrasena |
|---|---|---|---|
| FiNet | Administrador | `admin@finet.local` | `Admin2026!` |
| Cable Magico | Administrador | `admin@cable.local` | `Admin2026!` |
| FiNet | Comercial | `comercial@finet.local` | `Comercial2026!` |
| Cable Magico | Comercial | `comercial@cable.local` | `Comercial2026!` |
| FiNet | Soporte | `soporte@finet.local` | `Soporte2026!` |
| Cable Magico | Soporte | `soporte@cable.local` | `Soporte2026!` |
| FiNet | Terreno | `terreno@finet.local` | `Terreno2026!` |
| Cable Magico | Terreno | `terreno@cable.local` | `Terreno2026!` |
| FiNet | Inventario | `inventario@finet.local` | `Inventario2026!` |
| Cable Magico | Inventario | `inventario@cable.local` | `Inventario2026!` |

## Roles disponibles

| Rol | Uso principal |
|---|---|
| Administrador | Acceso completo, usuarios, auditoria, reportes y datos generales. |
| Comercial | Prospectos, cotizaciones, contratos y gestion comercial. |
| Soporte | Clientes, tickets, factibilidad y apoyo operativo. |
| Terreno | Ordenes de trabajo e instalaciones. |
| Inventario | Inventario, equipos, movimientos y stock. |

## Apagar el proyecto

Para detener todo:

```powershell
docker compose down
```

Esto apaga los contenedores, pero no borra la base guardada en el volumen de Docker.

## Nota importante

El archivo `.dump` contiene datos de demo y usuarios con contrasenas conocidas. No se debe subir a un repositorio publico ni compartir con personas ajenas a la prueba.
