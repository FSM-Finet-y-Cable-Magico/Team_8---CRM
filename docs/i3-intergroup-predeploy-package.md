# Pre-deploy intergrupos — paquete de migración y smoke

Fecha de preparación: 2026-10-01. Rama: `feature/incremento3`.

Estado: **PAQUETE PREPARADO / NO APLICADO / SIN TRÁFICO EXTERNO**.

Este procedimiento cubre exclusivamente la migración `20261001120000_i3_g2_intergroup_contract` y los smokes coordinados G2/G3. Ningún comando de escritura descrito aquí fue ejecutado durante la preparación.

## 1. Identidad y auditoría de la migración

Archivo exacto:

```text
backend/prisma/migrations/20261001120000_i3_g2_intergroup_contract/migration.sql
SHA-256: c158405ace65ff601b521324d3c0a6dd73893e62f7e5180bc22dc6fde8bee43f
```

Auditor reproducible:

```powershell
node scripts/audit-i3-g2-migration.mjs
```

Resultado observado: `PASS`, 28 expectativas estructurales presentes y `DROP=false`, `TRUNCATE=false`, `DELETE=false`.

La migración es **aditiva en estructura y preservación de filas**: agrega columnas, restricciones, índices, una categoría y una tabla. No renombra ni elimina objetos y no borra filas. Sí contiene dos DML intencionales y no destructivos: un `UPDATE` de backfill sobre `pago.comprobante_estado` y un `INSERT ... WHERE NOT EXISTS` para la categoría WiFi.

### Inventario objeto por objeto

| Objeto final | Tipo / nulabilidad / default | Restricciones e índices |
|---|---|---|
| `prospecto.id_plan_interes` | `INTEGER NULL`, sin default | FK `prospecto_id_plan_interes_fkey` a `plan(id_plan)`, `ON UPDATE CASCADE`, `ON DELETE SET NULL`; índice no único `(id_empresa, id_plan_interes)` |
| `pago.codigo_autorizacion` | `VARCHAR(100) NULL`, sin default | Sin nueva FK/check; nullable por compatibilidad histórica |
| `pago.comprobante_estado` | `VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'` | CHECK `PENDIENTE | GENERADO | FALLIDO` |
| `integracion_resultado_wifi_g2.id_resultado` | `BIGSERIAL PRIMARY KEY` | PK y secuencia propia |
| `.request_id` | `VARCHAR(100) NOT NULL` | índice único `integracion_resultado_wifi_g2_request_id_key` |
| `.trace_id` | `VARCHAR(100) NULL` | — |
| `.id_empresa` | `INTEGER NOT NULL` | FK a `empresa(id_empresa)`, update cascade/delete restrict; índice compuesto con `fecha_recepcion` |
| `.id_ticket` | `INTEGER NOT NULL` | FK a `ticket(id_ticket)`, update cascade/delete restrict; índice compuesto con `fecha_recepcion` |
| `.payload_hash` | `VARCHAR(64) NOT NULL` | — |
| `.exito` | `BOOLEAN NOT NULL` | — |
| `.resultado_tecnico` | `TEXT NOT NULL` | saneamiento aplicado por servicio antes de persistir |
| `.estado_ticket_resultante` | `VARCHAR(20) NOT NULL` | CHECK `Resuelto | Escalado` |
| `.fecha_recepcion` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | índices `(id_empresa, fecha_recepcion)` y `(id_ticket, fecha_recepcion)` |
| `categoria_falla.nombre` | definición existente | índice único nuevo `categoria_falla_nombre_key`; antes se aborta si hay nombres duplicados |
| categoría WiFi | fila `CAMBIO_CREDENCIALES_WIFI`, `sla_horas NULL` | inserción condicional; no duplica el catálogo |

La coherencia compuesta Ticket–Empresa no se impone con una FK compuesta. La garantiza el receptor G2 validando Ticket, Servicio, Cliente, categoría y empresa antes de escribir. Por ello las escrituras directas fuera de la API siguen prohibidas.

### Comportamiento con datos históricos

Preflight Railway del `2026-10-02T00:36:29.597Z`, dentro de una transacción `READ ONLY`:

- las cuatro extensiones todavía no existen;
- la migración no figura en `_prisma_migrations`;
- `pago`: 0 filas, 0 URLs de comprobante;
- `categoria_falla`: 8 filas, 0 nombres duplicados y 0 filas `CAMBIO_CREDENCIALES_WIFI`;
- no se imprimió PII.

Si aparecen pagos antes de la aplicación, el backfill deja `GENERADO` cuando `comprobante_pdf_url` contiene texto no vacío y `PENDIENTE` en los demás casos. `codigo_autorizacion` permanece `NULL` para pagos anteriores. Después del backfill se aplica default, `NOT NULL` y CHECK. Nuevos pagos S2S siguen exigiendo autorización desde el DTO aunque la columna física sea nullable.

### Locks y riesgos

| Operación | Riesgo | Mitigación obligatoria |
|---|---|---|
| `ALTER TABLE ... ADD COLUMN` | bloqueo exclusivo breve sobre `prospecto`/`pago` | ventana de baja actividad; timeout del operador; no reintentar a ciegas |
| FK de `id_plan_interes` | validación y locks sobre `prospecto`/`plan` | la columna nace nullable y sin valores; confirmar nuevamente el catálogo antes de aplicar |
| backfill `UPDATE pago` | locks por fila, WAL y posible espera si aparecen pagos | repetir conteos; con 0 filas el riesgo actual es mínimo |
| `SET NOT NULL` + CHECK | escaneo/validación de `pago` | backfill previo; abortar si quedan nulls o valores fuera del catálogo |
| índices sin `CONCURRENTLY` | bloquean escrituras durante su creación | mantenimiento coordinado; medir tamaños frescos; detener si la espera supera la ventana |
| índice único de categoría | falla si existen duplicados | guard SQL y preflight: actualmente 0 grupos duplicados |
| `CREATE TABLE IF NOT EXISTS` y guardas por nombre | un estado parcial previo podría ocultar una forma incompatible | exigir que los cuatro objetos estén ausentes antes de la primera aplicación; después validar definición completa, no solo existencia |

El archivo no contiene `BEGIN/COMMIT`. Debe aplicarse únicamente mediante el runner de producción acordado y detenerse ante cualquier fallo; no se permite continuar con `resolve` sin una introspección READ ONLY del estado parcial. La versión instalada es Prisma 5.22.0. `prisma migrate deploy` aplica **todas** las migraciones pendientes y no detecta drift, de modo que el operador debe demostrar antes que esta es la única migración pendiente y usar el verificador global para detectar diferencias físicas.

## 2. Compatibilidad y orden obligatorio

| Combinación | Resultado | Evidencia |
|---|---|---|
| `OLD_BACKEND + NEW_SCHEMA` | **SAFE** después de una migración exitosa | `id_plan_interes` y `codigo_autorizacion` son nullable; `comprobante_estado` tiene default; la tabla WiFi es independiente. El backend anterior puede omitir estos campos. La unicidad de categoría solo rechaza duplicados funcionalmente inválidos. |
| `NEW_BACKEND + OLD_SCHEMA` | **UNSAFE** | Prospecto selecciona/escribe `id_plan_interes`; pagos usan `codigo_autorizacion` y `comprobante_estado`; el receptor WiFi requiere `integracion_resultado_wifi_g2`. Esos flujos fallarían por columna/tabla ausente. |

Orden obligatorio:

```text
BACKUP_VALIDADO
→ PREFLIGHT_READ_ONLY_FRESCO
→ SCHEMA_MIGRATION_20261001120000
→ VERIFICACION_READ_ONLY
→ BACKEND_NUEVO
→ HEALTH_READY
→ CONFIGURACION_KEYS_COORDINADA
→ SMOKES_QA_AUTORIZADOS
```

Valor compacto: `SCHEMA_THEN_READONLY_VERIFICATION_THEN_BACKEND`.

## 3. CHECKLIST_DE_APLICACION

### PRE

- [ ] Aprobación explícita de G2, G3 y G8, operador, ventana y plan de reversa.
- [ ] Backup nuevo de Railway, cifrado, con checksum y prueba de restauración fuera de producción.
- [ ] Confirmar que los dumps versionados del repositorio **no** se usarán como backup operativo.
- [ ] Congelar cambios concurrentes de schema y escrituras administrativas sobre Pago, Prospecto y categorías.
- [ ] Verificar hash del archivo: `c158405ace65ff601b521324d3c0a6dd73893e62f7e5180bc22dc6fde8bee43f`.
- [ ] Verificar hash del canónico: `6f3c9afdfc8693730a26a4f7f3dc58e81e0046ee74136daef077e39bce8ab20e`.
- [ ] Ejecutar `node scripts/audit-i3-g2-migration.mjs` y exigir `PASS`.
- [ ] Ejecutar `scripts/preflight-i3-g2-migration-readonly.ps1`; exigir objetos ausentes, migración no aplicada y cero categorías duplicadas.
- [ ] Ejecutar `scripts/verify-global-db-readonly.ps1`; conservar el delta previo esperado de 26 diferencias contractuales, 1 extra técnico y 5 extras sin owner.
- [ ] Ejecutar `npx prisma migrate status --schema backend/prisma/schema.prisma` con conexión directa autorizada.
- [ ] Confirmar que la única migración pendiente es `20261001120000_i3_g2_intergroup_contract`.
- [ ] Confirmar que no existe otra instancia de `migrate deploy` y que el advisory lock de Prisma no está desactivado.
- [ ] Tener identificados los registros QA G2 y G3; ninguna prueba puede usar clientes reales.

### APPLY — solo operador autorizado

- [ ] Mantener desplegado el backend anterior.
- [ ] Ejecutar exactamente `npx prisma migrate deploy --schema backend/prisma/schema.prisma` desde el artefacto revisado.
- [ ] No ejecutar seed.
- [ ] No ejecutar `prisma db push`.
- [ ] No ejecutar `prisma migrate dev` ni `migrate reset`.
- [ ] No editar el SQL después de aprobar su hash.
- [ ] Ante error: detener aplicación/deploy; no usar `migrate resolve` hasta identificar por catálogo qué sentencias quedaron aplicadas.

`migrate deploy` aplica todas las migraciones pendientes y no comprueba drift; por eso el control “única pendiente” y el verificador global son obligatorios.

### POST SCHEMA

- [ ] Repetir `scripts/preflight-i3-g2-migration-readonly.ps1`: cuatro objetos presentes y migración terminada/no revertida.
- [ ] Repetir `scripts/verify-global-db-readonly.ps1`.
- [ ] Esperado: las 26 `CONTRACT_DIFFERENCE` nuevas pasan a `MATCH`; los cinco `UNOWNED_EXTRA` y `_prisma_migrations` permanecen separados. El verificador puede conservar estado global `FAIL` exclusivamente por los cinco extras sin owner.
- [ ] Ejecutar `npm.cmd run db:audit:prisma-global` y archivar resultado.
- [ ] Ejecutar Prisma validate/generate y build desde el mismo commit candidato.
- [ ] Desplegar el backend nuevo solo después de las verificaciones anteriores.
- [ ] Verificar `GET /api/health` y `GET /api/ready`; exigir proceso/BD disponibles y cero columnas contractuales ausentes o diferentes.
- [ ] Configurar las keys por el operador Railway, sin imprimirlas; verificar únicamente presencia y scopes.
- [ ] Ejecutar smokes solo con autorización conjunta y registros QA dedicados.

## 4. Rollback lógico/manual documentado

El rollback preferido es lógico y preserva datos:

1. detener smokes y tráfico hacia los cinco endpoints nuevos;
2. volver al backend anterior;
3. conservar el schema aditivo aplicado: `OLD_BACKEND + NEW_SCHEMA` es compatible;
4. conservar cualquier fila creada en `integracion_resultado_wifi_g2`, pagos y preferencia de Plan;
5. investigar y corregir en una migración posterior versionada.

No debe ejecutarse un rollback físico automático. Para considerar una limpieza física manual, un DBA debe exportar primero los datos nuevos y demostrar simultáneamente:

- cero filas en `integracion_resultado_wifi_g2`;
- cero valores no null en `prospecto.id_plan_interes` y `pago.codigo_autorizacion`;
- `pago.comprobante_estado` no es consumido por ningún backend activo;
- la categoría WiFi no está referenciada por Ticket;
- backend anterior restaurado y no hay workers nuevos activos.

Solo entonces una nueva migración revisada podría retirar, en orden, índices/constraints dependientes, tabla WiFi y columnas. No se debe borrar la categoría si algún Ticket la referencia. No se preparó ni ejecutó SQL destructivo.

Si Prisma registra una migración fallida, primero se captura catálogo y `_prisma_migrations` en READ ONLY. `prisma migrate resolve` requiere decisión del operador basada en esa evidencia; nunca se marca `--applied` por conveniencia.

## 5. Paquete de smoke preparado, no ejecutado

Script canónico:

```powershell
# Seguro: solo imprime DRY_RUN_ONLY.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-i3-intergroups.ps1

# Futuro, únicamente después de completar el checklist y obtener aprobación:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-i3-intergroups.ps1 -Execute
```

El script requiere `I3_COORDINATED_SMOKE_APPROVED=YES` e `I3_QA_RECORDS_VERIFIED=YES`, además de variables de endpoint, credenciales e IDs QA. No contiene keys literales y no las imprime.

Variables requeridas:

```text
G8_API_URL
G8_OPERATOR_JWT
G8_G2_API_KEY
G8_G3_API_KEY
G3_API_URL
G3_API_KEY
I3_COMPANY_ID
I3_G2_QA_RUT
I3_G2_QA_INVOICE_ID
I3_G2_QA_PAYMENT_AMOUNT
I3_G2_QA_PAYMENT_DATE
I3_G2_QA_PAYMENT_AUTH_CODE
I3_G2_QA_PAYMENT_TX
I3_G2_QA_TICKET_ID
I3_G2_WIFI_REQUEST_ID
I3_G2_WIFI_TRACE_ID (opcional)
I3_G3_QA_PROSPECT_ID
I3_G3_QA_CONTRACT_ID
```

### Secuencia G2

```bash
curl --fail-with-body -sS "$G8_API_URL/api/integrations/g2/invoices?id_empresa=$I3_COMPANY_ID&rut=$I3_G2_QA_RUT&page=1&page_size=5" \
  -H "X-API-KEY: $(printenv G8_G2_API_KEY)"

curl --fail-with-body -sS "$G8_API_URL/api/integrations/g2/invoices/$I3_G2_QA_INVOICE_ID?id_empresa=$I3_COMPANY_ID" \
  -H "X-API-KEY: $(printenv G8_G2_API_KEY)"

curl --fail-with-body -sS -X POST "$G8_API_URL/api/integrations/g2/payments" \
  -H "X-API-KEY: $(printenv G8_G2_API_KEY)" -H "Content-Type: application/json" \
  --data "{\"id_empresa\":$I3_COMPANY_ID,\"id_factura\":$I3_G2_QA_INVOICE_ID,\"monto\":$I3_G2_QA_PAYMENT_AMOUNT,\"fecha_pago\":\"$I3_G2_QA_PAYMENT_DATE\",\"codigo_autorizacion\":\"$I3_G2_QA_PAYMENT_AUTH_CODE\",\"codigo_transaccion\":\"$I3_G2_QA_PAYMENT_TX\",\"pasarela\":\"QA_COORDINADA_G2\"}"

curl --fail-with-body -sS "$G8_API_URL/api/integrations/g2/payments/$I3_G2_QA_PAYMENT_ID/comprobante?id_empresa=$I3_COMPANY_ID" \
  -H "X-API-KEY: $(printenv G8_G2_API_KEY)"

curl --fail-with-body -sS -X POST "$G8_API_URL/api/integrations/g2/tickets/$I3_G2_QA_TICKET_ID/wifi-result" \
  -H "X-API-KEY: $(printenv G8_G2_API_KEY)" -H "Content-Type: application/json" \
  --data "{\"id_ticket\":$I3_G2_QA_TICKET_ID,\"id_empresa\":$I3_COMPANY_ID,\"resultado_tecnico\":\"Resultado QA saneado; no contiene credenciales ni secretos.\",\"resultado\":\"REQUIERE_ATENCION_MANUAL\",\"request_id\":\"$I3_G2_WIFI_REQUEST_ID\",\"trace_id\":\"$I3_G2_WIFI_TRACE_ID\"}"
```

La lectura inicial exige `id_empresa` más RUT normalizado; también puede usarse `id_cliente` o `id_contrato`, pero nunca solo la empresa. El pago requiere una Factura QA abierta y un monto positivo que no supere su saldo. La fecha y los códigos deben mantenerse idénticos si se prueba la idempotencia.

El Ticket QA debe pertenecer al mismo Cliente/Servicio/Empresa y usar exactamente `CAMBIO_CREDENCIALES_WIFI`.
Mientras G3 deje el cambio para intervención manual, el resultado G2 es `REQUIERE_ATENCION_MANUAL`.

### Secuencia G3

El script PowerShell ejecuta esta cadena:

1. `POST G8 /api/integrations/g3/installations` con JWT e IDs del candidato. G8 persiste snapshot/request/trace y realiza el `POST /api/integraciones/instalaciones` hacia G3.
2. `POST G8 /api/integrations/g3/installations/:id/retry`. El backend debe reenviar el snapshot idéntico; el script compara `requestId` y `traceId`.
3. `GET G3 /api/integraciones/ordenes/:id_ot` con `G3_API_KEY`.
4. `POST G8 /api/integraciones/fsm/ordenes/:id_ot/cierre` con principal G3 y correlaciones completas.
5. `POST G8 /api/integrations/g3/installations/:id/reconcile` con JWT. G8 consulta el GET de cierre G3, acepta solo el cierre completado y comprueba la deduplicación con el mismo processor.

Equivalentes curl para las rutas de control:

```bash
curl --fail-with-body -sS -X POST "$G8_API_URL/api/integrations/g3/installations" \
  -H "Authorization: Bearer $G8_OPERATOR_JWT" -H "Content-Type: application/json" \
  --data "{\"idProspecto\":$I3_G3_QA_PROSPECT_ID,\"idContrato\":$I3_G3_QA_CONTRACT_ID}"

curl --fail-with-body -sS -X POST "$G8_API_URL/api/integrations/g3/installations/$I3_G3_TRACKING_ID/retry" \
  -H "Authorization: Bearer $G8_OPERATOR_JWT"

curl --fail-with-body -sS "$G3_API_URL/api/integraciones/ordenes/$I3_G3_QA_OT_ID" \
  -H "X-API-KEY: $(printenv G3_API_KEY)"

curl --fail-with-body -sS -X POST "$G8_API_URL/api/integraciones/fsm/ordenes/$I3_G3_QA_OT_ID/cierre" \
  -H "X-API-KEY: $(printenv G8_G3_API_KEY)" -H "Content-Type: application/json" \
  --data @g3-closure-qa.json
```

El cierre del script usa el payload approval-only real, sin `estado`, con todas las correlaciones y `equipos_instalados=[]`/`equipos_retirados=[]`. La ruta interpreta una recepción válida como `COMPLETADA`. Los arrays vacíos evitan un POST externo G1 por cascada; G1 queda pendiente de datos de equipo. Aun así, el cierre crea/activa Cliente y Servicio G8, de modo que solo puede usarse con un registro QA dedicado aprobado.

## 6. Candidato G3

### Alternativa A — existente

Consulta reproducible:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/find-g3-smoke-candidate-readonly.ps1 -CompanyId 1
```

Lectura fresca `2026-10-02T00:31:44.224Z`: 12 contratos examinados, 0 candidatos. En todos faltan Prospecto coherente y factibilidad; los 12 ya tienen Cliente asociado. Ocho tampoco están firmados/activos. No se imprimió RUT, nombre, teléfono ni dirección.

### Alternativa B — registro QA dedicado por flujos normales

No se crea mediante SQL. G8 debe generar, mediante sus endpoints/UI normales:

1. **Plan:** activo, empresa 1 y `tipo_plan` convertible a un tipo de Servicio soportado.
2. **Prospecto:** empresa 1, sin Cliente asociado, RUT chileno válido, nombre, móvil `+569XXXXXXXX`, dirección y comuna; email opcional; `id_plan_interes` igual al Plan QA.
3. **Cotización:** mismo Prospecto y Plan, `factibilidad_verificada=true`.
4. **Contrato:** empresa/Prospecto/Plan anteriores, estado `Firmado`, `id_cliente=NULL`, fecha/día de vencimiento válidos y snapshot de dirección/comuna.
5. **Ausencias obligatorias:** ningún `servicio_contratado` para el Contrato y ningún tracking G3 activo para el Contrato.
6. **Control humano:** confirmar que RUT/contacto pertenecen a identidad QA autorizada y que el eventual Cliente/Servicio puede conservarse o cerrarse mediante flujo normal.

Después de crear estos datos se repite el buscador READ ONLY. Solo un resultado con `candidateCount >= 1` habilita completar `I3_G3_QA_PROSPECT_ID` e `I3_G3_QA_CONTRACT_ID`.

## 7. Dumps versionados

Ambos archivos están trackeados por Git y son dumps PostgreSQL custom (`PGDMP`):

| Archivo | Tamaño | Entradas `TABLE DATA`/`COPY` | SHA-256 |
|---|---:|---:|---|
| `output/backups/crm-before-develop-20260911.dump` | 4.023.448 bytes | 59 / 59 | `554e0f83783d732c1224f90745b3b168fa7fe607501094ac04865c3fe164cbdb` |
| `output/backups/before-crm-final.dump` | 4.040.712 bytes | 61 / 61 | `30202d4db20fbde5d2f5ca0ebcb8958fed6cc05434a854a2a34119fc96fa55dc` |

La presencia de secciones `TABLE DATA` demuestra que no son schema-only. No se extrajeron filas ni valores. `pg_restore` no está disponible en este entorno, por lo que no fue posible clasificar de manera segura su origen o demostrar anonimización. Deben tratarse como **potencialmente productivos**.

Bloqueo: no publicar el repositorio ni esos blobs hasta que el owner de datos confirme origen y anonimización. La remediación debe acordar retiro del árbol e historial cuando corresponda; esta etapa no borra archivos ni reescribe Git.

## 8. Estado de salida

```text
MIGRATION_READY=true
DEPLOY_ORDER=SCHEMA_THEN_READONLY_VERIFICATION_THEN_BACKEND
G2_SMOKE_READY=false
G3_SMOKE_READY=false
DUMPS_RELEASE_BLOCKER=true
INTERGROUP_READY_FOR_COORDINATED_MIGRATION=true

RAILWAY_MODIFIED=false
DDL_DML_RAILWAY=0
REAL_EXTERNAL_POSTS=0
COMMIT=false
PUSH=false
MERGE=false
DEPLOY=false
```

Los paquetes de smoke están listos, pero sus flags permanecen `false` para ejecución inmediata: faltan migración aplicada, backend desplegado, keys/scopes, aprobación y registros QA; G3 además no tiene candidato actual. `INTERGROUP_READY_FOR_COORDINATED_MIGRATION=true` significa que el artefacto, orden y controles están listos para revisión/aplicación coordinada; no significa autorización para ejecutarlos.
