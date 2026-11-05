# Verificación global Railway READ ONLY

## Garantías

El verificador `scripts/verify-global-db.mjs` abre una transacción PostgreSQL, ejecuta primero `SET TRANSACTION READ ONLY`, fija timeout y consulta solo catálogos. No ejecuta migraciones, seed, `db push`, DDL ni DML.

El wrapper Windows `scripts/verify-global-db-readonly.ps1` carga únicamente `DATABASE_URL` desde `.env.railway`, no imprime su valor y lo elimina del proceso al terminar.

## Comando exacto para Windows

Desde la raíz del repositorio:

```powershell
npm.cmd run db:verify:global:railway
```

Alternativa explícita:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-global-db-readonly.ps1
```

El archivo `.env.railway` está ignorado por Git y debe contener exactamente una línea `DATABASE_URL=...` válida. No pegar su valor en terminales compartidas, issues, PR o capturas.

## Diagnóstico del fallo anterior

El error anterior no fue un fallo del esquema Railway. El comando había cargado `backend/.env`, cuya URL apunta a PostgreSQL loopback local. `.env.railway` contiene un TCP Proxy público Railway y es la fuente correcta desde este equipo.

La primera ejecución contra el proxy dentro del sandbox falló por restricción de red. Fuera del sandbox, el proxy resolvió y PostgreSQL respondió. Por tanto:

- `DATABASE_URL` sí está cargada;
- no usa hostname privado `*.railway.internal`;
- el TCP Proxy público es accesible;
- la ausencia de `sslmode` no impidió la conexión observada;
- el fallo actual no es `RAILWAY_READ_EXTERNAL_NETWORK_BLOCKED`.

## Resultado observado y revalidado al 2026-10-01

```json
{
  "status": "FAIL",
  "counts": { "tables": 91, "columns": 897, "pk": 91, "fk": 211, "checks": 33, "indexes": 109 },
  "summary": { "MATCH": 1522, "EXTRA_LEGACY": 6 },
  "classifications": {
    "TECHNICAL_ALLOWED_EXTRA": 1,
    "UNOWNED_EXTRA": 5
  },
  "allowedExtras": 1,
  "missing": 0,
  "different": 5
}
```

Las 91 tablas contractuales están presentes y sus 1.522 verificaciones coinciden. `solicitud_instalacion_integracion`, `integracion_activacion_g1.payload_snapshot` y todos sus objetos esperados están en `MATCH`; el contrato no espera `prospecto_id_cliente_key`.

La primera lectura encontró 92 tablas públicas. La repetición READ ONLY de esta etapa encontró 93:

- 91 tablas funcionales esperadas, incluida `solicitud_instalacion_integracion`;
- `_prisma_migrations`, única tabla técnica permitida;
- `solicitud_clave_wifi`, tabla adicional sin owner ni referencia Git identificados; no equivale automáticamente a `solicitud_contrasena_wifi`.

Además existen cuatro objetos adicionales:

- `lista_negra.nivel`;
- `log_notificacion.id_ot`;
- FK `log_notificacion_id_ot_fkey`;
- índice `log_notificacion_estado_envio_fecha_envio_idx`.

No se eliminaron ni modificaron. El verificador clasifica `_prisma_migrations` como `TECHNICAL_ALLOWED_EXTRA` y los otros cinco objetos como `UNOWNED_EXTRA`. La tabla G3 ya pertenece al contrato y no requiere excepción. Solo el extra técnico está exceptuado, por lo que el resultado continúa en `FAIL`.

## Investigación de cierre

Una introspección adicional, también dentro de una transacción READ ONLY, confirmó sin leer valores de negocio:

- `solicitud_clave_wifi`: 1 fila; 11 columnas; PK; `request_id` único; índice `(id_empresa, estado)`; sin FK, CHECK, trigger, vista o función consumidora detectada.
- `solicitud_contrasena_wifi`: 3 filas y estructura diferente; no es un alias demostrable de la tabla extra.
- `lista_negra`: 3 filas; `nivel varchar(10) NULL` tiene 0 valores no nulos.
- `log_notificacion`: 0 filas; `id_ot integer NULL` tiene 0 valores no nulos. Su FK apunta a `orden_trabajo(id_ot)` con `ON UPDATE CASCADE / ON DELETE SET NULL`.
- `log_notificacion_estado_envio_fecha_envio_idx`: índice B-tree no único y válido sobre `(estado_envio, fecha_envio)`.

Las búsquedas en runtime, Prisma, SQL, migraciones y todas las refs Git accesibles no identificaron DDL de origen ni owner funcional. El rol técnico `postgres` observado en el catálogo no permite atribuir ownership. Por eso los cinco objetos reciben exactamente **C. MANTENER_BLOQUEADO_PENDIENTE_OWNER**. No se eliminan, incorporan ni exceptúan.

## Siguiente decisión de esquema

1. Obtener confirmación escrita del owner y migración/DDL de origen para los cinco `UNOWNED_EXTRA`.
2. Si se propone retiro, inventariar consumidores externos, respaldar y coordinar una ventana; esta etapa no autoriza borrado.
3. Volver a ejecutar el comando después de la decisión contractual, sin relajar el verificador ni permitir extras desconocidos.

El estado actual es `RAILWAY_READ_CONNECTED / GLOBAL_SCHEMA_EXTRA_OBJECTS / FAIL`.

## Verificación posterior al contrato propuesto G2/G3 — 2026-10-01

Se repitió el verificador mediante el mismo wrapper y transacción `READ ONLY`, después de actualizar localmente el contrato a 92 tablas. Railway no fue modificado.

```json
{
  "status": "FAIL",
  "counts": { "tables": 92, "columns": 910, "pk": 92, "fk": 214, "checks": 35, "indexes": 114 },
  "summary": {
    "MATCH": 1522,
    "MISSING_COLUMN": 13,
    "REQUIRES_REVIEW": 4,
    "MISSING_TABLE": 1,
    "MISSING_FK": 3,
    "MISSING_INDEX": 5,
    "EXTRA_LEGACY": 6
  },
  "classifications": {
    "CONTRACT_DIFFERENCE": 26,
    "TECHNICAL_ALLOWED_EXTRA": 1,
    "UNOWNED_EXTRA": 5
  },
  "allowedExtras": 1,
  "missing": 22,
  "different": 9
}
```

Los 26 `CONTRACT_DIFFERENCE` son el delta deliberado y todavía no aplicado del cierre G2: una tabla y sus diez columnas, tres columnas en tablas existentes, una PK, una secuencia, dos checks, tres FK y cinco índices. Los cinco `UNOWNED_EXTRA` permanecen separados y sin reclasificar. El resultado esperado antes de cualquier DDL coordinado es `FAIL`; obtener `PASS` forzando excepciones sería incorrecto.

La trazabilidad completa está en [i3-global-extra-object-resolution.md](i3-global-extra-object-resolution.md).
