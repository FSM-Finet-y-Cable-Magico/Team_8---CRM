# Verificación global final posterior a reconciliación

## Resultado

Lectura real de Railway capturada el `2026-09-29T22:48:09.805Z` mediante `scripts/verify-global-db.mjs`, dentro de una transacción PostgreSQL `READ ONLY`.

|Evidencia|Resultado|
|---|---|
|Hash canónico|`e3f43ed3e58fba9a73e8a3dd566e2ab245061bcdb6bfb60ac69c6be21692834c`|
|Estado|`PASS`|
|Tablas contractuales|90|
|Columnas|877|
|PK|90|
|FK|210|
|Checks|33|
|Índices explícitos|106|
|Objetos `MATCH`|1.495|
|Extras permitidos|1: `_prisma_migrations`|
|Objetos contractuales ausentes o diferentes|0|

No se ejecutaron DDL, DML, migraciones, reconcile, seed, `db push`, `migrate deploy` ni `migrate resolve`.

## Clasificación de las diferencias del verificador anterior

|Objeto anterior|Clasificación|Conclusión|
|---|---|---|
|`prospecto.prospecto_id_cliente_key`|`CONTRACT_OUTDATED`|La expectativa era inválida: varios prospectos pueden referir al mismo cliente. Se eliminó del canónico; no se cambiaron datos ni Railway.|
|`integracion_activacion_g1.payload_snapshot` extra|`CONTRACT_OUTDATED`|La columna `JSONB NULL` fue aprobada y aplicada manualmente por el operador. Ahora pertenece al canónico.|
|`orden_ingreso.estado` default|`SEMANTICALLY_EQUIVALENT`|Mismo literal y tipo efectivo; PostgreSQL agrega un cast textual al representar el default.|
|`prestamo_externo.estado` default|`SEMANTICALLY_EQUIVALENT`|Mismo literal y tipo efectivo; diferencia exclusiva de cast textual.|
|`integracion_cierre.estado_proceso` default|`SEMANTICALLY_EQUIVALENT`|Mismo literal y tipo efectivo; diferencia exclusiva de cast textual.|
|`secuencia_srv.id_empresa` nullable|`VERIFIER_NORMALIZATION_BUG`|La columna pertenece a la PK compuesta. PostgreSQL impone `NOT NULL` aunque el texto de creación no lo repita.|
|`secuencia_srv.anio` nullable|`VERIFIER_NORMALIZATION_BUG`|La columna pertenece a la PK compuesta. PostgreSQL impone `NOT NULL` aunque el texto de creación no lo repita.|

La normalización de defaults solo elimina casts de literales cuando el tipo de la columna prueba que son equivalentes. La corrección de nulabilidad se limita a columnas que el propio parser identifica como parte de una PK.

## Revisión individual de los 31 checks

Todos los casos siguientes se clasificaron `SEMANTICALLY_EQUIVALENT`. PostgreSQL había agregado casts y paréntesis de renderizado sin cambiar operandos, valores, operadores ni precedencia:

|#|Restricción|Conclusión|
|---:|---|---|
|1|`cambio_condicion_pago.cambio_condicion_pago_tipo_check`|Equivalente; conjunto `ANY` y casts textuales conservados.|
|2|`cargo_adicional.cargo_adicional_estado_check`|Equivalente; mismos estados permitidos.|
|3|`cargo_adicional.cargo_adicional_monto_check`|Equivalente; mismo predicado `monto > 0`.|
|4|`cargo_adicional.cargo_adicional_tipo_check`|Equivalente; mismos tipos permitidos.|
|5|`convenio_pago.convenio_pago_cuotas_check`|Equivalente; mismo predicado `cantidad_cuotas > 0`.|
|6|`convenio_pago.convenio_pago_estado_check`|Equivalente; mismos estados permitidos.|
|7|`convenio_pago.convenio_pago_monto_check`|Equivalente; mismo predicado positivo.|
|8|`cuota_convenio_pago.cuota_convenio_pago_estado_check`|Equivalente; mismos estados permitidos.|
|9|`cuota_convenio_pago.cuota_convenio_pago_monto_check`|Equivalente; mismo predicado positivo.|
|10|`cuota_convenio_pago.cuota_convenio_pago_numero_check`|Equivalente; mismo predicado `numero > 0`.|
|11|`documento_tributario_externo.documento_tributario_externo_estado_check`|Equivalente; mismos estados permitidos.|
|12|`documento_tributario_externo.documento_tributario_externo_fuente_check`|Equivalente; mismo literal `EXTERNO_MANUAL`.|
|13|`documento_tributario_externo.documento_tributario_externo_montos_check`|Equivalente; mismo árbol booleano y comparaciones no negativas.|
|14|`documento_tributario_externo.documento_tributario_externo_tipo_check`|Equivalente; mismos tipos permitidos.|
|15|`evento_gestion_comercial.evento_gestion_comercial_canal_check`|Equivalente; mismos canales permitidos.|
|16|`evento_gestion_comercial.evento_gestion_comercial_tipo_check`|Equivalente; mismos tipos permitidos.|
|17|`plan_zona_precio.plan_zona_precio_vigencia_check`|Equivalente; mismo árbol `fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_inicio <= fecha_fin`.|
|18|`prorroga_pago.prorroga_pago_estado_check`|Equivalente; mismos estados permitidos.|
|19|`prorroga_pago.prorroga_pago_fecha_check`|Equivalente; misma comparación de fechas.|
|20|`prospecto.prospecto_latitud_check`|Equivalente; mismos límites -90..90 y mismo manejo de NULL.|
|21|`prospecto.prospecto_longitud_check`|Equivalente; mismos límites -180..180 y mismo manejo de NULL.|
|22|`solicitud_retiro_servicio.solicitud_retiro_servicio_despacho_check`|Equivalente; mismo literal de bloqueo G3.|
|23|`solicitud_retiro_servicio.solicitud_retiro_servicio_estado_check`|Equivalente; mismos estados permitidos.|
|24|`solicitud_retiro_servicio.solicitud_retiro_servicio_motivo_check`|Equivalente; mismo `length(trim(motivo)) > 0`.|
|25|`zona_pago.zona_pago_centro_lat_check`|Equivalente; mismos límites -90..90 y mismo manejo de NULL.|
|26|`zona_pago.zona_pago_centro_lng_check`|Equivalente; mismos límites -180..180 y mismo manejo de NULL.|
|27|`zona_pago.zona_pago_padre_distinto_check`|Equivalente; misma exclusión de autorreferencia cuando existe padre.|
|28|`zona_pago.zona_pago_tipo_zona_check`|Equivalente; mismos tipos permitidos y mismo manejo de NULL.|
|29|`zona_pago.zona_pago_vigencia_check`|Equivalente; mismo árbol de vigencia y precedencia.|
|30|`integracion_instalacion_g3.integracion_instalacion_g3_estado_check`|Equivalente; mismos estados permitidos.|
|31|`integracion_instalacion_g3.integracion_instalacion_g3_intentos_check`|Equivalente; mismo predicado `intentos >= 0`.|

## Garantías del normalizador

`normalizeCheckExpression` separa expresiones booleanas en un árbol `AND`/`OR`, elimina solo wrappers demostrablemente redundantes alrededor de átomos casteados o arrays `ANY` y conserva los demás paréntesis. Las pruebas cubren equivalencias de casts/paréntesis y rechazan expresamente:

- `(a OR b) AND c` frente a `a OR (b AND c)`;
- `(a + b) * c` frente a `a + (b * c)`;
- expresiones con literales diferentes.

Por eso el `PASS` final representa igualdad semántica para los objetos comparados y no una eliminación indiscriminada de sintaxis.
