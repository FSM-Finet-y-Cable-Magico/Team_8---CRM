# Contrato físico compartido

`init-global.sql` es el contrato físico canónico de PostgreSQL compartido por G1, G2, G3/Ops y G8. No contiene datos ni seeds.

- SHA-256 vigente en esta rama: `0472cdc09051404b5c3c41de30de02d9c8859eb212cb2c02b8307c160da70f50`.
- 96 tablas, 982 columnas, 96 PK, 230 FK, 63 checks y 132 índices explícitos.
- Incluye F3 manual (04-11-2026), autorizado únicamente para desarrollo/QA: dos tablas G8, sin modificar tablas financieras existentes. No implica que la base compartida esté migrada.
- `db/final/init.sql` es un snapshot histórico de G8 y no representa el contrato global vigente.

## Cambio de contrato del 29-09-2026

La versión anterior tenía dos diferencias respecto del modelo aprobado y reconciliado por el operador:

- `REMOVE invalid unique prospecto_id_cliente_key`: un cliente puede relacionarse legítimamente con varios prospectos. No se debe recrear esa unicidad ni modificar datos para satisfacerla.
- `ADD integracion_activacion_g1.payload_snapshot JSONB NULL`: conserva el evento original usado por los reintentos idempotentes de G8.

El cambio está identificado como `CONTRACT_CHANGE` en la cabecera del init. El archivo de propuesta de `payload_snapshot` queda como evidencia histórica y no debe volver a ejecutarse.

La base compartida no transfiere ownership funcional. G8 accede al inventario operativo mediante la API G1. Las tablas receptoras de G1 y el tracking saliente de G8 siguen separadas.

## Cambio de contrato del 30-09-2026

La definición física confirmada de `solicitud_instalacion_integracion`, owner G3, se incorporó exactamente al canónico: 20 columnas, PK serial, dos índices únicos, un índice por `id_empresa`, una FK opcional a `orden_trabajo` y ningún CHECK. Railway ya contiene el objeto; este cambio versiona el contrato y **no debe ejecutarse como migración sobre Railway**.

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

La lectura histórica de I3 obtuvo 1.522 coincidencias y cero faltantes; no representa el estado actual de producción. La política vigente preserva exactamente los cinco extras legacy enumerados en el verificador y `_prisma_migrations` como extra técnico. F3 valida el catálogo completo únicamente en PostgreSQL QA nuevo y actualización desechable; no consulta ni modifica la base compartida.

## F3: imputación manual de pagos a cuotas

`operacion_imputacion_cuota` e `imputacion_cuota` incorporan un ledger relacional
con auditoría obligatoria y reversas compensatorias. La migración propuesta es
`20261104090000_i4_manual_installment_allocation`; no regulariza datos anteriores.
El backend nuevo requiere estas tablas (incluido readiness). Aplicar únicamente
después de aprobar coordinación del esquema compartido, respaldo y preflight.
Ver [diseño](../../docs/i4-f3-imputaciones-diseno.md) y
[implementación y QA](../../docs/i4-f3-imputaciones-validacion.md).

No usar `db push`, migraciones históricas ni el reconciliador obsoleto para cambiar la base compartida. Ver [contrato y proyección](../../docs/i3-global-database-contract.md) y [verificación final](../../docs/i3-global-verification-final.md).
