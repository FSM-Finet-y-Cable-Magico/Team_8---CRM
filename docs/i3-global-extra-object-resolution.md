# Resolución de objetos adicionales del esquema global

Fecha: 2026-09-30. Rama: `feature/incremento3`.

Esta investigación es local y de solo lectura. No ejecutó DDL, DML, migraciones, `db push`, seed, commit, push, merge, deploy ni modificaciones de Railway.

## Clasificación vigente

|Objeto|Clasificación|Owner|Decisión actual|
|---|---|---|---|
|`_prisma_migrations`|`TECHNICAL_ALLOWED_EXTRA`|Prisma|Permitido como metadato técnico; no integra el contrato funcional.|
|`solicitud_instalacion_integracion`|`LEGITIMATE_GLOBAL_EXTENSION`|G3|`PHYSICAL_DEFINITION_CONFIRMED`; incorporada al contrato y verificada en `MATCH`.|
|`solicitud_clave_wifi`|`UNOWNED_EXTRA`|No determinado|Objeto descubierto en la lectura repetida; no confundir con `solicitud_contrasena_wifi`.|
|`lista_negra.nivel`|`UNOWNED_EXTRA`|No determinado|Conservar mientras se identifica owner y decisión contractual.|
|`log_notificacion.id_ot`|`UNOWNED_EXTRA`|No determinado|Conservar mientras se identifica owner y decisión contractual.|
|`log_notificacion_id_ot_fkey`|`UNOWNED_EXTRA`|No determinado|Conservar mientras se identifica owner y decisión contractual.|
|`log_notificacion_estado_envio_fecha_envio_idx`|`UNOWNED_EXTRA`|No determinado|Conservar mientras se identifica owner y decisión contractual.|

Solo `TECHNICAL_ALLOWED_EXTRA` queda exceptuado del fallo. La extensión G3 ya no es una diferencia: forma parte del canónico y coincide con Railway. Los cinco `UNOWNED_EXTRA` continúan bloqueando el `PASS`.

## Evidencia contractual G3

La definición completa entregada por el responsable del proyecto confirma `public.solicitud_instalacion_integracion` como extensión global legítima, owner G3 y acuerdo formal G8-G3. El objeto tiene 20 columnas, PK serial, `request_id` e `id_ot` únicos, índice por `id_empresa`, FK opcional de `id_ot` a `orden_trabajo` con `CASCADE/SET NULL` y ningún CHECK.

La definición fue incorporada literalmente a `db/global/init-global.sql`; `SERIAL` representa el `INTEGER NOT NULL` con la secuencia física confirmada. No se infirió desde `integracion_instalacion_g3`, que continúa siendo otra tabla. El nuevo contrato tiene hash `bdbff3f99e81446d75312dede4571ab6154bea309ce8f90dceaa44e98105cce1` y conteos 91/897/91/211/33/109.

Estado: **`PHYSICAL_DEFINITION_CONFIRMED / CONTRACT_MATCH`**.

## Trazabilidad Git

Se inspeccionaron todas las ramas locales y remotas disponibles mediante búsquedas `git log --all -S`, `git log --all -G`, `git grep` sobre refs, `git branch --contains`, `git show` y `git blame`, además de SQL, migraciones Prisma, `schema.prisma`, scripts, documentación y snapshots.

### Primera evidencia de los extras

Los cinco identificadores aparecen por primera vez en el repositorio en el commit:

- commit `e46bb97267496ce30dc53ef7ffd5db9397e0b5ca`;
- fecha `2026-09-30T21:36:55-03:00`;
- autor y committer: Benjamin Gallegos;
- ramas que lo contienen: `feature/incremento3` y `origin/feature/incremento3`;
- asunto: `Arreglos i cierres de integracion G1`.

El diff prueba que ese commit solo registró estos nombres en `docs/i3-global-continuation-report.md` y en el nuevo `docs/i3-railway-readonly-verification.md`, como resultado de una introspección READ ONLY. No añadió los extras a SQL, migraciones, Prisma ni código. Por tanto, es el **primer registro documental local**, no evidencia de que su autor haya creado los objetos en Railway.

### Origen de las tablas base

`lista_negra` y `log_notificacion`, sin los extras investigados, se incorporaron al contrato global en:

- commit `08e1b4b71e2aa5d1f049dfeba046efb9085fe0eb`;
- fecha `2026-09-29T12:42:10-03:00`;
- autor: Benjamin Gallegos;
- rama disponible que lo contiene: `feature/incremento3` y su remota;
- propósito declarado: reconciliación completa contra el snapshot Railway.

`git blame`, `db/global/init-global.sql`, `db/final/init.sql`, `db/init/01_schema.sql` y `backend/prisma/schema.prisma` muestran las tablas base sin `nivel` y sin `id_ot` en `log_notificacion`. Tampoco contienen la FK o el índice investigados.

### Límite de atribución

Ninguna rama G2, G3 o G8 disponible contiene DDL, migración o commit que cree esos cuatro objetos. El Git accesible no permite determinar el commit físico, autor real, sesión SQL ni grupo que los creó en Railway. Esa atribución requiere evidencia externa: migración del grupo, auditoría PostgreSQL/Railway o confirmación escrita del owner.

### Cambio concurrente detectado durante esta etapa

La evidencia inicial indicaba 92 tablas. La repetición READ ONLY posterior encontró 93 y agregó `solicitud_clave_wifi` como séptimo extra total. No existe ninguna aparición de ese nombre en commits, ramas, SQL, migraciones, Prisma, scripts o documentación accesible. Su `ORIGIN_COMMIT`, `ORIGIN_BRANCH`, autor y owner permanecen **no determinados**.

El catálogo READ ONLY muestra 11 columnas, PK `id_solicitud`, unicidad de `request_id` y un índice por `id_empresa, estado`. Su nombre y propósito aparente no prueban ownership. Tampoco debe confundirse ni fusionarse con la tabla canónica G2 `solicitud_contrasena_wifi`, que tiene otra estructura. No se consultaron filas ni datos de negocio de la tabla nueva.

## Uso en el código actual

### `lista_negra.nivel`

- `ListaNegra` existe en Prisma, pero solo modela `id_vetado`, `id_cliente`, `rut_vetado`, `direccion_vetada`, `motivo`, `fecha_registro` e `id_usuario_registro`.
- No hay lectura, escritura, DTO, servicio, controlador, migración ni SQL actual que use `nivel` en `lista_negra`.
- Coincidencias genéricas de la palabra `nivel` pertenecen a otros conceptos y no prueban uso.

Resultado: **`NO_CODE_REFERENCE` / `STILL_USED=false`**.

### `log_notificacion.id_ot`

- `LogNotificacion` existe en Prisma, pero no declara `idOt` ni relación con `OrdenTrabajo`.
- Billing lista notificaciones, ordena por `fechaEnvio` y crea registros con cliente, plantilla, canal, fecha y estado.
- Los usos genéricos de `idOt` pertenecen a órdenes, evidencias y otras tablas; no usan `log_notificacion.id_ot`.

Resultado: **`NO_CODE_REFERENCE` / `STILL_USED=false`**.

### FK `log_notificacion_id_ot_fkey`

No hay relación Prisma, consulta, migración ni SQL rastreable que dependa de esta FK.

Resultado: **`NO_CODE_REFERENCE` / `STILL_USED=false`**.

### Índice `log_notificacion_estado_envio_fecha_envio_idx`

No hay declaración Prisma ni SQL que referencie el índice por nombre. Billing ordena por `fecha_envio`, pero no filtra por el prefijo `estado_envio`; esa consulta no demuestra dependencia funcional del índice compuesto.

Resultado: **`NO_EXACT_CODE_REFERENCE` / `STILL_USED_NOT_DEMONSTRATED`**.

### `solicitud_instalacion_integracion`

No hay modelo, migración ni uso de aplicación con ese nombre. El repositorio sí contiene `integracion_instalacion_g3`, que es un objeto diferente y no debe usarse para inventar la definición física de la extensión nueva.

Resultado: **`CONTRACT_APPROVED / CODE_REFERENCE_NOT_REQUIRED / PHYSICAL_DEFINITION_CONFIRMED`**.

### `solicitud_clave_wifi`

No tiene referencia exacta en el repositorio ni origen rastreable en Git. La tabla canónica `solicitud_contrasena_wifi` es distinta y no justifica aceptar la nueva tabla como alias o reemplazo.

Resultado: **`NO_CODE_REFERENCE / OWNER_UNDETERMINED / DATA_DEPENDENCY_NOT_ASSESSED`**.

## Candidatos de retiro

Railway reporta cero registros en `lista_negra` y `log_notificacion`, y el código no usa los cuatro objetos sin dueño. Esto los convierte en **candidatos técnicos para una evaluación coordinada de retiro**, pero no en objetos autorizados ni demostrados como seguros para borrar.

Estado individual de los dos campos, la FK y el índice: **`SAFE_REMOVAL_CANDIDATE_AFTER_OWNER_CONFIRMATION`**. Mientras no exista confirmación del owner, revisión de dependencias externas, respaldo y plan aprobado, la acción es conservarlos.

`solicitud_instalacion_integracion` no es candidato de retiro.

`solicitud_clave_wifi` tampoco puede clasificarse como candidato de retiro: su estado de datos y sus consumidores externos no fueron establecidos.

## Estado esperado del verificador

El verificador ahora informa clasificaciones explícitas:

- `TECHNICAL_ALLOWED_EXTRA`: permitido y no bloqueante;
- `UNOWNED_EXTRA`: bloqueante hasta resolver ownership y decisión;
- `CONTRACT_DIFFERENCE`: cualquier diferencia contra objetos ya canónicos.

Estado actual esperado:

```text
TECHNICAL_ALLOWED_EXTRA=1
UNOWNED_EXTRA=5
status=FAIL
```

El contrato ya contiene 91 tablas funcionales. La lectura Railway obtuvo 1.522 `MATCH`, cero faltantes, un extra técnico permitido y cinco `UNOWNED_EXTRA`; por ello el resultado sigue siendo `FAIL`.

El `PASS` final requiere las 91 tablas funcionales coincidentes, la tabla técnica permitida y cero diferencias bloqueantes. Los conteos definitivos son 897 columnas, 91 PK, 211 FK, 33 checks y 109 índices explícitos.

## Próximas acciones humanas

1. Pedir a G2, G3, G8 y administración de la base evidencia de origen para los cinco `UNOWNED_EXTRA`, incluida la migración y contrato de `solicitud_clave_wifi`.
2. Si ningún owner los reclama, preparar fuera de esta etapa una propuesta de retiro con respaldo, revisión de dependencias y aprobación conjunta. No ejecutar borrado desde este branch.
3. Repetir `npm.cmd run db:verify:global:railway` después de la decisión coordinada y exigir `PASS` antes del deploy.
