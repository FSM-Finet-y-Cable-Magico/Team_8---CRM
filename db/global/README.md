# Contrato físico compartido

`init-global.sql` es el contrato físico canónico de PostgreSQL compartido por G1, G2, G3/Ops y G8. No contiene datos ni seeds.

- SHA-256 vigente: `e3f43ed3e58fba9a73e8a3dd566e2ab245061bcdb6bfb60ac69c6be21692834c`.
- 90 tablas, 877 columnas, 90 PK, 210 FK, 33 checks y 106 índices explícitos.
- `db/final/init.sql` es un snapshot histórico de G8 y no representa el contrato global vigente.

## Cambio de contrato del 29-09-2026

La versión anterior tenía dos diferencias respecto del modelo aprobado y reconciliado por el operador:

- `REMOVE invalid unique prospecto_id_cliente_key`: un cliente puede relacionarse legítimamente con varios prospectos. No se debe recrear esa unicidad ni modificar datos para satisfacerla.
- `ADD integracion_activacion_g1.payload_snapshot JSONB NULL`: conserva el evento original usado por los reintentos idempotentes de G8.

El cambio está identificado como `CONTRACT_CHANGE` en la cabecera del init. El archivo de propuesta de `payload_snapshot` queda como evidencia histórica y no debe volver a ejecutarse.

La base compartida no transfiere ownership funcional. G8 accede al inventario operativo mediante la API G1. Las tablas receptoras de G1 y el tracking saliente de G8 siguen separadas.

## Archivos y estado

|Archivo|Propósito|Estado|
|---|---|---|
|`init-global.sql`|Contrato global vigente|CANONICAL|
|`reconcile-railway-to-init-global.sql`|Reconciliación preparada para el contrato anterior|HISTORICAL / NO EJECUTAR|
|`proposals/001-g1-payload-snapshot.sql`|Propuesta que originó la columna ahora canónica|HISTORICAL / YA APLICADA POR OPERADOR|

## Auditorías desde la raíz

```powershell
npm.cmd run db:audit:prisma-global
node --env-file=.env.railway scripts/verify-global-db.mjs
```

El primer comando compara archivos. El segundo consulta los catálogos dentro de una transacción `READ ONLY`; devuelve 0 si coincide, 1 si hay diferencias y 2 si falla la configuración o lectura. `GLOBAL_DB_REPORT_PATH` y `GLOBAL_DB_CATALOG_PATH` permiten guardar evidencia saneada.

La lectura del `2026-09-29T22:48:09.805Z` obtuvo `PASS`: los 1.495 objetos contractuales comparados coinciden y `_prisma_migrations` es el único extra permitido. No se ejecutaron escrituras desde esta rama.

No usar `db push`, migraciones históricas ni el reconciliador obsoleto para cambiar la base compartida. Ver [contrato y proyección](../../docs/i3-global-database-contract.md) y [verificación final](../../docs/i3-global-verification-final.md).
