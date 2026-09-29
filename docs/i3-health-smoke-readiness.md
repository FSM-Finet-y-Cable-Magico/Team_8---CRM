# Health, readiness y evidencia de lectura

Estado: IMPLEMENTADO_LOCAL. Estos endpoints nuevos no fueron desplegados ni verificados mediante HTTP productivo.

|Ruta|Comprobación|Respuesta|
|---|---|---|
|GET `/api/health`|Proceso disponible|200, `application: UP`|
|GET `/api/ready`|Catálogo PostgreSQL READ ONLY, tipos/nulabilidad y configuración local de clientes|200 con esquema READY/DEGRADED; 503 si la consulta de BD falla|

Readiness compara 876 columnas del contrato canónico generado por `scripts/generate-health-contract.mjs`. Expone `schema_check: TABLES_COLUMNS_TYPES_NULLABILITY`; no certifica FK, índices, defaults ni checks. Para auditoría física completa usar `verify-global-db.mjs`. Si falta `historial_cambio_plan`, el esquema queda DEGRADED; el proceso no se declara DOWN por módulos que sí pueden operar. Consumidores que necesiten todo el contrato deben verificar `global_schema`, no solo el código HTTP.

Se añade `g1_payload_snapshot` para hacer visible la dependencia propuesta separada del contrato canónico. Su presencia no equivale a aprobación de los grupos. `g1_configured`/`g3_configured` solo describen la configuración del proceso; no prueban autenticación ni disponibilidad externa. No se realizan POST ni peticiones externas desde readiness. No se exponen URLs, keys ni mensajes de error originales.

La consulta usa transacción READ ONLY, timeout de sentencia 3 s, transacción 5 s y espera máxima 1 s. Fallos se devuelven saneados como BD DOWN. El `PlanChangeProcessor` mantiene la dependencia P2021 visible, limita el mensaje repetido a una vez cada cinco minutos y no registra un cambio de plan exitoso al faltar la tabla.

## Lectura real realizada

[Evidencia JSON](i3-readiness-railway-read-test.json), `2026-09-29T14:59:36.185Z` (11:59:36 en Santiago). Se invocó directamente el controlador compilado localmente con conexión Railway, sin arrancar AppModule, schedulers ni jobs:

```powershell
node --env-file=.env.railway scripts/probe-readiness-readonly.cjs
```

Resultado: `application=UP`, `database=UP`, `global_schema=DEGRADED`, 429 columnas ausentes y 26 columnas con diferencia de tipo o nulabilidad. `g1_payload_snapshot=PENDING_APPROVAL_OR_RECONCILIATION`; ambos indicadores configured=false en ese proceso de prueba. Esto no permite inferir los flags del servicio Railway desplegado.

La introspección física independiente de las 14:31:10 UTC detectó 33 tablas faltantes, 23 diferencias de tipo, 3 de nulabilidad y 15 de default (algunas en las mismas filas). La diferencia entre conteos obedece al alcance de cada herramienta. Las evidencias son snapshots fechados y deben renovarse antes de ejecutar SQL.

UNIT_TEST valida estados, saneamiento de errores y comportamiento sin BD. RAILWAY_READ_TEST valida la conexión y catálogo reales. G1_REAL_GET_TEST está pendiente por key ausente. G1_REAL_WRITE_TEST no se ejecutó por requerir autorización y datos coordinados. Ninguno se presenta como validación funcional completa del despliegue.
