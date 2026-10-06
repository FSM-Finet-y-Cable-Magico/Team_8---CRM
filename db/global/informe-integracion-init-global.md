# Informe de integración · `init-global.sql`

> **SNAPSHOT HISTÓRICO.** Este informe describe la fusión inicial de 90 tablas. El contrato vigente incorpora posteriormente `solicitud_instalacion_integracion` y tiene 91 tablas; consultar [README.md](README.md).

**Fecha:** 2026-09-28
**Objetivo:** fusionar los 4 esquemas (`init.sql`) de los grupos que comparten la base de
datos en un único esquema global, consistente y aplicable a una base vacía.

---

## 1. Archivos fuente

| Archivo | Grupo | Tablas | Columnas | FKs | Índices (no PK) |
|---|---|---|---|---|---|
| `init-2.sql` | **G1 · Inventario y Bodega** | 29 | 240 | 21 | 14 (2 índices + 12 unique) |
| `init-grupo2-portal-clientes.sql` | **G2 · Portal Clientes** | 55 | 384 | 98 | 16 |
| `init-3.sql` | **G8 · CRM Finet & Cable Mágico Litoral** | 73 | 676 | 181 | 74 (57 índices + 17 unique) |
| `init.sql` | **Ops · Red / ONT-OLT-NAP** | 56 | 426 | 110 | 39 |

Solapamiento: **15 tablas están en los 4 grupos**, **39 en tres** (G8+G2+Ops) y
**36 en un solo grupo** → 90 tablas únicas en total.

## 2. Resultado

`init-global.sql`

| Objeto | Cantidad |
|---|---|
| Tablas | 90 |
| Columnas | 876 |
| PRIMARY KEY | 90 (todas las tablas tienen PK) |
| Claves foráneas | 210 |
| CHECK | 33 |
| Índices únicos | 38 |
| Índices no únicos | 69 |
| Líneas | ~1 600 |

Sin datos, sin seeds, sin `DROP`. Idempotente (se puede re-ejecutar).

## 3. Reglas de fusión aplicadas

1. **Unión de tablas y columnas.** Ninguna tabla ni columna de ningún grupo se descartó.
   Si una tabla existe en varios esquemas, la fusión conserva las columnas de todos.
2. **Tipos ensanchados** al mayor dominio compatible:
   - `VARCHAR(n)` → el mayor `n`; si algún grupo usa `TEXT` → `TEXT`.
   - `INTEGER`/`SERIAL` + `BIGINT`/`BIGSERIAL` → `BIGSERIAL` (solo en PK de 1 columna).
   - `DATE` + `TIMESTAMP[Z]` → `TIMESTAMP`/`TIMESTAMPTZ` según corresponda.
   - `NUMERIC(p,s)` → mayor precisión.
3. **NOT NULL conservador:** una columna compartida solo es `NOT NULL` si **todos** los
   grupos que la definen la exigen. Si un grupo la usa pero no la define, o si alguno la
   admite nula → queda nullable. Esto garantiza que el `INSERT` de **ningún** backend falle.
4. **DEFAULT:** si al menos un grupo lo trae, se conserva (se prefirió el de G8/G2/Ops).
5. **FK único por relación:** se conserva nombre y acciones del esquema de mayor
   preferencia (**G8 > G2 > Ops > G1**).
6. **Índices y unicidad:** unión deduplicada por (tabla, columnas, unique, `WHERE`).
   114 definiciones de índice en las fuentes → 98 firmas únicas.
7. **PK compuestas:** mantenidas tal cual (ej. `secuencia_srv`).

## 4. Conflictos encontrados y resolución

### 4.1 Tipos (16 conflictos reales)

| Columna | En los grupos | Quedó |
|---|---|---|
| `cliente.obs_conflictivo` | TEXT (G8/G2) vs VARCHAR(500) (Ops) | **TEXT** |
| `intento_fallido.ip_address` | INET (G8/G2) vs VARCHAR(45) (Ops) | **VARCHAR(45)** ¹ |
| `log_auditoria.ip_origen` | INET (G8/G2/G1) vs VARCHAR(45) (Ops) | **VARCHAR(45)** ¹ |
| `olt.ip_gestion` | INET (G8/G2) vs VARCHAR(45) (Ops) | **VARCHAR(45)** ¹ |
| `sesion_portal.ip_origen` | INET (G8/G2) vs VARCHAR(45) (Ops) | **VARCHAR(45)** ¹ |
| `sesion_portal.token` | VARCHAR(255) vs TEXT (G2) | **TEXT** |
| `rol.descripcion` | TEXT (G8/G2/Ops) vs VARCHAR(200) (G1) | **TEXT** |
| `usuario.fecha_creacion` | TIMESTAMP (G8/G2/Ops) vs TIMESTAMPTZ (G1) | **TIMESTAMPTZ** ² |
| `usuario_rol.fecha_asignacion` | DATE (G8/G2/Ops) vs TIMESTAMPTZ (G1) | **TIMESTAMPTZ** ² |
| `log_auditoria.fecha_hora` | TIMESTAMP (G8/G2/Ops) vs TIMESTAMPTZ (G1) | **TIMESTAMPTZ** ² |
| `orden_ingreso.fecha_creacion` | DATE (G8/G2/Ops) vs TIMESTAMPTZ (G1) | **TIMESTAMPTZ** ² |
| `prestamo_externo.fecha_salida` | DATE (G8/G2/Ops) vs TIMESTAMPTZ (G1) | **TIMESTAMPTZ** ² |
| `orden_trabajo.fecha_programada` | DATE (G8/G2) vs TIMESTAMPTZ (Ops) | **TIMESTAMPTZ** ² |
| `historial_estado_equipo.id_historial` | BIGINT (G8) vs SERIAL/BIGSERIAL | **BIGSERIAL** |
| `log_auditoria.id_log` | BIGINT (G8) vs SERIAL/BIGSERIAL | **BIGSERIAL** |
| `movimiento_inventario.id_movimiento` | BIGINT (G8) vs SERIAL/BIGSERIAL | **BIGSERIAL** |

¹ Se prefirió `VARCHAR(45)` sobre `INET` para no rechazar valores tipo
`X-Forwarded-For` compuestos o vacíos. Impacto: G8/G2 dejan de tener validación de IP a
nivel de BD (el driver devuelve string igual que antes).
² Se prefirió la variante con zona horaria por ser la de mayor dominio.

### 4.2 Ensanchamientos de largo (13 columnas, sin conflicto semántico)

`bodega.nombre` 60→100 · `cliente.estado` 20→40 · `contrato.estado` 20→40 ·
`intento_fallido.rut_intentado` 12→50 · `log_auditoria.entidad_afectada` 80→100 ·
`orden_ingreso.estado` 25→30 · `plan.tipo_plan` 20→40 · `proveedor.email` 120→150 ·
`proveedor.telefono` 15→20 · `puerto_nap.estado` 10→20 · `usuario.email` 120→150 ·
`usuario.nombre_completo` 80→150 · `usuario.password_hash` 72→255.

### 4.3 Nulabilidad

**48 columnas** quedaron `NULL`-ables porque algún grupo no exige `NOT NULL`
(ej. `cliente.fecha_creacion`, `usuario.fecha_creacion`, `log_auditoria.id_usuario`,
`detalle_orden_ingreso.cantidad_recibida`). **Ninguna** columna se endureció
(`NOT NULL`) más allá de lo que exigían todos los grupos que la definen → 0 regresiones.

### 4.4 Claves foráneas

- 96 relaciones están definidas por más de un grupo con **distinto nombre y/o acción**.
  Se conservó la versión de G8/G2 (`fk_*`, `NO ACTION`) que coincide con el dump real
  de la base compartida.
- **Impacto a revisar por Ops:** 96 FKs que en su esquema eran `SET NULL`/`CASCADE`
  quedaron `NO ACTION`. Si su aplicación hace borrados en cascada a nivel BD, ahora
  fallarán con error de FK (el chequeo se hace en BD, no en la app).
- **Impacto G1:** 1 FK (`historial_estado_equipo.id_unidad`) pasó de `CASCADE` a
  `NO ACTION`.
- **Impacto G2:** ninguno (coincidía con G8).
- FKs por origen del nombre final: G8 181 · Ops 14 · G1 13 · G2 2
  (las FKs exclusivas de un grupo se conservan tal cual).

### 4.5 Índices y unicidad

- 114 definiciones → 98 firmas; los duplicados exactos se emitieron una sola vez.
- Índices únicos parciales conservados: `garantia_comercial_activa_periodo_key`,
  `uq_cambio_plan_pendiente`, `uq_plan_zona_precio_activo`,
  `uq_zona_pago_empresa_nombre` (expresión `COALESCE`/`lower`).
- Uniques de columna de G1 (ej. `usuario.email`, `proveedor.rut`,
  `orden_ingreso.correlativo`) se emitieron como índice único con nombre
  `<tabla>_<columna>_key`, deduplicados con los de G8/G2.

### 4.6 Tablas "gemelas" (mismo concepto, distinto nombre)

Se mantienen **ambas** para no romper el código de ningún grupo:

| G1 | G8 / G2 / Ops | Nota |
|---|---|---|
| `orden_ingreso_detalle` | `detalle_orden_ingreso` | Distintas columnas (`garantia_dias` vs `cantidad_solicitada`) |
| `solicitud_baja` | `baja_equipo` | Flujo con aprobación vs registro de baja |
| `prestamo_detalle` + `prestamo_retorno` | `prestamo_externo` | G1 agrega detalle por unidad |
| `integracion_cierre` + `integracion_activacion` | `integracion_activacion_g1`, `integracion_instalacion_g3`, `integracion_evento_entrante` | Integraciones cruzadas |
| `proveedor.rut` | `proveedor.rut_proveedor` | Ambos campos existen en la tabla fusionada |

Recomendación: acordar en algún momento cuál será la fuente de verdad de cada par para
evitar doble escritura.

### 4.7 Falsos conflictos

`bodega.activa`, `tipo_equipo.activo`, `usuario.activo`: los 4 grupos definen
`DEFAULT true`; solo diferían en mayúsculas (`TRUE` vs `true`). Sin impacto.

## 5. Validación

Aplicado en PostgreSQL 16 local sobre base vacía y **dos veces seguidas** (idempotencia):

```bash
psql -v ON_ERROR_STOP=1 -f init-global.sql   # exit 0
psql -v ON_ERROR_STOP=1 -f init-global.sql   # exit 0 (re-ejecución)
```

Comprobaciones automáticas:

| Comprobación | Resultado |
|---|---|
| Tablas creadas | 90 / 90 |
| Columnas del esquema fusionado vs unión de fuentes | 876 / 876 · 0 faltantes · 0 extra |
| PK en todas las tablas | 90 / 90 |
| FKs creadas | 210 / 210 |
| FKs de cada fuente presentes (por firma) | 210 / 210 |
| Índices de cada fuente presentes | 100 % (98/98 firmas) |
| Columnas `NOT NULL` que alguna fuente admite nula | 0 |
| Nombres de FK duplicados | 0 |

## 6. Notas para los grupos

1. **G8 / G2:** las columnas `orden_ingreso.fecha_creacion`, `prestamo_externo.fecha_salida`,
   `usuario.fecha_creacion`, `usuario_rol.fecha_asignacion`, `log_auditoria.fecha_hora` y
   `orden_trabajo.fecha_programada` pasan de `DATE`/`TIMESTAMP` a `TIMESTAMPTZ`.
   Si la UI espera solo fecha, no hay cambio visual; si comparan contra `::date`,
   revisar. Valores insertados por G1 incluirán hora.
2. **G2 / Ops:** `sesion_portal.token` es `TEXT` (antes `VARCHAR(255)` en G8/Ops):
   sin impacto funcional, solo deja de truncar.
3. **Ops:** revisar las 96 FKs que pasaron de `SET NULL`/`CASCADE` a `NO ACTION`.
   Si necesitan otra política, es una decisión de los 4 grupos: es reversible
   (re-generar el init con otra preferencia o `ALTER TABLE ... DROP CONSTRAINT ...`
   + `ADD CONSTRAINT` con la acción deseada).
4. **G1:** `historial_estado_equipo.id_unidad` ya no borra en cascada; el borrado de una
   unidad con historial ahora falla por FK (más seguro para auditoría).
5. **Prisma (G8/G2):** el archivo **no incluye** `_prisma_migrations`. Si van a usar
   `prisma migrate deploy` sobre esta base, primero hagan baseline
   (`prisma migrate resolve --applied <migración>`).
6. El archivo no contiene datos ni credenciales; los seeds corresponden a cada grupo.
7. Las reglas de fusión están escritas en la cabecera de `init-global.sql`.

---

*Generado con el script `generar-init-global.py` (parser + fusión determinística).
Para regenerar: dejar los 4 `init*.sql` en la misma carpeta con los nombres originales y
ejecutar `python3 generar-init-global.py`; produce un `init-global.sql` nuevo con las
mismas reglas.*
