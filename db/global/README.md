# Contrato físico compartido

`init-global.sql` es el contrato físico final de PostgreSQL compartido por G1, G2, G3/Ops y G8. Se conserva byte por byte como fue recibido, sin datos ni seeds.

- SHA-256: `af5892827b2e41ce15aec0d620cb10a2336d3236596f487af61cc6b41c2b87da`.
- 90 tablas, 876 columnas, 90 PK, 210 FK, 33 checks y 107 índices explícitos (38 únicos y 69 no únicos; las PK generan además sus índices).
- Fuente: `E:\Downloads\init-global.sql`; informe recibido: `informe-integracion-init-global.md`.
- `db/final/init.sql` es un snapshot histórico/específico de G8, **no** el contrato de producción global.

La base compartida no transfiere ownership funcional. G8 sigue accediendo al inventario operativo mediante la API G1. Las tablas de tracking saliente G8 y receptor G1 permanecen separadas.

## Archivos y estado

|Archivo|Propósito|Estado|
|---|---|---|
|`init-global.sql`|Contrato recibido e inmutable|Referencia canónica|
|`reconcile-railway-to-init-global.sql`|Diferencias respecto de la lectura Railway del 29-09-2026|PREPARADO_NO_EJECUTADO|
|`proposals/001-g1-payload-snapshot.sql`|Añadir el evento original JSONB para reintentos G8|GLOBAL_SCHEMA_CHANGE_PROPOSED / PREPARADO_NO_EJECUTADO|

El SQL de reconciliación exige revisión explícita en la sesión del operador. No se ejecuta desde npm, bootstrap ni deploy. Antes de cualquier aplicación: respaldo verificado, nueva introspección, acuerdo de propietarios, revisión de datos existentes y huso horario histórico, ventana de bloqueo y plan de recuperación. Crear restricciones puede fallar por duplicados o referencias huérfanas: no se borran ni inventan datos para evitar esos errores.

`CREATE TABLE IF NOT EXISTS` no cambia tipos ni añade columnas en tablas preexistentes. Ejecutar directamente el init sobre Railway antiguo no realiza la reconciliación.

## Auditorías desde la raíz del repositorio

```powershell
npm.cmd run db:audit:prisma-global
node --env-file=.env.railway scripts/verify-global-db.mjs
node scripts/prepare-global-reconciliation.mjs
```

El primer comando compara archivos. El segundo utiliza `DATABASE_URL` en una transacción READ ONLY; devuelve 0 si coincide, 1 si hay diferencias y 2 si falla configuración/lectura. El tercero solo regenera los archivos SQL y el reporte desde `docs/i3-railway-catalog.json`; no conecta ni aplica DDL. Ese catálogo es evidencia fechada, no una garantía de estado futuro. Las variables `GLOBAL_DB_REPORT_PATH` y `GLOBAL_DB_CATALOG_PATH` permiten guardar una nueva lectura saneada del verificador.

La propuesta `payload_snapshot` queda deliberadamente fuera del hash canónico. Su aprobación requerirá versionar el contrato global con los grupos y actualizar verificadores; aplicada sobre el contrato actual aparecerá como columna extra. El código nuevo depende de esa columna incluso siendo nullable en Prisma. No desplegarlo antes de resolver esta dependencia.

Consultar [informe de continuación](../../docs/i3-global-continuation-report.md), [contrato y proyección](../../docs/i3-global-database-contract.md) y [plan de baseline](../../docs/i3-prisma-global-baseline-plan.md). No ejecutar `db push`, `migrate deploy`, `migrate resolve` ni migraciones históricas para esconder diferencias.
