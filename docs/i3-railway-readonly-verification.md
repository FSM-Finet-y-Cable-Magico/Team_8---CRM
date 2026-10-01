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

## Resultado observado el 2026-09-30

```json
{
  "status": "FAIL",
  "counts": { "tables": 90, "columns": 877, "pk": 90, "fk": 210, "checks": 33, "indexes": 106 },
  "summary": { "MATCH": 1495, "EXTRA_LEGACY": 6 },
  "allowedExtras": 1,
  "missing": 0,
  "different": 5
}
```

Los 90 objetos de tabla contractuales están presentes y sus 1.495 verificaciones coinciden. `integracion_activacion_g1.payload_snapshot` está en `MATCH` y el contrato no espera `prospecto_id_cliente_key`.

La lectura encontró 92 tablas públicas:

- 90 tablas funcionales esperadas;
- `_prisma_migrations`, única tabla técnica permitida;
- `solicitud_instalacion_integracion`, tabla adicional no incluida en el contrato canónico.

Además existen cuatro objetos adicionales:

- `lista_negra.nivel`;
- `log_notificacion.id_ot`;
- FK `log_notificacion_id_ot_fkey`;
- índice `log_notificacion_estado_envio_fecha_envio_idx`.

No se eliminaron ni modificaron. El verificador falla correctamente porque solo `_prisma_migrations` está exceptuada. La confirmación humana previa de 91 tablas quedó desactualizada frente al catálogo actual observado de 92.

## Siguiente decisión de esquema

Los responsables de los grupos deben clasificar los cinco objetos inesperados:

1. Si son cambios globales legítimos, incorporarlos al contrato canónico mediante el procedimiento conjunto y actualizar hash/verificadores.
2. Si son residuos no autorizados, definir un plan de corrección con respaldo y revisión; esta etapa no autoriza eliminarlos.
3. Volver a ejecutar el comando hasta obtener `PASS`, sin relajar el verificador ni permitir extras desconocidos.

El estado actual es `RAILWAY_READ_CONNECTED / GLOBAL_SCHEMA_EXTRA_OBJECTS / FAIL`.
