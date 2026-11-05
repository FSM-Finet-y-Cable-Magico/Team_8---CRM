# Bootstrap PostgreSQL local — Incremento 3

Este procedimiento crea una base PostgreSQL local, limpia y descartable. No usa Railway ni lee una URL remota. El script construye la URL con `127.0.0.1`, la muestra con la contraseña oculta y detiene la ejecución si el host no es local.

## Requisitos

- Docker Desktop en ejecución.
- Node.js 20 o posterior.
- Dependencias instaladas con `npm ci`.

## Bootstrap limpio sin datos demo

Desde la raíz del repositorio:

```powershell
npm ci
npm run db:bootstrap:local
```

Valores locales predeterminados:

| Parámetro | Valor |
|---|---|
| Base | `fsm_i3_baseline_test` |
| Host | `127.0.0.1` |
| Puerto | `55432` |
| Contenedor | `finet-crm-i3-baseline-db` |
| Usuario | `postgres` |
| Contraseña | Aleatoria por ejecución; también puede definirse con `FINET_LOCAL_DB_PASSWORD` |

Si no se define `FINET_LOCAL_DB_PASSWORD`, el script genera una contraseña criptográficamente aleatoria y la usa únicamente durante esa ejecución. No la imprime ni la guarda en el repositorio. Para conectarte manualmente al contenedor después del bootstrap, define primero una contraseña temporal de al menos 16 caracteres:

```powershell
$env:FINET_LOCAL_DB_PASSWORD = Read-Host 'Contraseña temporal para PostgreSQL local'
npm run db:bootstrap:local
```

El script reemplaza únicamente el contenedor local con ese nombre. Luego ejecuta, en este orden:

1. los archivos de esquema base y extensiones de `db/init`;
2. cada `backend/prisma/migrations/*/migration.sql` una sola vez;
3. `prisma migrate resolve --applied` para registrar el baseline SQL existente;
4. `prisma migrate deploy` para comprobar que no hay migraciones pendientes;
5. `prisma validate` y `prisma generate`;
6. `scripts/verify-local-db.mjs` para verificar tablas, columnas, FK y una consulta Prisma.

El resultado correcto termina con:

```text
BOOTSTRAP_LOCAL_DB_OK database=fsm_i3_baseline_test container=finet-crm-i3-baseline-db seed=False
```

## Seeds opcionales

El esquema no depende de datos demo. Para agregarlos de forma explícita:

```powershell
npm run db:bootstrap:local -- -WithSeed
```

Los archivos `02_seed_local_adjustments.sql` y `08_seed_reunion_duenos_servicios_contratos.sql` contienen los backfills y datos demo que antes estaban mezclados con DDL. Los demás archivos `*_seed*.sql` continúan siendo optativos.

## Pruebas de integración locales

Con el contenedor levantado por el bootstrap y una contraseña temporal definida en `FINET_LOCAL_DB_PASSWORD`:

```powershell
$encodedPassword = [Uri]::EscapeDataString($env:FINET_LOCAL_DB_PASSWORD)
$env:DATABASE_URL = "postgresql://postgres:${encodedPassword}@127.0.0.1:55432/fsm_i3_baseline_test?schema=public"
$env:CRM_INTEGRATION_TESTS='1'
npm run test -w backend -- --runInBand crm.integration.spec.ts local-db-bootstrap.integration.spec.ts
```

Antes de ejecutar una prueba que escriba, comprueba que el host sea `localhost` o `127.0.0.1`. No reutilices este procedimiento con una URL de Railway.

## Ejecución del backend

```powershell
$encodedPassword = [Uri]::EscapeDataString($env:FINET_LOCAL_DB_PASSWORD)
$env:DATABASE_URL = "postgresql://postgres:${encodedPassword}@127.0.0.1:55432/fsm_i3_baseline_test?schema=public"
npm run start:dev -w backend
```

## Limpieza

```powershell
docker rm -f finet-crm-i3-baseline-db
```

La limpieza elimina solamente el contenedor y su almacenamiento local descartable. El script no crea ni modifica recursos de Railway.
