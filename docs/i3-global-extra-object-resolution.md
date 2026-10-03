# Resolución de objetos adicionales del esquema global

Fecha: 2026-10-01. Rama: `feature/incremento3`.

La investigación combinó trazabilidad Git local y una introspección PostgreSQL de solo lectura. La consulta remota se ejecutó dentro de una transacción con `SET TRANSACTION READ ONLY`, timeout y agregados `COUNT(*)`; no leyó valores de negocio ni ejecutó DDL, DML, migraciones, seed o `db push`.

## Clasificación de cierre

| Objeto | Estado | Owner probado | Recomendación |
|---|---|---|---|
| `solicitud_clave_wifi` | `UNOWNED_EXTRA` | No determinado | **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** |
| `lista_negra.nivel` | `UNOWNED_EXTRA` | No determinado | **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** |
| `log_notificacion.id_ot` | `UNOWNED_EXTRA` | No determinado | **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** |
| `log_notificacion_id_ot_fkey` | `UNOWNED_EXTRA` | No determinado | **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** |
| `log_notificacion_estado_envio_fecha_envio_idx` | `UNOWNED_EXTRA` | No determinado | **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER** |

Ninguno de los cinco objetos es infraestructura técnica. Ninguno tiene evidencia suficiente para incorporarlo al contrato o retirarlo. No se agregó una excepción al verificador.

`_prisma_migrations` permanece fuera de este grupo como `TECHNICAL_ALLOWED_EXTRA`. `solicitud_instalacion_integracion` es una extensión global legítima, owner G3, con definición física confirmada e incorporada al contrato; actualmente coincide con Railway.

## Evidencia física

### `solicitud_clave_wifi`

Railway contiene **1 fila**. La tabla no tiene comentario, RLS, triggers, vistas o funciones consumidoras detectables en el catálogo. Su owner PostgreSQL es el rol genérico `postgres`, dato que no identifica al owner funcional.

Columnas exactas:

| Columna | Tipo | Nulabilidad | Default |
|---|---|---|---|
| `id_solicitud` | `integer` | NOT NULL | `nextval('solicitud_clave_wifi_id_solicitud_seq'::regclass)` |
| `request_id` | `varchar(64)` | NOT NULL | — |
| `huella` | `varchar(64)` | NOT NULL | — |
| `id_empresa` | `integer` | NOT NULL | — |
| `id_contrato` | `integer` | NOT NULL | — |
| `id_ticket` | `varchar(64)` | NOT NULL | — |
| `trace_id` | `varchar(64)` | NOT NULL | — |
| `clave_cifrada` | `text` | NOT NULL | — |
| `leida_en` | `timestamp(3) without time zone` | NULL | — |
| `estado` | `varchar(20)` | NOT NULL | `'PENDIENTE'::character varying` |
| `fecha_creacion` | `timestamp(3) without time zone` | NOT NULL | `CURRENT_TIMESTAMP` |

Constraints e índices:

- PK `solicitud_clave_wifi_pkey (id_solicitud)`.
- UNIQUE `solicitud_clave_wifi_request_id_key (request_id)`.
- INDEX `solicitud_clave_wifi_id_empresa_estado_idx (id_empresa, estado)`.
- No tiene FK ni CHECK de negocio.
- La secuencia de `id_solicitud` está ligada a la columna.

No existe referencia exacta en el runtime, Prisma, SQL contractual o migraciones accesibles. La primera aparición Git es el commit `63404be3`, únicamente en documentación y en el fixture del test del verificador que reproduce el extra observado; no es evidencia de creación. La búsqueda sobre todas las refs accesibles tampoco halló un consumidor real.

La tabla canónica `solicitud_contrasena_wifi` es distinta: tiene **3 filas**, siete columnas, PK y FK hacia `cliente` y `contrato`; no contiene `request_id`, `huella`, `id_ticket`, `trace_id` ni el mismo ciclo de estado. Ambas tienen datos, por lo que no son aliases y no pueden fusionarse o retirarse de forma segura. Su migración histórica (`20260910212314_add_solicitud_contrasena_wifi`) solo prueba el origen de la tabla canónica.

El acuerdo G2 v2 establece que Ticket CRM es la fuente final del flujo WiFi y que no se requiere una tabla WiFi separada como fuente final. Esto no atribuye `solicitud_clave_wifi` a G2, no demuestra que G3/SmartOLT la consuma y no autoriza eliminarla. No hay implementación SmartOLT ni contrato funcional que identifique owner.

- Riesgo de retirar: **alto**, porque hay una fila, datos cifrados y consumidores externos no descartados.
- Riesgo de incorporar: **alto**, porque convertiría una estructura sin owner ni semántica acordada en contrato compartido.
- Recomendación: **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**.

### `lista_negra.nivel`

Definición física: `varchar(10) NULL`, sin default, comentario, constraint o índice específico. `lista_negra` contiene **3 filas** y `nivel` contiene **0 valores no nulos**. La tabla conserva su PK y FK hacia `cliente` y `usuario`; no se detectaron vistas, funciones o triggers dependientes.

Prisma modela `ListaNegra` sin `nivel`. No existe lectura, escritura, DTO, servicio, controlador, SQL o migración que use `lista_negra.nivel` en ninguna ref accesible. Las coincidencias genéricas de la palabra “nivel” pertenecen a otros dominios.

- Riesgo de retirar: **medio-bajo**, porque el campo está vacío y no tiene dependencia interna, pero no se descartaron consumidores SQL externos ni existe owner que autorice.
- Riesgo de incorporar: **medio**, porque fijaría tipo y semántica de un concepto no acordado.
- Recomendación: **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**.

### `log_notificacion.id_ot`

Definición física: `integer NULL`, sin default ni comentario. `log_notificacion` contiene **0 filas** y, por tanto, **0 valores no nulos** en `id_ot`. Prisma modela `LogNotificacion` sin esa columna ni relación. Billing consulta por cliente, ordena por `fecha_envio` y crea notificaciones sin `id_ot`.

No existe referencia exacta en runtime, SQL contractual o migraciones accesibles; tampoco se detectaron vistas, funciones o triggers. Los usos de `idOt` en otras entidades no constituyen consumidores de esta columna.

- Riesgo de retirar: **bajo en datos y medio en integración**, por tabla vacía pero posible SQL externo no inventariado.
- Riesgo de incorporar: **medio**, porque agrega al contrato una relación de negocio sin owner.
- Recomendación: **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**.

### `log_notificacion_id_ot_fkey`

Definición exacta:

```sql
FOREIGN KEY (id_ot)
REFERENCES orden_trabajo(id_ot)
ON UPDATE CASCADE
ON DELETE SET NULL
```

La FK está validada, no es diferible y no tiene referencia Prisma. No se encontró DDL de origen ni consumidor exacto. Depende de la columna extra anterior y protege una tabla actualmente vacía.

- Riesgo de retirar: **bajo en datos y medio en integración**, sujeto a la decisión coordinada sobre `id_ot`.
- Riesgo de incorporar: **medio**, porque formalizaría una relación sin contrato funcional.
- Recomendación: **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**.

### `log_notificacion_estado_envio_fecha_envio_idx`

Definición exacta:

```sql
CREATE INDEX log_notificacion_estado_envio_fecha_envio_idx
ON public.log_notificacion USING btree (estado_envio, fecha_envio);
```

Es un índice no único, válido y listo. No depende de `id_ot`. La tabla está vacía. Billing ordena por `fecha_envio`, pero no filtra por la columna líder `estado_envio`; esa consulta no demuestra dependencia del índice. No se encontró DDL de origen ni referencia exacta fuera del fixture del verificador.

- Riesgo de retirar: **bajo en datos**, aunque un consumidor externo o una carga futura podrían depender de su rendimiento.
- Riesgo de incorporar: **bajo-medio**, pero aceptarlo sin owner normalizaría un objeto operacional no acordado.
- Recomendación: **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**.

## Trazabilidad Git

Los cuatro extras asociados a tablas canónicas se documentaron por primera vez en `e46bb972` después de una introspección Railway READ ONLY. Ese commit no creó DDL, migraciones, modelos ni runtime. `solicitud_clave_wifi` aparece por primera vez en `63404be3`, también solo como evidencia y fixture de verificación.

Las tablas base `lista_negra`, `log_notificacion` y `solicitud_contrasena_wifi`, sin estos extras, entraron al contrato global en `08e1b4b7`. Ninguna rama o commit accesible contiene el SQL que creó los cinco extras. El catálogo atribuye los objetos al rol técnico `postgres`, no a un grupo funcional.

## Estado del contrato y siguiente acción

El contrato propuesto contiene 92 tablas, 910 columnas, 92 PK, 214 FK, 35 checks y 114 índices explícitos. Los cambios G2 nuevos son diferencias contractuales pendientes de migración y se reportan por separado. Los cinco objetos de esta investigación conservan exactamente su clasificación `UNOWNED_EXTRA`; no se usaron para ocultar los cambios nuevos.

```text
TECHNICAL_ALLOWED_EXTRA=1
UNOWNED_EXTRA=5
status=FAIL
```

Para resolver cada objeto se requiere evidencia escrita del owner, migración/DDL de origen y decisión contractual. Si se propone retiro, además se requiere inventario de consumidores externos, respaldo y ventana coordinada. Hasta entonces no se modifica Railway ni se debilita el verificador.
