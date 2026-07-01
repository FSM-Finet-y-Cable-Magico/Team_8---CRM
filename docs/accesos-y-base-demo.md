# Accesos y base de datos demo

Esta guia sirve para levantar el CRM en otro computador y cargar la misma base de datos demo.

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
