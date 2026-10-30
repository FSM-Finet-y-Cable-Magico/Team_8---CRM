# I4 — Reconciliación tributaria del contrato SQL

Revisión local 29-10-2026, rama `integrate/i4-facturacion-smtp`, PR #63. **No aplicado a Railway, VPS ni bases compartidas. Emisión fiscal deshabilitada.**

## Delta mínimo y autoridad

La migración publicada `20261022010000_i3_tax_production_preparation/migration.sql` no se reescribe. SHA-256: `e06687281f0539207a2271b5351447764c9c84b08917232b6f446026dd74f6cf`.

| Objeto | Antes | Después |
| --- | --- | --- |
| CHECK de `tax_payment_job.ambiente` | `tax_payment_job_ambiente_check`, solo sandbox | `tax_job_environment_check`, sandbox o production |
| `tax_job_reserved_folio_key` UNIQUE parcial | empresa, tipo DTE, folio esperado | empresa, **ambiente**, tipo DTE, folio esperado |
| Predicado del índice | `folio_esperado <> '0'` | Igual |
| Unicidad de pago | `tax_payment_job_id_pago_key(id_pago)` | Igual: un trabajo por pago, incluso al cambiar ambiente |

El canónico representa ahora el estado posterior a la migración; no incorpora semillas. Hash `init-global.sql`: `52ae791e04e4951bbc0e2b3655dfbf3ecbc1e80e46afcbfa592d90e1aa9a5e91`. Se actualizan hash del parser, cabecera de columnas de health, regresión del índice y reportes de proyección Prisma. No se modifica `schema.prisma`: su string de ambiente y unicidad de pago ya son compatibles; Prisma no expresa aquí el CHECK ni el índice parcial. **No usar db push para reconciliar diferencias de proyección.**

El catálogo esperado conserva 94 tablas, 965 columnas, 94 PK, 221 FK, 58 CHECK y 124 índices explícitos. El audit Prisma conserva sus diferencias de proyección preexistentes: 35 columnas globales, 325 objetos externos, 53 índices y 65 FK fuera de correspondencia declarativa. No se presentan como drift físico nuevo ni como todos los objetos modelados por Prisma.

## Evidencia local

`scripts/i4-tax-postgresql-qa.cjs` crea dos clusters independientes PostgreSQL 18, con usuario y contraseña efímeros, puerto loopback, nombre aleatorio, marcador y data directory verificados antes del DDL. No acepta DATABASE_URL externo ni carga dotenv. Reutiliza las guardas de aislamiento P0-05 y bloqueo de sockets externos. Los proveedores fiscales/SMTP no participan.

1. **Upgrade:** reconstruye exclusivamente las dos definiciones antiguas sobre el resto del canónico, crea pago/trabajo/intención sandbox históricos sintéticos y prueba que production se rechaza. Inyecta un error antes de COMMIT para probar rollback real de DDL e historial; después aplica la migración exacta y compara el catálogo completo con el nuevo canónico.
2. **Fresh:** materializa directamente el nuevo canónico en un cluster vacío y ejecuta los mismos casos posteriores. No aplica de nuevo la migración histórica.
3. Verifica empresa/ambiente, pago único incluso entre ambientes, mismo folio permitido en otro ambiente/empresa y rechazado en el mismo ámbito, CHECK de monto/documento/formato/hash, persistencia de clientes compartidos, conflictos de identidad y claims concurrentes desde conexiones independientes.
4. El estado generado histórico conserva campos y timestamps; un reintento no reescribe fingerprint ni vuelve a obtener un claim confirmado. El harness no emite un DTE real.
5. Pipeline real `enqueuePayment/processPayment/paymentState/recoverArtifacts`, con persistencia PostgreSQL y transporte fiscal/SMTP simulado: cuatro emisiones y cuatro entregas por cluster (ambos ambientes/empresas), sin duplicados tras concurrencia, replay y recuperación. La identidad compartida se conserva.

Resultado y conteos por escenario: `i4-tax-postgresql-qa.evidence.json`. La representación `production` en las filas sintéticas es solo un valor probado en la base QA; no habilita proveedores.

Reproducción, sin dotenv privados, con dependencias instaladas y backend compilado:

```powershell
node scripts/i4-tax-postgresql-qa.cjs
# Opcional: primer argumento = directorio local de binarios PostgreSQL 18.
```

Los informes crudos van a `.codex-review/tax-qa-<uuid>.json`; no sobrescriben evidencia previa. El harness crea y elimina únicamente su propio cluster atestado. Si no puede probar identidad/cleanup, falla. Se necesita permiso local para ejecutar initdb/pg_ctl, no acceso a producción.

## Procedimiento productivo futuro: requiere autorización independiente

**PRE_BACKUP — propietario DB / operaciones.** Confirmar instancia, empresa propietaria, ventana y responsables. Deshabilitar emisión fiscal y drenaje tributario; detener entradas de pagos y procesos G2/G8 que escriban en las tablas afectadas durante la ventana. Registrar trabajos pendientes/en proceso/indeterminados sin reintentarlos. Crear backup cifrado fuera del repositorio y verificar restauración en otra instancia autorizada. Registrar SHA y catálogo del backup; no mostrar credenciales.

**PRE_READONLY — DBA.** En transacción READ ONLY, obtener catálogo fresco y todas las filas de `_prisma_migrations` (nombre, checksum, fechas/estado, sin logs sensibles). Comparar el historial con todas las carpetas locales. No ejecutar `prisma migrate deploy` sin demostrar que no aplicaría ninguna otra migración y resolver el procedimiento de baseline por separado.

Confirmar exactamente:

- Tabla y columnas con tipos/default/nullability esperados; todos los FK e índices vigentes y válidos.
- CHECK antiguo validado, CHECK nuevo ausente y `tax_job_reserved_folio_key` con las tres columnas antiguas y el predicado esperado.
- `tax_payment_job_id_pago_key` único y válido; ausencia de pagos duplicados, trabajos huérfanos, discrepancias pago/factura/contrato/cliente/empresa o ambientes distintos de sandbox.
- Folios válidos según tipo/formato, sin conflictos empresa/ambiente/tipo/folio y sin emisiones en vuelo.
- Hash exacto de migración y canónico; aprobación del propietario de esquema. Si el catálogo está actualizado o parcialmente actualizado, **STOP**: no aplicar otra vez ni ocultar diferencias.

Ejemplos de diagnósticos READ ONLY (operador autorizado, no ejecutados externamente):

```sql
BEGIN READ ONLY;
SELECT id_pago, count(*) FROM tax_payment_job GROUP BY id_pago HAVING count(*) > 1;
SELECT id_empresa, ambiente, tipo_dte, folio_esperado, count(*)
FROM tax_payment_job WHERE folio_esperado <> '0'
GROUP BY id_empresa, ambiente, tipo_dte, folio_esperado HAVING count(*) > 1;
SELECT j.id_trabajo, j.id_pago FROM tax_payment_job j
LEFT JOIN pago p ON p.id_pago=j.id_pago
LEFT JOIN factura f ON f.id_factura=j.id_factura
LEFT JOIN contrato c ON c.id_contrato=f.id_contrato
LEFT JOIN cliente cl ON cl.id_cliente=c.id_cliente
WHERE p.id_pago IS NULL OR f.id_factura IS NULL OR c.id_contrato IS NULL OR cl.id_cliente IS NULL
OR p.id_factura IS DISTINCT FROM j.id_factura OR p.id_cliente IS DISTINCT FROM j.id_cliente
OR c.id_cliente IS DISTINCT FROM j.id_cliente OR c.id_empresa IS DISTINCT FROM j.id_empresa;
SELECT ambiente, estado, count(*) FROM tax_payment_job GROUP BY ambiente, estado;
COMMIT;
```

**APPLY — solo DBA autorizado.** Aplicar únicamente la migración revisada, con `ON_ERROR_STOP`, `lock_timeout` corto y `statement_timeout` acordado según tamaño real. Ya contiene BEGIN/COMMIT. No seed, db push, migrate dev, DDL manual adicional ni activación fiscal. Acordar el registro de historial Prisma según el procedimiento del propietario; no usar resolve para ocultar drift. La preparación local no autoriza ningún resolve externo.

**Locks/riesgos:** ALTER TABLE toma ACCESS EXCLUSIVE; la validación del nuevo CHECK lee la tabla y CREATE UNIQUE INDEX no es concurrente. El lock se mantiene hasta COMMIT y puede bloquear lecturas/escrituras. Prever una ventana y abortar ante timeout, en lugar de acumular sesiones bloqueadas. La migración elimina un CHECK y un índice para reemplazarlos dentro de la misma transacción: **no es puramente aditiva**, aunque no elimina filas ni columnas. No contiene DELETE, TRUNCATE ni actualización de datos.

**POST_READONLY — DBA/G8.** Verificador físico global PASS, conteos/hashes históricos conservados, CHECK nuevo validado, índice nuevo único/válido, pago aún único, invariantes financieros intactos e historial explicado. No cambiar excepciones del verificador para forzar PASS. El audit Prisma se compara con las diferencias de proyección documentadas.

**BACKEND_DEPLOY — operador, fuera de esta tarea.** Schema primero para habilitar el ambiente nuevo; backend después. El backend anterior sigue usando sandbox y es compatible con el esquema nuevo. El backend corregido funciona con el esquema antiguo en sandbox, pero readiness debe bloquear production hasta la migración: por tanto NEW_BACKEND + OLD_SCHEMA **no habilita production**. Configuración privada y autorización fiscal siguen siendo gates independientes incluso tras migrar.

**HEALTH / READY.** Verificar servicios autorizados, configuración por empresa y estado del proveedor sin emitir documentos de prueba reales. Reabrir pagos solo tras la verificación; activar emisión fiscal únicamente con credenciales, folios, política y autorización separadas. No reiniciar ni sobrescribir infraestructura G3 en la VPS.

## Recuperación

- Antes del COMMIT: cualquier error revierte CHECK/índice juntos. Confirmar catálogo antiguo y snapshots; conservar backup e informe, no reintentar automáticamente.
- Después del COMMIT: preferir dejar esquema compatible y deshabilitar proveedor/volver al backend anterior. Nunca borrar trabajos ni documentos generados para hacer pasar un rollback.
- Restaurar el CHECK antiguo requeriría demostrar que no existe ninguna fila production y que no hay duplicados al quitar ambiente del índice; en caso contrario no es seguro. Requiere ventana, decisión del DBA y nuevo SQL revisado, no se automatiza aquí.
- Restaurar backup completo después de reabrir escrituras puede perder pagos/eventos. Solo procede con plan explícito de recuperación y conciliación aprobado. Los documentos fiscales emitidos no se revierten restaurando una base de datos.
