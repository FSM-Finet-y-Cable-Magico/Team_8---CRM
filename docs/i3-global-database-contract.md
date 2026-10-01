# Contrato global y proyección G8

Estado al 30-09-2026: **CONTRATO G3 ACTUALIZADO / RAILWAY READ ONLY CON EXTRAS SIN DUEÑO**. La fuente física prioritaria es [init-global.sql](../db/global/init-global.sql), SHA-256 `bdbff3f99e81446d75312dede4571ab6154bea309ce8f90dceaa44e98105cce1`. Contiene 91 tablas, 897 columnas, 91 PK, 211 FK, 33 checks y 109 índices explícitos; no incluye seeds.

## CONTRACT_CHANGE 2026-09-30

`solicitud_instalacion_integracion` pasa a `PHYSICAL_DEFINITION_CONFIRMED`, owner G3. Se incorporaron sus 20 columnas físicas, PK, FK `id_ot` con `ON UPDATE CASCADE / ON DELETE SET NULL`, uniques de `request_id` e `id_ot`, e índice de `id_empresa`. No tiene CHECK constraints. Railway ya contenía la tabla; no se ejecutó ni se debe ejecutar este init sobre la base existente para aplicar el cambio.

## CONTRACT_CHANGE 2026-09-29

La reconciliación fue aplicada manualmente por el operador con respaldo y verificación. Luego se corrigió el contrato que conservaba dos expectativas obsoletas:

- `REMOVE invalid unique prospecto_id_cliente_key`: la base admite legítimamente varios prospectos asociados a un cliente. Prisma tampoco declara `Prospecto.idCliente` como único. La restricción no debe recrearse y no se deben alterar datos para satisfacerla.
- `ADD integracion_activacion_g1.payload_snapshot JSONB NULL`: la columna aplicada por el operador ahora es parte del contrato. Permite persistir el evento original para reintentos inmutables sin reconstruirlo desde el estado actual del cliente.

El contrato anterior y los reportes que mostraban `PENDIENTE_RECONCILIACION_GLOBAL` se conservan como evidencia histórica. El SQL de reconciliación y la propuesta aislada de `payload_snapshot` están marcados como históricos y no deben volver a ejecutarse.

## Precedencia y ownership

1. Init global: tipos, nulabilidad, restricciones y objetos físicos compartidos.
2. Código real de cada grupo: comportamiento implementado.
3. Acuerdos ratificados: contrato funcional y de API.
4. Railway: estado observado que debe coincidir con el contrato, no una definición alternativa.

|Dominio|Owner funcional|Acceso G8|
|---|---|---|
|CRM, comercial y tracking saliente|G8|Servicios G8 con RBAC, empresa y auditoría|
|Inventario físico, bodegas, unidades y movimientos|G1|API S2S; sin sustituirla por SQL directo|
|Red, terreno y cierre técnico de OT|G3/Ops|Contrato API ratificado|
|Portal|G2|Mantener acuerdos y ownership|
|Identidad, clientes y referencias compartidas|Coordinación intergrupo|Cambios físicos coordinados|

`OWNER_EXTERNAL` solo indica que un objeto no está en la proyección Prisma G8. No concede ni quita ownership funcional. Tampoco deben fusionarse las tablas receptoras G1 (`integracion_activacion`, `integracion_cierre`, `asignacion_equipo_servicio`) con el tracking G8 (`integracion_activacion_g1`, `integracion_instalacion_g3`, `integracion_evento_entrante`).

## Proyección Prisma

Se mantienen 58 modelos para las partes que usa G8, sin duplicar las 91 tablas globales. `npm.cmd run db:audit:prisma-global` produce [el reporte completo](i3-prisma-vs-global-schema.md) y JSON. Resultado vigente: 799 coincidencias, 36 columnas globales no modeladas, 325 objetos externos, 50 índices físicos no modelados y 65 FK físicas no modeladas. No hay objetos `PRISMA_ONLY`.

Los índices y FK con Prisma `null` se conservan en PostgreSQL. No se usa `db push` para eliminarlos. El auditor de Prisma no intenta deducir defaults ni checks SQL; esos objetos los valida el comparador físico.

## Igualdad física

El verificador consulta catálogos en una transacción `READ ONLY` y compara tablas, columnas, tipos, nulabilidad, defaults, PK, FK y acciones, checks, índices y propiedades básicas de secuencias. `_prisma_migrations` es metadato permitido. No certifica permisos, triggers, vistas, contenido comercial ni valores actuales de secuencias.

La normalización ahora reconoce de forma conservadora:

- `NOT NULL` implícito por columnas que pertenecen a una PK compuesta;
- casts de literales de texto agregados por PostgreSQL en defaults de columnas `varchar`/`text`;
- paréntesis redundantes alrededor de átomos casteados y arrays usados por `ANY`, preservando el resto de la expresión y el árbol `AND`/`OR`;
- casts textuales equivalentes en checks.

Las pruebas negativas demuestran que no se igualan expresiones con distinta precedencia ni literales diferentes. La lectura Railway posterior al cambio obtuvo 1.522 coincidencias, cero faltantes, `_prisma_migrations` permitido y cinco `UNOWNED_EXTRA`. La tabla G3 y todos sus objetos están en `MATCH`; el `FAIL` residual no corresponde a ella. Ver [resolución de extras](i3-global-extra-object-resolution.md).
